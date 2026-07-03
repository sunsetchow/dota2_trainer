import { describe, expect, it } from 'vitest'

import { buildMatchupTargets, isOpenDotaParsePendingError } from './PostGame'
import { createOpenDotaError } from '../utils/openDotaErrors'

describe('PostGame OpenDota analysis helpers', () => {
  it('keeps polling while OpenDota is still parsing detailed match data based on structured codes', () => {
    expect(isOpenDotaParsePendingError(createOpenDotaError('PARSE_PENDING', 'wording can change'))).toBe(true)
    expect(isOpenDotaParsePendingError(createOpenDotaError('MATCH_NOT_FOUND', 'wording can change'))).toBe(true)
    expect(isOpenDotaParsePendingError(createOpenDotaError('TIMEOUT', 'wording can change'))).toBe(true)
    expect(isOpenDotaParsePendingError(createOpenDotaError('RATE_LIMITED', 'wording can change'))).toBe(true)
  })

  it('does not infer parse state from localized message substrings', () => {
    expect(isOpenDotaParsePendingError(new Error('这条普通错误包含解析两个字，但没有结构化 code'))).toBe(false)
    expect(isOpenDotaParsePendingError(createOpenDotaError('ACCOUNT_MISMATCH', '这场比赛里没有找到设置中的 Account ID。'))).toBe(false)
  })

  it('uses OpenDota enemy heroes as matchup note targets when there is no draft setup', () => {
    expect(buildMatchupTargets('斧王', null, {
      matchId: '123',
      timestamp: 1,
      durationMin: 35,
      result: 'win',
      heroId: 2,
      enemyHeroes: ['帕克', '敌法师', '斧王', '帕克'],
    })).toEqual(['帕克', '敌法师'])
  })
})
