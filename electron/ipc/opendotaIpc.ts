import { ipcMain } from 'electron'
import type {
  AppState,
  HeroMatchupCache,
  HeroMatchupSyncResult,
  HeroTimingCache,
  HeroTimingSyncResult,
  OpenDotaImportedMatch,
  OpenDotaParseRequestResult,
  OpenDotaRecentMatch,
  PositionMetaSnapshot,
  PositionMetaSyncResult,
  StratzRankBracket,
} from '../../src/types'
import { parseHeroMatchupCache, parseHeroTimingCache } from '../../src/schema/persistence.ts'

type ElectronStoreLike = {
  get: (key: string, defaultValue?: unknown) => unknown
}

export interface OpenDotaIpcServices {
  normalizeMatchId: (matchIdInput: string) => string
  getOpenDotaAccountId: () => string
  fetchOpenDotaImportedMatch: (matchId: string, accountId: string, timeoutMs?: number) => Promise<OpenDotaImportedMatch>
  fetchStratzImportedMatch: (matchId: string, accountId: string, apiKey: string) => Promise<OpenDotaImportedMatch>
  autoImportLatestOpenDotaMatch: (existingMatchIds?: string[], stratzApiKey?: string) => Promise<OpenDotaImportedMatch>
  listRecentOpenDotaMatches: (existingMatchIds?: string[]) => Promise<OpenDotaRecentMatch[]>
  requestOpenDotaParse: (matchId: string, timeoutMs?: number) => Promise<OpenDotaParseRequestResult>
  requestStratzMatchDownload: (matchId: string, apiKey: string) => Promise<OpenDotaParseRequestResult>
  syncOpenDotaHeroMatchups: (force?: boolean) => Promise<HeroMatchupSyncResult>
  syncStratzHeroMatchups: (apiKey: string, rankBracket: StratzRankBracket, force?: boolean) => Promise<HeroMatchupSyncResult>
  syncHeroTimings: (force?: boolean) => Promise<HeroTimingSyncResult>
  syncStratzHeroTimings: (apiKey: string, rankBracket: StratzRankBracket, force?: boolean) => Promise<HeroTimingSyncResult>
  getHeroTimingSyncProgress: () => { completed: number; total: number } | null
  syncStratzPositionMeta: (apiKey: string, rankBracket: StratzRankBracket, force?: boolean) => Promise<PositionMetaSyncResult>
  getPositionMetaCache: () => PositionMetaSnapshot
}

