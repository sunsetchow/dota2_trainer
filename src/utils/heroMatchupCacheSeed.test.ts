import { describe, expect, it } from 'vitest'

import { shouldSeedBundledHeroMatchupCache } from './heroMatchupCacheSeed'
import type { HeroMatchupCache } from '../types'

const bundled: HeroMatchupCache = {
  source: 'stratz',
  syncedAt: 100,
  date: '2026-07-01',
  weekKey: '2026-W27',
  expiresAt: 200,
  complete: true,
  heroCount: 127,
  matchupCount: 16002,
  rankBracket: 'ALL',
  matchups: {},
}

function existing(overrides: Partial<HeroMatchupCache>): HeroMatchupCache {
  return {
    ...bundled,
    syncedAt: 300,
    ...overrides,
  }
}

describe('shouldSeedBundledHeroMatchupCache', () => {
  it('seeds when no cache exists', () => {
    expect(shouldSeedBundledHeroMatchupCache(null, bundled)).toBe(true)
  })

  it('replaces stale same-scope Stratz caches that are missing heroes or matchup pairs', () => {
    expect(shouldSeedBundledHeroMatchupCache(existing({ heroCount: 126, matchupCount: 15751 }), bundled)).toBe(true)
  })

  it('does not clobber a fresher Stratz cache for a different rank bracket', () => {
    expect(shouldSeedBundledHeroMatchupCache(existing({ rankBracket: 'DIVINE_IMMORTAL', heroCount: 126, matchupCount: 15751 }), bundled)).toBe(false)
  })

  it('allows bundled Stratz data to replace non-Stratz matchup caches', () => {
    expect(shouldSeedBundledHeroMatchupCache(existing({ source: 'opendota', rankBracket: undefined, heroCount: 126, matchupCount: 15751 }), bundled)).toBe(true)
  })
})
