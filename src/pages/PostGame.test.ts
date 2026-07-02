import { describe, expect, it } from 'vitest'

import { isOpenDotaParsePendingMessage, buildMatchupTargets } from './PostGame'

describe('PostGame OpenDota analysis helpers', () => {
  it('keeps polling while OpenDota is still parsing detailed match data', () => {
    expect(isOpenDotaParsePendingMessage('OpenDota 没有返回玩家明细。这场比赛可能还没有解析，可以先请求解析，几分钟后重试。')).toBe(true)
    expect(isOpenDotaParsePendingMessage('HTTP 404: match not found')).toBe(true)
    expect(isOpenDotaParsePendingMessage('HTTP 500: parse pending')).toBe(true)
  })

  it('stops polling on non-parse errors', () => {
    expect(isOpenDotaParsePendingMessage('这场比赛里没有找到设置中的 Account ID。')).toBe(false)
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
