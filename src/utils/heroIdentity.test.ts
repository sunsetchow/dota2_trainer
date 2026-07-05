import { describe, expect, it } from 'vitest'
import { compactHeroIdMap, compactHeroIds, getCanonicalHeroName, getCanonicalHeroNameByReference, getDisplayHeroName, getHeroIdByName, getHeroNameById, sameHeroReference } from './heroIdentity.ts'

describe('hero identity helpers', () => {
  it('resolves display names, English names, raw OpenDota names, and aliases to stable hero ids', () => {
    expect(getHeroIdByName('斧王')).toBe(2)
    expect(getHeroIdByName('Axe')).toBe(2)
    expect(getHeroIdByName('npc_dota_hero_axe')).toBe(2)
    expect(getHeroIdByName('Anti-Mage')).toBe(1)
    expect(getHeroNameById(2)).toBe('斧王')
    expect(getHeroIdByName('Largo')).toBe(155)
    expect(getCanonicalHeroName('Largo')).toBe('朗戈')
    expect(getCanonicalHeroNameByReference({ hero: 'Largo', heroId: 155 })).toBe('朗戈')
  })

  it('keeps id-to-name lookups on the real current localized name, not a stale heroes.json alias target', () => {
    // 用 Stratz 官方语言字段（constants.heroes(language: S_CHINESE)，直接来自 V 社客户端本地化数据）
    // 核实过：id 64 的官方中文名是"杰奇洛"，heroes.json 以前的 alias 表把它错误地 canonical 到
    // "双头龙"（一个过时/不存在的旧名）。同理 id 102 是"亚巴顿"，不是"阿巴顿"。
    // "双头龙"/"阿巴顿" 仍然保留在 alias 表左侧，只是为了兼容可能存的旧持久化数据，不应该再被当成
    // canonical 名吐回给调用方。
    expect(getHeroNameById(64)).toBe('杰奇洛')
    expect(getHeroIdByName('杰奇洛')).toBe(64)
    expect(getHeroIdByName('双头龙')).toBe(64)
    expect(getCanonicalHeroName('双头龙')).toBe('杰奇洛')
    expect(getHeroNameById(102)).toBe('亚巴顿')
    expect(getHeroIdByName('阿巴顿')).toBe(102)
    // id 101 是 Skywrath Mage，官方名"天怒法师"；"天穹守望者"是另一个英雄 Arc Warden（id 113）的
    // 真实官方名，两者不是同一个英雄，heroes.json 以前的 alias 表把"天怒法师"错误地指向了
    // "天穹守望者"，会让搜索/统计把两个不同英雄的数据混在一起。
    expect(getHeroNameById(101)).toBe('天怒法师')
    expect(getHeroNameById(113)).toBe('天穹守望者')
    expect(getHeroIdByName('天怒法师')).toBe(101)
    expect(getHeroIdByName('SM')).toBe(101)
  })

  it('switches hero display name with language while leaving the canonical zh string untouched', () => {
    expect(getDisplayHeroName('斧王', 'zh')).toBe('斧王')
    expect(getDisplayHeroName('斧王', 'en')).toBe('Axe')
    // The three heroes fixed in the alias-table bugfix are exactly where a wrong
    // resolution would previously have surfaced (either falling through to the
    // canonical zh string unresolved, or resolving to the wrong hero's English name).
    expect(getDisplayHeroName('杰奇洛', 'en')).toBe('Jakiro')
    expect(getDisplayHeroName('亚巴顿', 'en')).toBe('Abaddon')
    expect(getDisplayHeroName('天怒法师', 'en')).toBe('Skywrath Mage')
    // Unresolvable input falls back to the input itself rather than an empty string.
    expect(getDisplayHeroName('不存在的英雄', 'en')).toBe('不存在的英雄')
    expect(getDisplayHeroName(undefined, 'en')).toBe('')
    expect(getDisplayHeroName('  ', 'en')).toBe('')
  })

  it('compares renamed hero records by id and falls back to resolved names', () => {
    expect(sameHeroReference({ hero: '旧斧王', heroId: 2 }, { hero: '斧王' })).toBe(true)
    expect(sameHeroReference({ hero: '斧王' }, { hero: 'Axe' })).toBe(true)
    expect(sameHeroReference({ hero: '斧王' }, { hero: '帕克' })).toBe(false)
  })

  it('builds compact id collections and omits unresolved empty maps', () => {
    expect(compactHeroIds(['帕克', '敌法师', '帕克'])).toEqual([13, 1])
    expect(compactHeroIdMap({ '1': '敌法师', '2': 'unknown' })).toEqual({ '1': 1 })
    expect(compactHeroIdMap({})).toBeUndefined()
  })
})
