import { describe, expect, it, vi } from 'vitest'
import { buildPostGameMatchLog } from './matchLogBuilder.ts'
import type { OpenDotaImportedMatch, PreGameSetup } from '../../types'

describe('buildPostGameMatchLog', () => {
  it('builds a trimmed manual match log with optional fields', () => {
    const now = 1_800_000
    vi.spyOn(Date, 'now').mockReturnValue(now)

    const pendingSetup: PreGameSetup = {
      id: 'setup-1',
      timestamp: 1,
      hero: '斧王',
      trainingGoal: '控线',
      enemyCarry: '敌法师',
      enemyCarryHeroId: 1,
      enemySupports: ['巫医'],
      enemySupportHeroIds: [30],
    }

    const log = buildPostGameMatchLog({
      id: 'log-1',
      activeCycleId: 'cycle-1',
      hero: ' 斧王 ',
      result: 'win',
      durationMin: '42',
      trainingGoalMet: 'partial',
      biggestMistake: '  红区死太多 ',
      nextGameFocus: '  先处理兵线 ',
      reviewDimension: 'economy',
      reviewTopic: ' 危险区收线 ',
      worstDeathZone: 'red',
      laneResult: 'lost',
      firstKeyItemMin: '18',
      goodInitiations: '3',
      draftScore: 4,
      csAt10: '61',
      cleanMatchId: '123',
      pendingSetup,
      notes: '  note ',
      reviewClipDeath: ' 18:40 ',
    })

    expect(log).toMatchObject({
      id: 'log-1',
      timestamp: now,
      hero: '斧王',
      heroId: 2,
      result: 'win',
      durationMin: 42,
      cycleId: 'cycle-1',
      biggestMistake: '红区死太多',
      nextGameFocus: '先处理兵线',
      reviewDimension: 'economy',
      reviewTopic: '危险区收线',
      worstDeathZone: 'red',
      laneResult: 'lost',
      firstKeyItemMin: 18,
      goodInitiations: 3,
      draftScore: 4,
      csAt10: 61,
      enemyCarry: '敌法师',
      enemyCarryHeroId: 1,
      enemySupports: ['巫医'],
      enemySupportHeroIds: [30],
      matchId: '123',
      notes: 'note',
      reviewClipDeath: '18:40',
    })
  })

  it('copies OpenDota imported metrics only when match id matches', () => {
    const imported: OpenDotaImportedMatch = {
      matchId: '456',
      timestamp: 123456,
      durationMin: 38,
      result: 'loss',
      heroId: 2,
      kills: 4,
      deaths: 7,
      assists: 12,
      gpm: 430,
      xpm: 520,
      firstKeyItemName: '闪烁匕首',
      firstKeyItemMin: 16,
      gpmPercentile: 55,
      enemyHeroes: ['帕克', '敌法师'],
      enemyHeroIds: [13, 1],
    }

    const log = buildPostGameMatchLog({
      id: 'log-2',
      activeCycleId: 'cycle-1',
      hero: '斧王',
      result: 'loss',
      durationMin: '38',
      trainingGoalMet: 'no',
      biggestMistake: '开团太急',
      nextGameFocus: '等队友位置',
      cleanMatchId: '456',
      importedMatch: imported,
    })

    expect(log).toMatchObject({
      timestamp: 123456,
      matchId: '456',
      source: 'opendota',
      heroId: 2,
      kills: 4,
      deaths: 7,
      assists: 12,
      gpm: 430,
      xpm: 520,
      firstKeyItemName: '闪烁匕首',
      gpmPercentile: 55,
      enemyHeroes: ['帕克', '敌法师'],
      enemyHeroIds: [13, 1],
    })
  })
})
