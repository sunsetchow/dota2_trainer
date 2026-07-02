import { describe, expect, it } from 'vitest'

import { getPositionHotHeroPlaceholder } from './DraftAssistant'
import type { PositionMetaSnapshot } from '../types'

const meta: PositionMetaSnapshot = {
  source: 'manual',
  weekKey: '2026-W27',
  syncedAt: 1,
  topN: 3,
  positions: {
    '1': [
      { hero: '敌法师', weight: 1 },
      { hero: '斯拉克', weight: 0.9 },
      { hero: '主宰', weight: 0.8 },
    ],
    '2': [
      { hero: '帕克', weight: 1 },
      { hero: '风暴之灵', weight: 0.9 },
      { hero: '痛苦女王', weight: 0.8 },
    ],
    '3': [
      { hero: '斧王', weight: 1 },
      { hero: '半人马战行者', weight: 0.9 },
      { hero: '潮汐猎人', weight: 0.8 },
    ],
    '4': [
      { hero: '拉比克', weight: 1 },
      { hero: '巨牙海民', weight: 0.9 },
      { hero: '森海飞霞', weight: 0.8 },
    ],
    '5': [
      { hero: '水晶室女', weight: 1 },
      { hero: '巫医', weight: 0.9 },
      { hero: '术士', weight: 0.8 },
    ],
  },
}

describe('DraftAssistant enemy input placeholders', () => {
  it('uses the top 3 hot heroes for each enemy position', () => {
    expect(getPositionHotHeroPlaceholder('1', meta)).toBe('如：敌法师、斯拉克、主宰')
    expect(getPositionHotHeroPlaceholder('2', meta)).toBe('如：帕克、风暴之灵、痛苦女王')
    expect(getPositionHotHeroPlaceholder('3', meta)).toBe('如：斧王、半人马战行者、潮汐猎人')
    expect(getPositionHotHeroPlaceholder('4', meta)).toBe('如：拉比克、巨牙海民、森海飞霞')
    expect(getPositionHotHeroPlaceholder('5', meta)).toBe('如：水晶室女、巫医、术士')
  })
})
