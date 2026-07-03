import { dialog, ipcMain } from 'electron'
import { copyFileSync, existsSync } from 'fs'
import { dirname, extname, join, basename } from 'path'
import { writeFile } from 'fs/promises'
import type { AppState, DailyCheckin, DotaPosition, HeroMatchupCache, HeroMatchupNote, HeroNote, MatchLog, MMRLog, PreGameSetup, TrainingCycle } from '../../src/types'
import { compactHeroIdMap, compactHeroIds, getCanonicalHeroName, getCanonicalHeroNameByReference, getHeroIdByName, sameHeroReference } from '../../src/utils/heroIdentity.ts'
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
  type ParsedBackupData,
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
  path?: string
}

type BackupStoreFile = (storePath: string | undefined, now?: Date) => string | null

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

const DEFAULT_APP_STATE: AppState = {
  activeCycleId: '',
  heroPool: [],
  currentStreak: 0,
  longestStreak: 0,
  pendingPreGameSetupId: undefined,
  checklistFreezeTokens: 0,
  freezeUsedDates: [],
  openDota: {
    accountId: '',
    apiKey: undefined,
    matchupMinGames: undefined,
  },
  stratz: {
    apiKey: undefined,
    rankBracket: 'ALL',
  },
}

const ARRAY_KEYS = ['cycles', 'matchLogs', 'preGameSetups', 'dailyCheckins', 'mmrLogs', 'heroNotes'] as const

type ArrayKey = typeof ARRAY_KEYS[number]

const ARRAY_PARSERS = {
  cycles: parseTrainingCycle,
  matchLogs: parseMatchLog,
  preGameSetups: parsePreGameSetup,
  dailyCheckins: parseDailyCheckin,
  mmrLogs: parseMMRLog,
  heroNotes: parseHeroNote,
} satisfies Record<ArrayKey, (value: unknown) => unknown>

let recoveryChangedCurrentPass = false

function compactUtcTimestamp(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0')
  return [
    date.getUTCFullYear(),
    pad(date.getUTCMonth() + 1),
    pad(date.getUTCDate()),
    '-',
    pad(date.getUTCHours()),
    pad(date.getUTCMinutes()),
    pad(date.getUTCSeconds()),
  ].join('')
}

export function backupCorruptStoreFile(
  storePath: string | undefined,
  now = new Date(),
  copyFile: (source: string, destination: string) => void = copyFileSync,
): string | null {
  if (!storePath || !existsSync(storePath)) return null
  const ext = extname(storePath) || '.json'
  const base = basename(storePath, ext)
  const backupPath = join(dirname(storePath), `${base}.corrupt-${compactUtcTimestamp(now)}${ext}`)
  try {
    copyFile(storePath, backupPath)
    return backupPath
  } catch (error) {
    console.warn('[store:migrate] 备份坏 store 失败，继续执行恢复：', error instanceof Error ? error.message : error)
    return null
  }
}

function safelyBackupCorruptStoreFile(storePath: string | undefined, backupStoreFile: BackupStoreFile = backupCorruptStoreFile): string | null {
  try {
    return backupStoreFile(storePath)
  } catch (error) {
    console.warn('[store:migrate] 备份坏 store 失败，继续执行恢复：', error instanceof Error ? error.message : error)
    return null
  }
}

function warnRecovery(message: string) {
  recoveryChangedCurrentPass = true
  console.warn(message)
}

function canonicalizeHeroName(heroName?: string): string | undefined {
  return getCanonicalHeroName(heroName) ?? heroName
}

function canonicalizeHeroNames(values?: string[]): string[] | undefined {
  return values?.map(value => canonicalizeHeroName(value) ?? value)
}

function canonicalizeEnemyByPosition(values?: Partial<Record<DotaPosition, string>>): Partial<Record<DotaPosition, string>> | undefined {
  if (!values) return values
  return Object.fromEntries(
    Object.entries(values).map(([position, hero]) => [position, canonicalizeHeroName(hero) ?? hero]),
  ) as Partial<Record<DotaPosition, string>>
}

function withCanonicalHeroReference<T extends { hero: string; heroId?: number }>(value: T): T {
  const heroId = value.heroId ?? getHeroIdByName(value.hero)
  const hero = getCanonicalHeroNameByReference({ hero: value.hero, heroId }) ?? value.hero
  return {
    ...value,
    hero,
    ...(heroId !== undefined && { heroId }),
  }
}

