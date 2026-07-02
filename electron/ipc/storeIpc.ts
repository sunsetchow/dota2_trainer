import { dialog, ipcMain } from 'electron'
import { writeFile } from 'fs/promises'
import type { AppState, DailyCheckin, HeroNote, MatchLog, MMRLog, PreGameSetup, TrainingCycle } from '../../src/types'
import {
  CURRENT_SCHEMA_VERSION,
  normalizeSchemaVersion,
  parseAppStatePatch,
  parseBackupData,
  parseDailyCheckin,
  parseHeroBenchmarkCacheMap,
  parseHeroMatchupCache,
  parseHeroNote,
  parseImportedBackupJson,
  parseMatchLog,
  parseMatchLogPatch,
  parseMMRLog,
  parsePreGameSetup,
  parsePreGameSetupPatch,
  parseTrainingCycle,
} from '../../src/schema/persistence.ts'

type PersistedStoreKey =
  | 'appState'
  | 'cycles'
  | 'matchLogs'
  | 'preGameSetups'
  | 'dailyCheckins'
  | 'mmrLogs'
  | 'heroNotes'
  | 'heroMatchupCache'
  | 'heroBenchmarkCache'

type ElectronStoreLike = {
  get: (key: string, defaultValue?: unknown) => unknown
  set: (key: string, value: unknown) => void
}

const PERSISTED_STORE_KEYS: PersistedStoreKey[] = [
  'appState',
  'cycles',
  'matchLogs',
  'preGameSetups',
  'dailyCheckins',
  'mmrLogs',
  'heroNotes',
  'heroMatchupCache',
  'heroBenchmarkCache',
]

export function getValidatedAppState(store: ElectronStoreLike): AppState {
  return parseBackupData({ appState: store.get('appState') }).appState as AppState
}

export function getValidatedMatchLogs(store: ElectronStoreLike): MatchLog[] {
  return parseBackupData({ matchLogs: store.get('matchLogs', []) }).matchLogs ?? []
}

export function getValidatedPreGameSetups(store: ElectronStoreLike): PreGameSetup[] {
  return parseBackupData({ preGameSetups: store.get('preGameSetups', []) }).preGameSetups ?? []
}

export function getValidatedDailyCheckins(store: ElectronStoreLike): DailyCheckin[] {
  return parseBackupData({ dailyCheckins: store.get('dailyCheckins', []) }).dailyCheckins ?? []
}

export function getValidatedMMRLogs(store: ElectronStoreLike): MMRLog[] {
  return parseBackupData({ mmrLogs: store.get('mmrLogs', []) }).mmrLogs ?? []
}

export function getValidatedHeroNotes(store: ElectronStoreLike): HeroNote[] {
  return parseBackupData({ heroNotes: store.get('heroNotes', []) }).heroNotes ?? []
}

export function getValidatedCycles(store: ElectronStoreLike): TrainingCycle[] {
  return parseBackupData({ cycles: store.get('cycles', []) }).cycles ?? []
}

function recoverHeroMatchupCache(store: ElectronStoreLike) {
  const raw = store.get('heroMatchupCache', null)
  if (raw === null || raw === undefined) return null
  try {
    return parseHeroMatchupCache(raw)
  } catch (error) {
    console.warn('[store:migrate] 清理无效 heroMatchupCache：', error instanceof Error ? error.message : error)
    store.set('heroMatchupCache', null)
    return null
  }
}

function recoverHeroBenchmarkCache(store: ElectronStoreLike) {
  const raw = store.get('heroBenchmarkCache', {})
  try {
    return parseHeroBenchmarkCacheMap(raw)
  } catch (error) {
    console.warn('[store:migrate] 清理无效 heroBenchmarkCache：', error instanceof Error ? error.message : error)
    store.set('heroBenchmarkCache', {})
    return {}
  }
}

export function getValidatedStoreSnapshot(store: ElectronStoreLike) {
  const safeAppState = getValidatedAppState(store)
  return parseBackupData({
    schemaVersion: normalizeSchemaVersion(store.get('schemaVersion', 0)),
    appState: safeAppState,
    cycles: getValidatedCycles(store),
    matchLogs: getValidatedMatchLogs(store),
    preGameSetups: getValidatedPreGameSetups(store),
    dailyCheckins: getValidatedDailyCheckins(store),
    mmrLogs: getValidatedMMRLogs(store),
    heroNotes: getValidatedHeroNotes(store),
    heroMatchupCache: recoverHeroMatchupCache(store),
    heroBenchmarkCache: recoverHeroBenchmarkCache(store),
  })
}

export function validateAndMigratePersistedStore(store: ElectronStoreLike) {
  store.set('schemaVersion', CURRENT_SCHEMA_VERSION)
  store.set('appState', getValidatedAppState(store))
  store.set('cycles', getValidatedCycles(store))
  store.set('matchLogs', getValidatedMatchLogs(store))
  store.set('preGameSetups', getValidatedPreGameSetups(store))
  store.set('dailyCheckins', getValidatedDailyCheckins(store))
  store.set('mmrLogs', getValidatedMMRLogs(store))
  store.set('heroNotes', getValidatedHeroNotes(store))
  store.set('heroMatchupCache', recoverHeroMatchupCache(store))
  store.set('heroBenchmarkCache', recoverHeroBenchmarkCache(store))
}

