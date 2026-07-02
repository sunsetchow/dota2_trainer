import { ipcMain } from 'electron'
import type {
  AppState,
  HeroMatchupCache,
  HeroMatchupSyncResult,
  OpenDotaImportedMatch,
  OpenDotaParseRequestResult,
  OpenDotaRecentMatch,
  StratzRankBracket,
} from '../../src/types'
import { parseHeroMatchupCache } from '../../src/schema/persistence.ts'

type ElectronStoreLike = {
  get: (key: string, defaultValue?: unknown) => unknown
}

export interface OpenDotaIpcServices {
  normalizeMatchId: (matchIdInput: string) => string
  getOpenDotaAccountId: () => string
  fetchOpenDotaImportedMatch: (matchId: string, accountId: string, timeoutMs?: number) => Promise<OpenDotaImportedMatch>
  autoImportLatestOpenDotaMatch: (existingMatchIds?: string[]) => Promise<OpenDotaImportedMatch>
  listRecentOpenDotaMatches: (existingMatchIds?: string[]) => Promise<OpenDotaRecentMatch[]>
  requestOpenDotaParse: (matchId: string, timeoutMs?: number) => Promise<OpenDotaParseRequestResult>
  syncOpenDotaHeroMatchups: (force?: boolean) => Promise<HeroMatchupSyncResult>
  syncStratzHeroMatchups: (apiKey: string, rankBracket: StratzRankBracket, force?: boolean) => Promise<HeroMatchupSyncResult>
  sleep: (ms: number) => Promise<void>
}

export function registerOpenDotaIpcHandlers(store: ElectronStoreLike, services: OpenDotaIpcServices) {
  ipcMain.handle('opendota:importMatch', async (_, matchIdInput: string): Promise<OpenDotaImportedMatch> => {
    const matchId = services.normalizeMatchId(matchIdInput)
    return services.fetchOpenDotaImportedMatch(matchId, services.getOpenDotaAccountId())
  })

  ipcMain.handle('opendota:autoImportLatestMatch', async (_, existingMatchIds?: string[]): Promise<OpenDotaImportedMatch> => {
    return services.autoImportLatestOpenDotaMatch(Array.isArray(existingMatchIds) ? existingMatchIds : [])
  })

  ipcMain.handle('opendota:getRecentMatches', async (_, existingMatchIds?: string[]): Promise<OpenDotaRecentMatch[]> => {
    return services.listRecentOpenDotaMatches(Array.isArray(existingMatchIds) ? existingMatchIds : [])
  })

  ipcMain.handle('opendota:requestParse', async (_, matchIdInput: string): Promise<OpenDotaParseRequestResult> => {
    const matchId = services.normalizeMatchId(matchIdInput)
    return services.requestOpenDotaParse(matchId)
  })

  ipcMain.handle('opendota:analyzeAndImportMatch', async (_, matchIdInput: string): Promise<OpenDotaImportedMatch> => {
    const matchId = services.normalizeMatchId(matchIdInput)
    const accountId = services.getOpenDotaAccountId()

    await services.requestOpenDotaParse(matchId)

    let lastError: Error | null = null
    for (let attempt = 0; attempt < 9; attempt++) {
      if (attempt > 0) await services.sleep(10_000)
      try {
        return await services.fetchOpenDotaImportedMatch(matchId, accountId, 20_000)
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error))
        const message = lastError.message
        const probablyStillParsing = message.includes('解析') || message.includes('HTTP 500') || message.includes('HTTP 404') || message.includes('没有返回玩家明细')
        if (!probablyStillParsing) throw lastError
      }
    }

    throw new Error(lastError?.message ?? 'OpenDota 已收到解析请求，但 90 秒内还没有返回详细数据。请稍后再点“导入”。')
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
    return services.syncOpenDotaHeroMatchups(Boolean(force))
  })
}