export function registerOpenDotaIpcHandlers(store: ElectronStoreLike, services: OpenDotaIpcServices) {
  // Stratz 偶尔会因为账号 IP 绑定、限流等跟这场比赛数据本身无关的原因整体拒绝请求
  // （实测遇到过"You cannot use different IP Addresses"这种账号级错误），这类失败没有
  // 重试价值——直接摔给用户之前，先退回 OpenDota 试一次，两边都失败再把 Stratz 的错误抛出去
  // （错误信息通常比 OpenDota 那边更贴近真实原因）。
  async function fetchImportedMatchWithFallback(matchId: string, accountId: string, stratzApiKey: string | undefined): Promise<OpenDotaImportedMatch> {
    if (!stratzApiKey) return services.fetchOpenDotaImportedMatch(matchId, accountId)
    try {
      return await services.fetchStratzImportedMatch(matchId, accountId, stratzApiKey)
    } catch (stratzError) {
      try {
        return await services.fetchOpenDotaImportedMatch(matchId, accountId)
      } catch {
        throw stratzError
      }
    }
  }

  ipcMain.handle('opendota:importMatch', async (_, matchIdInput: string): Promise<OpenDotaImportedMatch> => {
    const matchId = services.normalizeMatchId(matchIdInput)
    const accountId = services.getOpenDotaAccountId()
    const appState = store.get('appState') as AppState
    const stratzApiKey = appState.stratz?.apiKey?.trim()
    return fetchImportedMatchWithFallback(matchId, accountId, stratzApiKey)
  })

  ipcMain.handle('opendota:autoImportLatestMatch', async (_, existingMatchIds?: string[]): Promise<OpenDotaImportedMatch> => {
    const appState = store.get('appState') as AppState
    const stratzApiKey = appState.stratz?.apiKey?.trim()
    return services.autoImportLatestOpenDotaMatch(Array.isArray(existingMatchIds) ? existingMatchIds : [], stratzApiKey)
  })

  ipcMain.handle('opendota:getRecentMatches', async (_, existingMatchIds?: string[]): Promise<OpenDotaRecentMatch[]> => {
    return services.listRecentOpenDotaMatches(Array.isArray(existingMatchIds) ? existingMatchIds : [])
  })

  ipcMain.handle('opendota:requestParse', async (_, matchIdInput: string): Promise<OpenDotaParseRequestResult> => {
    const matchId = services.normalizeMatchId(matchIdInput)
    const appState = store.get('appState') as AppState
    const stratzApiKey = appState.stratz?.apiKey?.trim()
    if (!stratzApiKey) {
      return services.requestOpenDotaParse(matchId)
    }
    // 导入那一步是"Stratz 失败就退回 OpenDota"，所以这里请求解析要两边都触发一次——
    // Stratz 的 retryMatchDownload 哪怕"成功"（不管返回 true 还是 false 都不报错）也不代表
    // 这场比赛真的会被处理好，实测遇到过 Stratz 卡住好几天不出结果、但 OpenDota 一请求解析
    // 就好了的情况；只请求 Stratz 会导致 OpenDota 那边一直没被真正触发过解析。
    const [stratzResult, openDotaResult] = await Promise.allSettled([
      services.requestStratzMatchDownload(matchId, stratzApiKey),
      services.requestOpenDotaParse(matchId),
    ])
    if (stratzResult.status === 'rejected' && openDotaResult.status === 'rejected') {
      throw stratzResult.reason
    }
    const message = [stratzResult, openDotaResult]
      .map(result => result.status === 'fulfilled' ? result.value.message : undefined)
      .filter((msg): msg is string => Boolean(msg))
      .join(' ')
    return { matchId, message }
  })

  ipcMain.handle('opendota:getHeroMatchupCache', (): HeroMatchupCache | null => {
    const raw = store.get('heroMatchupCache', null)
    return raw ? parseHeroMatchupCache(raw) as HeroMatchupCache : null
  })

  ipcMain.handle('opendota:syncHeroMatchups', async (_, force?: boolean): Promise<HeroMatchupSyncResult> => {
    const appState = store.get('appState') as AppState
    const stratzApiKey = appState.stratz?.apiKey?.trim()
    if (stratzApiKey) {
      return services.syncStratzHeroMatchups(stratzApiKey, appState.stratz?.rankBracket ?? 'ALL', Boolean(force))
    }
    const raw = store.get('heroMatchupCache', null)
    const cache = raw ? parseHeroMatchupCache(raw) as HeroMatchupCache : null
    if (cache?.source === 'stratz' && cache.matchupCount > 0) {
      return {
        status: 'stale',
        message: 'matchup 数据源已固定为 Stratz；未配置 Stratz API Key，继续使用本地 Stratz 缓存。',
        cache,
      }
    }
    throw new Error('matchup 数据源已固定为 Stratz。请在设置页填写 Stratz API Key 后同步矩阵。')
  })

  ipcMain.handle('opendota:getHeroTimingCache', (): HeroTimingCache | null => {
    const raw = store.get('heroTimingCache', null)
    return raw ? parseHeroTimingCache(raw) as HeroTimingCache : null
  })

  ipcMain.handle('opendota:syncHeroTimings', async (_, force?: boolean): Promise<HeroTimingSyncResult> => {
    const appState = store.get('appState') as AppState
    const stratzApiKey = appState.stratz?.apiKey?.trim()
    if (stratzApiKey) {
      return services.syncStratzHeroTimings(stratzApiKey, appState.stratz?.rankBracket ?? 'ALL', Boolean(force))
    }
    return services.syncHeroTimings(Boolean(force))
  })

  ipcMain.handle('opendota:getHeroTimingSyncProgress', (): { completed: number; total: number } | null => {
    return services.getHeroTimingSyncProgress()
  })

  ipcMain.handle('opendota:getPositionMetaCache', (): PositionMetaSnapshot => {
    return services.getPositionMetaCache()
  })

  ipcMain.handle('opendota:syncPositionMeta', async (_, force?: boolean): Promise<PositionMetaSyncResult> => {
    const appState = store.get('appState') as AppState
    const stratzApiKey = appState.stratz?.apiKey?.trim()
    if (stratzApiKey) {
      return services.syncStratzPositionMeta(stratzApiKey, appState.stratz?.rankBracket ?? 'ALL', Boolean(force))
    }
    const cache = services.getPositionMetaCache()
    return {
      status: 'stale',
      message: '位置热门英雄数据源已固定为 Stratz；未配置 Stratz API Key，继续使用本地快照。',
      cache,
    }
  })
}
