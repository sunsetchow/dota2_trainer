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
  // 赛后数据只要 Stratz——配置了 Key 就只走 Stratz，不退回 OpenDota，避免两边数据口径
  // 不一致（字段覆盖范围、对线结果算法等都不一样）。没配置 Key 时继续用 OpenDota。
  async function fetchImportedMatch(matchId: string, accountId: string, stratzApiKey: string | undefined): Promise<OpenDotaImportedMatch> {
    if (stratzApiKey) return services.fetchStratzImportedMatch(matchId, accountId, stratzApiKey)
    return services.fetchOpenDotaImportedMatch(matchId, accountId)
  }

  ipcMain.handle('opendota:importMatch', async (_, matchIdInput: string): Promise<OpenDotaImportedMatch> => {
    const matchId = services.normalizeMatchId(matchIdInput)
    const accountId = services.getOpenDotaAccountId()
    const appState = store.get('appState') as AppState
    const stratzApiKey = appState.stratz?.apiKey?.trim()
    return fetchImportedMatch(matchId, accountId, stratzApiKey)
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
    if (stratzApiKey) return services.requestStratzMatchDownload(matchId, stratzApiKey)
    return services.requestOpenDotaParse(matchId)
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