export function registerStoreIpcHandlers(store: ElectronStoreLike, todayKey: () => string) {
  ipcMain.handle('store:getAppState', () => getValidatedAppState(store))
  ipcMain.handle('store:setAppState', (_, partial: unknown) => {
    const current = store.get('appState') as AppState
    const parsed = parseAppStatePatch(partial) as Partial<AppState>
    store.set('appState', { ...current, ...parsed })
  })

  ipcMain.handle('store:addMatchLog', (_, log: unknown) => {
    const logs = store.get('matchLogs', []) as MatchLog[]
    const parsed = parseMatchLog(log) as MatchLog
    store.set('matchLogs', [...logs, parsed])
  })
  ipcMain.handle('store:getMatchLogs', () => getValidatedMatchLogs(store))
  ipcMain.handle('store:updateMatchLog', (_, id: string, patch: unknown) => {
    const logs = store.get('matchLogs', []) as MatchLog[]
    const parsed = parseMatchLogPatch(patch) as Partial<MatchLog>
    store.set('matchLogs', logs.map(l => l.id === id ? { ...l, ...parsed } : l))
  })

  ipcMain.handle('store:addPreGameSetup', (_, s: unknown) => {
    const setups = store.get('preGameSetups', []) as PreGameSetup[]
    const parsed = parsePreGameSetup(s) as PreGameSetup
    store.set('preGameSetups', [...setups, parsed])
  })
  ipcMain.handle('store:getPreGameSetups', () => getValidatedPreGameSetups(store))
  ipcMain.handle('store:updatePreGameSetup', (_, id: string, patch: unknown) => {
    const setups = store.get('preGameSetups', []) as PreGameSetup[]
    const parsed = parsePreGameSetupPatch(patch) as Partial<PreGameSetup>
    store.set('preGameSetups', setups.map(s => s.id === id ? { ...s, ...parsed } : s))
  })

  function upsertDailyCheckin(c: unknown): DailyCheckin[] {
    const parsed = parseDailyCheckin(c) as DailyCheckin
    const cs = store.get('dailyCheckins', []) as DailyCheckin[]
    const next = [
      ...cs.filter(item => item.date !== parsed.date),
      parsed,
    ].sort((a, b) => a.date.localeCompare(b.date))
    store.set('dailyCheckins', next)
    return next
  }

  ipcMain.handle('store:upsertDailyCheckin', (_, c: unknown) => {
    upsertDailyCheckin(c)
  })
  ipcMain.handle('store:addDailyCheckin', (_, c: unknown) => {
    upsertDailyCheckin(c)
  })
  ipcMain.handle('store:getDailyCheckins', () => getValidatedDailyCheckins(store))

  ipcMain.handle('store:addMMRLog', (_, l: unknown) => {
    const logs = store.get('mmrLogs', []) as MMRLog[]
    const parsed = parseMMRLog(l) as MMRLog
    store.set('mmrLogs', [...logs, parsed])
  })
  ipcMain.handle('store:getMMRLogs', () => getValidatedMMRLogs(store))

  ipcMain.handle('store:getHeroNotes', () => getValidatedHeroNotes(store))
  ipcMain.handle('store:upsertHeroNote', (_, note: unknown) => {
    const notes = store.get('heroNotes', []) as HeroNote[]
    const parsed = parseHeroNote(note) as HeroNote
    const normalizedHero = parsed.hero.trim()
    if (!normalizedHero) {
      throw new Error('英雄档案缺少英雄名。')
    }
    const nextNote: HeroNote = {
      ...parsed,
      hero: normalizedHero,
      updatedAt: Date.now(),
    }
    store.set('heroNotes', [
      ...notes.filter(item => item.hero !== normalizedHero),
      nextNote,
    ].sort((a, b) => a.hero.localeCompare(b.hero, 'zh-CN')))
  })

  ipcMain.handle('store:addCycle', (_, c: unknown) => {
    const cs = store.get('cycles', []) as TrainingCycle[]
    const parsed = parseTrainingCycle(c) as TrainingCycle
    store.set('cycles', [...cs, parsed])
  })
  ipcMain.handle('store:getCycles', () => getValidatedCycles(store))

  // 导出（触发系统“另存为”对话框 + 写文件）
  ipcMain.handle('store:exportAll', async () => {
    const snapshot = getValidatedStoreSnapshot(store)
    const safeAppState: AppState = {
      ...snapshot.appState,
      openDota: snapshot.appState?.openDota ? { ...snapshot.appState.openDota, apiKey: undefined } : undefined,
      stratz: snapshot.appState?.stratz ? { ...snapshot.appState.stratz, apiKey: undefined } : undefined,
    }
    const data = parseBackupData({
      ...snapshot,
      appState: safeAppState,
    })
    const { filePath, canceled } = await dialog.showSaveDialog({
      defaultPath: `dota2-backup-${todayKey()}.json`,
      filters: [{ name: 'JSON', extensions: ['json'] }],
    })
    if (canceled || !filePath) return { success: false }
    await writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8')
    return { success: true }
  })

  // 导入
  ipcMain.handle('store:importAll', (_, json: string) => {
    const data = parseImportedBackupJson(json)
    store.set('schemaVersion', data.schemaVersion ?? CURRENT_SCHEMA_VERSION)
    for (const key of PERSISTED_STORE_KEYS) {
      if (data[key] !== undefined) store.set(key, data[key])
    }
  })
}
