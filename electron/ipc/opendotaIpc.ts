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