function enrichHeroPool(appState: AppState): AppState {
  return {
    ...appState,
    heroPool: appState.heroPool.map(config => {
      const heroId = config.heroId ?? getHeroIdByName(config.name)
      const name = getCanonicalHeroNameByReference({ hero: config.name, heroId }) ?? config.name
      return {
        ...config,
        name,
        ...(heroId !== undefined && { heroId }),
      }
    }),
  }
}

function enrichPreGameSetup(setup: PreGameSetup): PreGameSetup {
  const enemyByPosition = canonicalizeEnemyByPosition(setup.enemyByPosition)
  const enemyCarry = canonicalizeHeroName(setup.enemyCarry)
  const enemySupports = canonicalizeHeroNames(setup.enemySupports)
  const enemyHeroIdsByPosition = setup.enemyHeroIdsByPosition ?? compactHeroIdMap(enemyByPosition ?? {}) as Partial<Record<DotaPosition, number>> | undefined
  return {
    ...withCanonicalHeroReference(setup),
    ...(enemyByPosition && { enemyByPosition }),
    ...(enemyHeroIdsByPosition && { enemyHeroIdsByPosition }),
    ...(enemyCarry && { enemyCarry }),
    ...(enemySupports && { enemySupports }),
    ...(setup.enemyCarryHeroId === undefined && enemyCarry && getHeroIdByName(enemyCarry) !== undefined && { enemyCarryHeroId: getHeroIdByName(enemyCarry) }),
    ...(setup.enemySupportHeroIds === undefined && enemySupports?.length && compactHeroIds(enemySupports) && { enemySupportHeroIds: compactHeroIds(enemySupports) }),
  }
}

function enrichMatchLog(log: MatchLog): MatchLog {
  const enemyCarry = canonicalizeHeroName(log.enemyCarry)
  const enemySupports = canonicalizeHeroNames(log.enemySupports)
  const enemyHeroes = canonicalizeHeroNames(log.enemyHeroes)
  return {
    ...withCanonicalHeroReference(log),
    ...(enemyCarry && { enemyCarry }),
    ...(enemySupports && { enemySupports }),
    ...(enemyHeroes && { enemyHeroes }),
    ...(log.enemyCarryHeroId === undefined && enemyCarry && getHeroIdByName(enemyCarry) !== undefined && { enemyCarryHeroId: getHeroIdByName(enemyCarry) }),
    ...(log.enemySupportHeroIds === undefined && enemySupports?.length && compactHeroIds(enemySupports) && { enemySupportHeroIds: compactHeroIds(enemySupports) }),
    ...(log.enemyHeroIds === undefined && enemyHeroes?.length && compactHeroIds(enemyHeroes) && { enemyHeroIds: compactHeroIds(enemyHeroes) }),
  }
}

function enrichHeroNote(note: HeroNote): HeroNote {
  const matchupNotes = note.matchupNotes
    ? Object.fromEntries(Object.values(note.matchupNotes).map(matchupNote => {
      const opponentHeroId = matchupNote.opponentHeroId ?? getHeroIdByName(matchupNote.opponentHero)
      const opponentHero = getCanonicalHeroNameByReference({ hero: matchupNote.opponentHero, heroId: opponentHeroId }) ?? matchupNote.opponentHero
      const enriched: HeroMatchupNote = {
        ...matchupNote,
        opponentHero,
        ...(opponentHeroId !== undefined && { opponentHeroId }),
      }
      if (Object.prototype.hasOwnProperty.call(note.matchupNotes, opponentHero) && note.matchupNotes[opponentHero] !== matchupNote) {
        warnRecovery(`[store:migrate] 合并重复英雄对位笔记：${opponentHero}`)
      }
      return [opponentHero, enriched]
    }))
    : note.matchupNotes
  return {
    ...withCanonicalHeroReference(note),
    ...(matchupNotes && { matchupNotes }),
  }
}

