import { describe, expect, it } from 'vitest'
import { compactHeroIdMap, compactHeroIds, getCanonicalHeroName, getCanonicalHeroNameByReference, getHeroIdByName, getHeroNameById, sameHeroReference } from './heroIdentity.ts'

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
