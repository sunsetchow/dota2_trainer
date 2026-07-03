import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  backupCorruptStoreFile,
  getValidatedMatchLogs,
  getValidatedStoreSnapshot,
  migrateImportedBackupJson,
  recoverPersistedStoreForStartup,
  validateAndMigratePersistedStore,
} from './storeIpc.ts'
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'

const validAppState = {
  activeCycleId: 'default',
  heroPool: [{ name: '斧王', active: true, positions: ['3'] }],
  currentStreak: 0,
  longestStreak: 0,
  checklistFreezeTokens: 0,
  freezeUsedDates: [],
}

const legacyAppStateWithoutDeadStreakFields = {
  activeCycleId: 'default',
  heroPool: [{ name: '斧王', active: true, positions: ['3'] }],
  checklistFreezeTokens: 0,
  freezeUsedDates: [],
}

const validMatchLog = {
  id: 'match-1',
  timestamp: 1,
  hero: '斧王',
  result: 'win',
  durationMin: 35,
  trainingGoalMet: 'yes',
  biggestMistake: '无',
  nextGameFocus: '控线',
}

const invalidMatchLog = {
  id: 'match-bad',
  timestamp: 2,
  hero: '帕克',
  result: 'draw',
  durationMin: 0,
  trainingGoalMet: 'yes',
  biggestMistake: 'bad',
  nextGameFocus: 'bad',
}

function createStore(initial: Record<string, unknown>) {
  const data = new Map(Object.entries(initial))
  return {
    data,
    get(key: string, defaultValue?: unknown) {
      return data.has(key) ? data.get(key) : defaultValue
    },
    set(key: string, value: unknown) {
      data.set(key, value)
    },
  }
}

function createStoreWithPath(initial: Record<string, unknown>, path: string) {
  return {
    ...createStore(initial),
    path,
  }
}