function canonicalizeHeroMatchupCache(cache: HeroMatchupCache): HeroMatchupCache {
  const matchups: HeroMatchupCache['matchups'] = {}
  for (const [hero, row] of Object.entries(cache.matchups)) {
    const canonicalHero = canonicalizeHeroName(hero) ?? hero
    if (matchups[canonicalHero] && hero !== canonicalHero) {
      warnRecovery(`[store:migrate] 合并重复英雄 matchup cache 行：${canonicalHero}`)
    }
    const targetRow = matchups[canonicalHero] ?? {}
    for (const [enemy, stats] of Object.entries(row)) {
      const canonicalEnemy = canonicalizeHeroName(enemy) ?? enemy
      if (targetRow[canonicalEnemy] && enemy !== canonicalEnemy) {
        warnRecovery(`[store:migrate] 合并重复英雄 matchup cache：${canonicalHero} vs ${canonicalEnemy}`)
      }
      targetRow[canonicalEnemy] = stats
    }
    matchups[canonicalHero] = targetRow
  }

  return {
    ...cache,
    heroCount: Object.keys(matchups).length,
    matchupCount: Object.values(matchups).reduce((sum, row) => sum + Object.keys(row).length, 0),
    matchups,
  }
}

function migrateV1AppState(raw: unknown): unknown {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return raw
  return {
    currentStreak: 0,
    longestStreak: 0,
    ...raw,
  }
}

function salvageAppState(raw: unknown): AppState {
  const migrated = migrateV1AppState(raw)
  try {
    return enrichHeroPool(parseBackupData({ appState: migrated }).appState as AppState)
  } catch (error) {
    warnRecovery(`[store:migrate] appState 无效，已重建默认应用状态：${error instanceof Error ? error.message : error}`)
    return enrichHeroPool(DEFAULT_APP_STATE)
  }
}

function enrichPersistedArrayItem<T>(key: ArrayKey, item: T): T {
  if (key === 'matchLogs') return enrichMatchLog(item as MatchLog) as T
  if (key === 'preGameSetups') return enrichPreGameSetup(item as PreGameSetup) as T
  if (key === 'heroNotes') return enrichHeroNote(item as HeroNote) as T
  return item
}

function salvageArray<T>(key: ArrayKey, raw: unknown): T[] {
  if (raw === undefined || raw === null) return []
  if (!Array.isArray(raw)) {
    warnRecovery(`[store:migrate] ${key} 不是数组，已重置为空数组。`)
    return []
  }

  const parser = ARRAY_PARSERS[key]
  const safe: T[] = []
  let dropped = 0
  for (const item of raw) {
    try {
      safe.push(enrichPersistedArrayItem(key, parser(item) as T))
    } catch {
      dropped += 1
    }
  }
  if (dropped > 0) {
    warnRecovery(`[store:migrate] 丢弃 ${dropped} 条无效 ${key}，保留 ${safe.length} 条。`)
  }
  return safe
}

function recoverHeroMatchupCacheValue(raw: unknown) {
  if (raw === null || raw === undefined) return null
  try {
    return canonicalizeHeroMatchupCache(parseHeroMatchupCache(raw) as HeroMatchupCache)
  } catch (error) {
    warnRecovery(`[store:migrate] 清理无效 heroMatchupCache：${error instanceof Error ? error.message : error}`)
    return null
  }
}

function recoverHeroBenchmarkCacheValue(raw: unknown) {
  if (raw === null || raw === undefined) return {}
  try {
    return parseHeroBenchmarkCacheMap(raw)
  } catch (error) {
    warnRecovery(`[store:migrate] 清理无效 heroBenchmarkCache：${error instanceof Error ? error.message : error}`)
    return {}
  }
}

function collectRawPersistedData(store: ElectronStoreLike): Record<string, unknown> {
  return {
    schemaVersion: store.get('schemaVersion', 0),
    appState: store.get('appState'),
    cycles: store.get('cycles', []),
    matchLogs: store.get('matchLogs', []),
    preGameSetups: store.get('preGameSetups', []),
    dailyCheckins: store.get('dailyCheckins', []),
    mmrLogs: store.get('mmrLogs', []),
    heroNotes: store.get('heroNotes', []),
    heroMatchupCache: store.get('heroMatchupCache', null),
    heroBenchmarkCache: store.get('heroBenchmarkCache', {}),
  }
}


function redactApiKeys(appState: AppState): AppState {
  const { apiKey: _openDotaApiKey, ...openDotaWithoutApiKey } = appState.openDota ?? {}
  const { apiKey: _stratzApiKey, ...stratzWithoutApiKey } = appState.stratz ?? {}
  return {
    ...appState,
    openDota: appState.openDota ? openDotaWithoutApiKey : undefined,
    stratz: appState.stratz ? stratzWithoutApiKey : undefined,
  }
}

