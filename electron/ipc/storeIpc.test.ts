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


const validHeroTimingCache = {
  source: 'opendota',
  syncedAt: 1,
  date: '2026-07-03',
  version: 1,
  heroCount: 1,
  profiles: {
    '155': {
      heroId: 155,
      displayName: 'Largo',
      localizedName: 'Largo',
      early: { winRate: 0.52, games: 448 },
      mid: { winRate: 0.55, games: 618 },
      late: { winRate: null, games: 169 },
      veryLate: { winRate: null, games: 47 },
      timingLabel: 'mid',
      peakMinute: 40,
      totalGames: 1282,
      confidence: 'medium',
    },
  },
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
    expect(store.data.get('schemaVersion')).toBe(3)
    expect(store.data.get('matchLogs')).toEqual([{ ...validMatchLog, heroId: 2 }])
    expect(store.data.get('heroBenchmarkCache')).toEqual({})
  })

  it('clears a corrupt timing cache without breaking startup migration', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const store = createStore({
      schemaVersion: 3,
      appState: validAppState,
      cycles: [],
      matchLogs: [validMatchLog],
      preGameSetups: [],
      dailyCheckins: [],
      mmrLogs: [],
      heroNotes: [],
      heroMatchupCache: null,
      heroBenchmarkCache: {},
      heroTimingCache: {
        ...validHeroTimingCache,
        profiles: {
          '155': {
            ...validHeroTimingCache.profiles['155'],
            early: { winRate: 52, games: 448 },
          },
        },
      },
    })

    expect(() => validateAndMigratePersistedStore(store)).not.toThrow()
    expect(store.data.get('matchLogs')).toEqual([{ ...validMatchLog, heroId: 2 }])
    expect(store.data.get('heroTimingCache')).toBeNull()
  })

  it('preserves and canonicalizes a valid timing cache during backup import', () => {
    const migrated = migrateImportedBackupJson(JSON.stringify({
      schemaVersion: 3,
      appState: validAppState,
      matchLogs: [],
      preGameSetups: [],
      heroNotes: [],
      heroMatchupCache: null,
      heroBenchmarkCache: {},
      heroTimingCache: validHeroTimingCache,
    }))

    expect(migrated.heroTimingCache?.profiles['155']).toMatchObject({
      heroId: 155,
      displayName: '朗戈',
      localizedName: 'Largo',
      timingLabel: 'mid',
    })
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
    expect(store.data.get('schemaVersion')).toBe(3)
    expect(store.data.get('matchLogs')).toEqual([{ ...validMatchLog, heroId: 2 }])
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

    expect(migrated.schemaVersion).toBe(3)
    expect(migrated.appState?.currentStreak).toBe(0)
    expect(migrated.appState?.longestStreak).toBe(0)
    expect(migrated.matchLogs ?? []).toEqual([{ ...validMatchLog, heroId: 2 }])
    expect(migrated.heroMatchupCache).toBeNull()
  })


  it('migrates v2 name-keyed hero data to v3 stable hero ids', () => {
    const migrated = migrateImportedBackupJson(JSON.stringify({
      schemaVersion: 2,
      appState: validAppState,
      matchLogs: [{
        ...validMatchLog,
        enemyCarry: '敌法师',
        enemySupports: ['拉比克'],
        enemyHeroes: ['帕克', '敌法师'],
      }],
      preGameSetups: [{
        id: 'setup-1',
        timestamp: 1,
        hero: '斧王',
        targetPosition: '3',
        enemyByPosition: { '1': '敌法师', '2': '帕克' },
        enemyCarry: '敌法师',
        enemySupports: ['拉比克'],
      }],
      heroNotes: [{
        hero: '斧王',
        position: '',
        strongPeriod: '',
        weakPeriod: '',
        laneGoal: '',
        firstKeyItem: '',
        counters: '',
        counteredBy: '',
        whenToFight: '',
        whenToFarm: '',
        commonDeaths: '',
        reviewRules: [],
        matchupNotes: {
          '帕克': {
            opponentHero: '帕克',
            note: '跳前先确认相位。',
            updatedAt: 1,
          },
        },
        updatedAt: 1,
      }],
      heroMatchupCache: null,
      heroBenchmarkCache: {},
    }))

    expect(migrated.schemaVersion).toBe(3)
    expect(migrated.appState?.heroPool[0]).toMatchObject({ name: '斧王', heroId: 2 })
    expect(migrated.matchLogs?.[0]).toMatchObject({ hero: '斧王', heroId: 2, enemyCarryHeroId: 1, enemySupportHeroIds: [86], enemyHeroIds: [13, 1] })
    expect(migrated.preGameSetups?.[0]).toMatchObject({ hero: '斧王', heroId: 2, enemyCarryHeroId: 1, enemySupportHeroIds: [86] })
    expect(migrated.preGameSetups?.[0].enemyHeroIdsByPosition).toEqual({ '1': 1, '2': 13 })
    expect(migrated.heroNotes?.[0]).toMatchObject({ hero: '斧王', heroId: 2 })
    expect(migrated.heroNotes?.[0].matchupNotes?.['帕克']).toMatchObject({ opponentHero: '帕克', opponentHeroId: 13 })
  })

  it('canonicalizes legacy English hero names to the current display name during migration', () => {
    const migrated = migrateImportedBackupJson(JSON.stringify({
      schemaVersion: 3,
      appState: {
        ...validAppState,
        heroPool: [{ name: 'Largo', heroId: 155, active: true, positions: ['3'] }],
      },
      matchLogs: [{ ...validMatchLog, hero: 'Largo', heroId: 155, enemyHeroes: ['Axe'] }],
      preGameSetups: [{
        id: 'setup-largo',
        timestamp: 1,
        hero: 'Largo',
        heroId: 155,
        enemyByPosition: { '3': 'Axe' },
        enemyCarry: 'Anti-Mage',
        enemySupports: ['Rubick'],
      }],
      heroNotes: [{
        hero: 'Largo',
        heroId: 155,
        position: '',
        strongPeriod: '',
        weakPeriod: '',
        laneGoal: '',
        firstKeyItem: '',
        counters: '',
        counteredBy: '',
        whenToFight: '',
        whenToFarm: '',
        commonDeaths: '',
        reviewRules: [],
        matchupNotes: {
          Axe: {
            opponentHero: 'Axe',
            note: '斧王会打断节奏。',
            updatedAt: 1,
          },
        },
        updatedAt: 1,
      }],
      heroMatchupCache: null,
      heroBenchmarkCache: {},
    }))

    expect(migrated.appState?.heroPool[0]).toMatchObject({ name: '朗戈', heroId: 155 })
    expect(migrated.matchLogs?.[0]).toMatchObject({ hero: '朗戈', heroId: 155, enemyHeroes: ['斧王'], enemyHeroIds: [2] })
    expect(migrated.preGameSetups?.[0]).toMatchObject({ hero: '朗戈', heroId: 155, enemyCarry: '敌法师', enemySupports: ['拉比克'] })
    expect(migrated.preGameSetups?.[0].enemyByPosition).toEqual({ '3': '斧王' })
    expect(migrated.heroNotes?.[0]).toMatchObject({ hero: '朗戈', heroId: 155 })
    expect(migrated.heroNotes?.[0].matchupNotes?.['斧王']).toMatchObject({ opponentHero: '斧王', opponentHeroId: 2 })
  })

  it('canonicalizes legacy English hero names inside Stratz matchup cache keys', () => {
    const migrated = migrateImportedBackupJson(JSON.stringify({
      schemaVersion: 3,
      appState: validAppState,
      matchLogs: [],
      preGameSetups: [],
      heroNotes: [],
      heroMatchupCache: {
        source: 'stratz',
        syncedAt: 1,
        date: '2026-07-03',
        heroCount: 2,
        matchupCount: 2,
        matchups: {
          Largo: { Axe: { gamesPlayed: 100, wins: 40, winRate: 40, advantage: -10 } },
          Axe: { Largo: { gamesPlayed: 100, wins: 60, winRate: 60, advantage: 10 } },
        },
      },
      heroBenchmarkCache: {},
    }))

    expect(migrated.heroMatchupCache?.source).toBe('stratz')
    expect(migrated.heroMatchupCache?.heroCount).toBe(2)
    expect(migrated.heroMatchupCache?.matchupCount).toBe(2)
    expect(migrated.heroMatchupCache?.matchups.朗戈.斧王).toMatchObject({ gamesPlayed: 100, advantage: -10 })
    expect(migrated.heroMatchupCache?.matchups.斧王.朗戈).toMatchObject({ gamesPlayed: 100, advantage: 10 })
  })

  it('summarizes duplicate matchup cache aliases instead of logging every duplicated cell', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const store = createStore({
      schemaVersion: 3,
      appState: validAppState,
      cycles: [],
      matchLogs: [],
      preGameSetups: [],
      dailyCheckins: [],
      mmrLogs: [],
      heroNotes: [],
      heroMatchupCache: {
        source: 'stratz',
        syncedAt: 1,
        date: '2026-07-03',
        heroCount: 2,
        matchupCount: 4,
        matchups: {
          Axe: {
            '天穹守望者': { gamesPlayed: 100, wins: 55, winRate: 55, advantage: 5 },
            'Arc Warden': { gamesPlayed: 80, wins: 30, winRate: 37.5, advantage: -12.5 },
          },
          'Arc Warden': {
            Axe: { gamesPlayed: 80, wins: 50, winRate: 62.5, advantage: 12.5 },
          },
          '天穹守望者': {
            Axe: { gamesPlayed: 100, wins: 45, winRate: 45, advantage: -5 },
          },
        },
      },
      heroBenchmarkCache: {},
      heroTimingCache: null,
    })

    validateAndMigratePersistedStore(store)

    expect(warn).toHaveBeenCalledTimes(1)
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('1 行、2 个对位'))
    const cache = store.data.get('heroMatchupCache') as any
    expect(cache.heroCount).toBe(2)
    expect(cache.matchupCount).toBe(2)
    expect(cache.matchups.斧王['天穹守望者']).toMatchObject({ gamesPlayed: 100, advantage: 5 })
    expect(cache.matchups['天穹守望者'].斧王).toMatchObject({ gamesPlayed: 100, advantage: -5 })
    expect(cache.matchups.斧王['Arc Warden']).toBeUndefined()
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
      expect(store.data.get('matchLogs')).toEqual([{ ...validMatchLog, heroId: 2 }])
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
      expect(store.data.get('matchLogs')).toEqual([{ ...validMatchLog, heroId: 2 }])
      expect(warn).toHaveBeenCalled()
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