function findCorruptBackup(dir: string): string | undefined {
  const name = readdirSync(dir).find(item => item.startsWith('config.corrupt-') && item.endsWith('.json'))
  return name ? join(dir, name) : undefined
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('store IPC validation helpers', () => {
  it('does not let a corrupt matchup cache break unrelated match log reads', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const store = createStore({
      appState: validAppState,
      matchLogs: [validMatchLog],
      heroMatchupCache: {
        source: 'opendota',
        syncedAt: 1,
        date: '2026-07-02',
        heroCount: 1,
        matchupCount: 1,
        matchups: {
          Axe: {
            Drow: { gamesPlayed: 'bad', wins: 1, winRate: 50, advantage: 0 },
          },
        },
      },
    })

    expect(getValidatedMatchLogs(store)).toHaveLength(1)
    const snapshot = getValidatedStoreSnapshot(store)

    expect(snapshot.matchLogs).toHaveLength(1)
    expect(snapshot.heroMatchupCache).toBeNull()
    expect(store.data.get('heroMatchupCache')).toBeNull()
    expect(warn).toHaveBeenCalled()
  })

  it('startup migration clears corrupt optional caches but preserves core training data', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const store = createStore({
      schemaVersion: 0,
      appState: validAppState,
      cycles: [],
      matchLogs: [validMatchLog],
      preGameSetups: [],
      dailyCheckins: [],
      mmrLogs: [],
      heroNotes: [],
      heroBenchmarkCache: {
        '1': {
          source: 'opendota',
          syncedAt: 1,
          heroId: 1,
          benchmarks: { gold_per_min: [{ percentile: 'bad', value: 500 }] },
        },
      },
    })

    expect(() => validateAndMigratePersistedStore(store)).not.toThrow()
    expect(store.data.get('schemaVersion')).toBe(2)
    expect(store.data.get('matchLogs')).toEqual([validMatchLog])
    expect(store.data.get('heroBenchmarkCache')).toEqual({})
  })

  it('salvages valid core array rows and drops only corrupt rows during startup migration', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const store = createStore({
      schemaVersion: 1,
      appState: validAppState,
      cycles: [],
      matchLogs: [validMatchLog, invalidMatchLog],
      preGameSetups: [],
      dailyCheckins: [],
      mmrLogs: [],
      heroNotes: [],
      heroMatchupCache: null,
      heroBenchmarkCache: {},
    })

    expect(() => validateAndMigratePersistedStore(store)).not.toThrow()
    expect(store.data.get('schemaVersion')).toBe(2)
    expect(store.data.get('matchLogs')).toEqual([validMatchLog])
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('丢弃 1 条无效 matchLogs'))
  })

  it('migrates v1 backups to v2 before strict import validation', () => {
    const migrated = migrateImportedBackupJson(JSON.stringify({
      schemaVersion: 1,
      appState: legacyAppStateWithoutDeadStreakFields,
      matchLogs: [validMatchLog, invalidMatchLog],
      heroMatchupCache: {
        source: 'opendota',
        syncedAt: 1,
        date: '2026-07-02',
        heroCount: 1,
        matchupCount: 1,
        matchups: { Axe: { Drow: { gamesPlayed: 'bad', wins: 1, winRate: 50, advantage: 0 } } },
      },
    }))

    expect(migrated.schemaVersion).toBe(2)
    expect(migrated.appState?.currentStreak).toBe(0)
    expect(migrated.appState?.longestStreak).toBe(0)
    expect(migrated.matchLogs ?? []).toEqual([validMatchLog])
    expect(migrated.heroMatchupCache).toBeNull()
  })

  it('backs up the raw corrupt store file before destructive recovery', () => {
    const dir = mkdtempSync(join(tmpdir(), 'dota2-store-'))
    try {
      const storePath = join(dir, 'config.json')
      writeFileSync(storePath, '{"matchLogs":"corrupt"}', 'utf-8')

      const backupPath = backupCorruptStoreFile(storePath, new Date('2026-07-03T12:34:56Z'))

      expect(backupPath).toMatch(/config\.corrupt-20260703-123456\.json$/)
      expect(readFileSync(backupPath as string, 'utf-8')).toBe('{"matchLogs":"corrupt"}')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('backs up the raw store file on the real startup salvage path', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const dir = mkdtempSync(join(tmpdir(), 'dota2-store-'))
    try {
      const storePath = join(dir, 'config.json')
      const rawStoreJson = JSON.stringify({ schemaVersion: 1, matchLogs: [validMatchLog, invalidMatchLog] })
      writeFileSync(storePath, rawStoreJson, 'utf-8')
      const store = createStoreWithPath({
        schemaVersion: 1,
        appState: validAppState,
        cycles: [],
        matchLogs: [validMatchLog, invalidMatchLog],
        preGameSetups: [],
        dailyCheckins: [],
        mmrLogs: [],
        heroNotes: [],
        heroMatchupCache: null,
        heroBenchmarkCache: {},
      }, storePath)

      recoverPersistedStoreForStartup(store)

      const backupPath = findCorruptBackup(dir)
      expect(backupPath).toBeTruthy()
      expect(existsSync(storePath)).toBe(true)
      expect(store.data.get('matchLogs')).toEqual([validMatchLog])
      expect(readFileSync(backupPath as string, 'utf-8')).toBe(rawStoreJson)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('continues startup recovery when corrupt-store backup fails', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const dir = mkdtempSync(join(tmpdir(), 'dota2-store-'))
    try {
      const storePath = join(dir, 'config.json')
      writeFileSync(storePath, '{"matchLogs":"corrupt"}', 'utf-8')

      expect(() => backupCorruptStoreFile(storePath, new Date('2026-07-03T12:34:56Z'), () => {
        throw new Error('disk full')
      })).not.toThrow()

      const store = createStoreWithPath({
        schemaVersion: 1,
        appState: validAppState,
        cycles: [],
        matchLogs: [validMatchLog, invalidMatchLog],
        preGameSetups: [],
        dailyCheckins: [],
        mmrLogs: [],
        heroNotes: [],
        heroMatchupCache: null,
        heroBenchmarkCache: {},
      }, storePath)
      expect(() => recoverPersistedStoreForStartup(store, () => {
        throw new Error('disk full')
      })).not.toThrow()
      expect(store.data.get('matchLogs')).toEqual([validMatchLog])
      expect(warn).toHaveBeenCalled()
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