export function migratePersistedData(raw: Record<string, unknown>): ParsedBackupData {
  const fromVersion = normalizeSchemaVersion(raw.schemaVersion)
  const migratedAppState = fromVersion < 2 ? migrateV1AppState(raw.appState) : raw.appState
  const candidate = {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    appState: salvageAppState(migratedAppState),
    cycles: salvageArray<TrainingCycle>('cycles', raw.cycles),
    matchLogs: salvageArray<MatchLog>('matchLogs', raw.matchLogs),
    preGameSetups: salvageArray<PreGameSetup>('preGameSetups', raw.preGameSetups),
    dailyCheckins: salvageArray<DailyCheckin>('dailyCheckins', raw.dailyCheckins),
    mmrLogs: salvageArray<MMRLog>('mmrLogs', raw.mmrLogs),
    heroNotes: salvageArray<HeroNote>('heroNotes', raw.heroNotes),
    heroMatchupCache: recoverHeroMatchupCacheValue(raw.heroMatchupCache),
    heroBenchmarkCache: recoverHeroBenchmarkCacheValue(raw.heroBenchmarkCache),
  }
  return parseBackupData(candidate)
}

export function migrateImportedBackupJson(json: string): ParsedBackupData {
  let raw: unknown
  try {
    raw = JSON.parse(json)
  } catch {
    throw new Error('备份文件不是有效 JSON。')
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return parseImportedBackupJson(json)
  }
  return migratePersistedData(raw as Record<string, unknown>)
}

export function getValidatedAppState(store: ElectronStoreLike): AppState {
  return salvageAppState(store.get('appState'))
}

export function getValidatedMatchLogs(store: ElectronStoreLike): MatchLog[] {
  return salvageArray<MatchLog>('matchLogs', store.get('matchLogs', []))
}

export function getValidatedPreGameSetups(store: ElectronStoreLike): PreGameSetup[] {
  return salvageArray<PreGameSetup>('preGameSetups', store.get('preGameSetups', []))
}

export function getValidatedDailyCheckins(store: ElectronStoreLike): DailyCheckin[] {
  return salvageArray<DailyCheckin>('dailyCheckins', store.get('dailyCheckins', []))
}

export function getValidatedMMRLogs(store: ElectronStoreLike): MMRLog[] {
  return salvageArray<MMRLog>('mmrLogs', store.get('mmrLogs', []))
}

export function getValidatedHeroNotes(store: ElectronStoreLike): HeroNote[] {
  return salvageArray<HeroNote>('heroNotes', store.get('heroNotes', []))
}

export function getValidatedCycles(store: ElectronStoreLike): TrainingCycle[] {
  return salvageArray<TrainingCycle>('cycles', store.get('cycles', []))
}

function recoverHeroMatchupCache(store: ElectronStoreLike) {
  const recovered = recoverHeroMatchupCacheValue(store.get('heroMatchupCache', null))
  if (recovered === null && store.get('heroMatchupCache', null) !== null) store.set('heroMatchupCache', null)
  return recovered
}

function recoverHeroBenchmarkCache(store: ElectronStoreLike) {
  const recovered = recoverHeroBenchmarkCacheValue(store.get('heroBenchmarkCache', {}))
  if (recovered && recovered !== store.get('heroBenchmarkCache', {})) store.set('heroBenchmarkCache', recovered)
  return recovered
}

export function getValidatedStoreSnapshot(store: ElectronStoreLike) {
  const migrated = migratePersistedData(collectRawPersistedData(store))
  store.set('heroMatchupCache', migrated.heroMatchupCache)
  store.set('heroBenchmarkCache', migrated.heroBenchmarkCache)
  return migrated
}

export function validateAndMigratePersistedStore(store: ElectronStoreLike, backupStoreFile: BackupStoreFile = backupCorruptStoreFile) {
  recoveryChangedCurrentPass = false
  const migrated = migratePersistedData(collectRawPersistedData(store))
  if (recoveryChangedCurrentPass) {
    safelyBackupCorruptStoreFile(store.path, backupStoreFile)
  }
  store.set('schemaVersion', CURRENT_SCHEMA_VERSION)
  for (const key of PERSISTED_STORE_KEYS) {
    store.set(key, migrated[key])
  }
  return migrated
}

