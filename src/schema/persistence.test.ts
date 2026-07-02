import { describe, expect, it } from 'vitest'
import {
  CURRENT_SCHEMA_VERSION,
  parseAppStatePatch,
  parseBackupData,
  parseHeroBenchmarkCache,
  parseHeroBenchmarkCacheMap,
  parseHeroMatchupCache,
  parseImportedBackupJson,
  parsePreGameSetup,
} from './persistence.ts'

const validAppState = {
  activeCycleId: 'default',
  heroPool: [
    { name: '敌法师', active: true, tier: 'practice', positions: ['1'] },
    { name: '帕克', active: false, positions: [] },
  ],
  currentStreak: 0,
  longestStreak: 0,
  checklistFreezeTokens: 0,
  freezeUsedDates: [],
  openDota: { accountId: '123456', apiKey: '', matchupMinGames: 50 },
  stratz: { apiKey: '', rankBracket: 'ALL' },
}

describe('persistence runtime schemas', () => {
  it('accepts valid backup data and fills the current schema version', () => {
    const parsed = parseBackupData({
      appState: validAppState,
      cycles: [],
      matchLogs: [],
      preGameSetups: [],
      dailyCheckins: [],
      mmrLogs: [],
      heroNotes: [],
      heroMatchupCache: null,
      heroBenchmarkCache: {},
    })

    expect(parsed.schemaVersion).toBe(CURRENT_SCHEMA_VERSION)
    expect(parsed.appState?.heroPool?.[1]?.positions).toEqual([])
  })

  it('rejects malformed backup data before anything is written', () => {
    expect(() => parseBackupData({
      appState: { ...validAppState, heroPool: [{ name: '敌法师', active: 'yes' }] },
      cycles: [],
      matchLogs: 'not-an-array',
      preGameSetups: [],
      dailyCheckins: [],
      mmrLogs: [],
      heroNotes: [],
    })).toThrow(/导入数据格式无效/)
  })

  it('rejects unknown top-level backup keys', () => {
    expect(() => parseBackupData({
      appState: validAppState,
      cycles: [],
      matchLogs: [],
      preGameSetups: [],
      dailyCheckins: [],
      mmrLogs: [],
      heroNotes: [],
      extra: true,
    })).toThrow(/导入数据格式无效/)
  })

  it('rejects invalid JSON with a user-facing error', () => {
    expect(() => parseImportedBackupJson('{bad json')).toThrow(/备份文件不是有效 JSON/)
  })

  it('validates app state patches crossing the IPC boundary', () => {
    expect(parseAppStatePatch({ pendingPreGameSetupId: undefined })).toEqual({ pendingPreGameSetupId: undefined })
    expect(parseAppStatePatch({ heroPool: [{ name: '帕克', active: false, positions: [] }] }).heroPool?.[0].positions).toEqual([])
    expect(() => parseAppStatePatch({ heroPool: [{ name: '帕克', active: 'false' }] })).toThrow(/应用状态数据无效/)
    expect(() => parseAppStatePatch({ madeUpField: true })).toThrow(/应用状态数据无效/)
  })

  it('accepts draft-created pre-game briefings without a manual training goal', () => {
    const parsed = parsePreGameSetup({
      id: 'pregame-1',
      timestamp: 1,
      hero: '斧王',
      targetPosition: '3',
      enemyByPosition: { '1': '敌法师', '2': '帕克', '4': '拉比克' },
      enemyCarry: '敌法师',
      enemySupports: ['拉比克'],
      cycleId: 'default',
    })

    expect(parsed.trainingGoal).toBeUndefined()
    expect(parsed.enemyByPosition?.['2']).toBe('帕克')
  })

  it('validates matchup cache data before it is persisted or exposed', () => {
    const parsed = parseHeroMatchupCache({
      source: 'stratz',
      version: 1,
      syncedAt: 1,
      date: '2026-07-02',
      heroCount: 1,
      matchupCount: 1,
      rankBracket: 'ALL',
      matchups: {
        Axe: {
          Drow: { gamesPlayed: 100, wins: 54, winRate: 54, advantage: 4 },
        },
      },
    })

    expect(parsed.matchups.Axe.Drow.advantage).toBe(4)
    expect(() => parseHeroMatchupCache({
      source: 'stratz',
      syncedAt: 1,
      date: '2026-07-02',
      heroCount: 1,
      matchupCount: 1,
      matchups: { Axe: { Drow: { gamesPlayed: '100', wins: 54, winRate: 54, advantage: 4 } } },
    })).toThrow(/英雄克制缓存数据无效/)
  })

  it('validates benchmark cache data before merging it into the store map', () => {
    const cache = parseHeroBenchmarkCache({
      source: 'opendota',
      syncedAt: 1,
      heroId: 1,
      benchmarks: {
        gold_per_min: [{ percentile: 50, value: 500 }],
        tower_damage: [{ percentile: 80, value: 2200 }],
      },
    })

    expect(parseHeroBenchmarkCacheMap({ '1': cache })['1'].heroId).toBe(1)
    expect(() => parseHeroBenchmarkCacheMap({
      '1': { ...cache, benchmarks: { gold_per_min: [{ percentile: '50', value: 500 }] } },
    })).toThrow(/英雄 benchmark 缓存集合数据无效/)
  })
})
