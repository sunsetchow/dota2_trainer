import { describe, expect, it } from 'vitest'
import { getConfiguredHeroPositions, isHeroPlayableAtPosition } from './heroPool.ts'
import type { HeroConfig } from '../types'

const hero = '敌法师'

describe('hero pool position configuration', () => {
  it('falls back to bundled defaults for legacy configs with undefined positions', () => {
    const config: HeroConfig = { name: hero, active: true }

    expect(getConfiguredHeroPositions(hero, config)).toEqual(['1'])
    expect(isHeroPlayableAtPosition(hero, '1', config)).toBe(true)
  })

  it('preserves an explicit empty positions array as user intent', () => {
    const config: HeroConfig = { name: hero, active: true, positions: [] }

    expect(getConfiguredHeroPositions(hero, config)).toEqual([])
    expect(isHeroPlayableAtPosition(hero, '1', config)).toBe(false)
  })

  it('uses custom configured positions exactly', () => {
    const config: HeroConfig = { name: hero, active: true, positions: ['3', '4'] }

    expect(getConfiguredHeroPositions(hero, config)).toEqual(['3', '4'])
    expect(isHeroPlayableAtPosition(hero, '3', config)).toBe(true)
    expect(isHeroPlayableAtPosition(hero, '1', config)).toBe(false)
  })
})
