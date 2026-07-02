import { describe, expect, it } from 'vitest'

import { buildHeroNoteItems, buildUserMatchupNotes } from './PreGame'

describe('PreGame briefing helpers', () => {
  it('does not crash on legacy hero notes without reviewRules', () => {
    const note = {
      hero: '斧王',
      laneGoal: '先稳线到先锋盾',
      counteredBy: '帕克：跳前先确认相位/沉默状态',
    }

    expect(buildHeroNoteItems(note)).toContain('对线目标：先稳线到先锋盾')
    expect(buildUserMatchupNotes(note, ['帕克'])).toContain('被克制笔记：帕克：跳前先确认相位/沉默状态')
  })

  it('prefers structured per-opponent matchup notes when available', () => {
    const note = {
      hero: '斧王',
      reviewRules: [],
      matchupNotes: {
        '帕克': {
          opponentHero: '帕克',
          note: '等相位交掉再跳。',
          stance: 'counteredBy' as const,
          updatedAt: 1,
        },
      },
    }

    expect(buildUserMatchupNotes(note, ['帕克'])[0]).toBe('风险/被克制 vs 帕克：等相位交掉再跳。')
  })
})
