import { afterEach, describe, expect, it, vi } from 'vitest'
import { getValidatedMatchLogs, getValidatedStoreSnapshot, validateAndMigratePersistedStore } from './storeIpc.ts'

const validAppState = {
  activeCycleId: 'default',
  heroPool: [{ name: '斧王', active: true, positions: ['3'] }],
  currentStreak: 0,
  longestStreak: 0,
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
    expect(store.data.get('schemaVersion')).toBe(1)
    expect(store.data.get('matchLogs')).toEqual([validMatchLog])
    expect(store.data.get('heroBenchmarkCache')).toEqual({})
  })
})