export function recoverPersistedStoreForStartup(store: ElectronStoreLike, backupStoreFile: BackupStoreFile = backupCorruptStoreFile) {
  try {
    return validateAndMigratePersistedStore(store, backupStoreFile)
  } catch (error) {
    const backupPath = safelyBackupCorruptStoreFile(store.path, backupStoreFile)
    console.error('[store:migrate] 持久化数据恢复失败，已备份并重建默认 store：', backupPath, error)
    store.set('schemaVersion', CURRENT_SCHEMA_VERSION)
    store.set('appState', DEFAULT_APP_STATE)
    store.set('cycles', [])
    store.set('matchLogs', [])
    store.set('preGameSetups', [])
    store.set('dailyCheckins', [])
    store.set('mmrLogs', [])
    store.set('heroNotes', [])
    store.set('heroMatchupCache', null)
    store.set('heroBenchmarkCache', {})
    return validateAndMigratePersistedStore(store, backupStoreFile)
  }
}

export function registerStoreIpcHandlers(store: ElectronStoreLike, todayKey: () => string) {
  ipcMain.handle('store:getAppState', () => getValidatedAppState(store))
  ipcMain.handle('store:setAppState', (_, partial: unknown) => {
    const current = getValidatedAppState(store)
    const parsed = parseAppStatePatch(partial) as Partial<AppState>
    store.set('appState', enrichHeroPool({ ...current, ...parsed }))
  })

  ipcMain.handle('store:addMatchLog', (_, log: unknown) => {
    const logs = getValidatedMatchLogs(store)
    const parsed = enrichMatchLog(parseMatchLog(log) as MatchLog)
    store.set('matchLogs', [...logs, parsed])
  })
  ipcMain.handle('store:getMatchLogs', () => getValidatedMatchLogs(store))
  ipcMain.handle('store:updateMatchLog', (_, id: string, patch: unknown) => {
    const logs = getValidatedMatchLogs(store)
    const parsed = parseMatchLogPatch(patch) as Partial<MatchLog>
    store.set('matchLogs', logs.map(l => l.id === id ? enrichMatchLog({ ...l, ...parsed }) : l))
  })

  ipcMain.handle('store:addPreGameSetup', (_, s: unknown) => {
    const setups = getValidatedPreGameSetups(store)
    const parsed = enrichPreGameSetup(parsePreGameSetup(s) as PreGameSetup)
    store.set('preGameSetups', [...setups, parsed])
  })
  ipcMain.handle('store:getPreGameSetups', () => getValidatedPreGameSetups(store))
  ipcMain.handle('store:updatePreGameSetup', (_, id: string, patch: unknown) => {
    const setups = getValidatedPreGameSetups(store)
    const parsed = parsePreGameSetupPatch(patch) as Partial<PreGameSetup>
    store.set('preGameSetups', setups.map(s => s.id === id ? enrichPreGameSetup({ ...s, ...parsed }) : s))
  })

  function upsertDailyCheckin(c: unknown): DailyCheckin[] {
    const parsed = parseDailyCheckin(c) as DailyCheckin
    const cs = getValidatedDailyCheckins(store)
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
    const logs = getValidatedMMRLogs(store)
    const parsed = parseMMRLog(l) as MMRLog
    store.set('mmrLogs', [...logs, parsed])
  })
  ipcMain.handle('store:getMMRLogs', () => getValidatedMMRLogs(store))

  ipcMain.handle('store:getHeroNotes', () => getValidatedHeroNotes(store))
  ipcMain.handle('store:upsertHeroNote', (_, note: unknown) => {
    const notes = getValidatedHeroNotes(store)
    const parsed = enrichHeroNote(parseHeroNote(note) as HeroNote)
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
      ...notes.filter(item => !sameHeroReference(item, nextNote)),
      nextNote,
    ].sort((a, b) => a.hero.localeCompare(b.hero, 'zh-CN')))
  })

  ipcMain.handle('store:addCycle', (_, c: unknown) => {
    const cs = getValidatedCycles(store)
    const parsed = parseTrainingCycle(c) as TrainingCycle
    store.set('cycles', [...cs, parsed])
  })
  ipcMain.handle('store:getCycles', () => getValidatedCycles(store))

  // 导出（触发系统“另存为”对话框 + 写文件）
  ipcMain.handle('store:exportAll', async () => {
    const snapshot = getValidatedStoreSnapshot(store)
    const safeAppState = redactApiKeys(snapshot.appState as AppState)
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
    const data = migrateImportedBackupJson(json)
    store.set('schemaVersion', CURRENT_SCHEMA_VERSION)
    for (const key of PERSISTED_STORE_KEYS) {
      if (data[key] !== undefined) store.set(key, data[key])
    }
  })
}
