import type { HeroMatchupCache } from '../types'

export function shouldSeedBundledHeroMatchupCache(existing: HeroMatchupCache | null, bundled: HeroMatchupCache): boolean {
  if (bundled.matchupCount <= 0) return false
  if (!existing?.matchupCount) return true

  const sameScope = existing.source !== bundled.source || existing.rankBracket === bundled.rankBracket
  if (!sameScope) return false

  if (bundled.complete && !existing.complete) return true
  if (bundled.complete && bundled.matchupCount > existing.matchupCount) return true
  if (bundled.complete && bundled.heroCount > existing.heroCount) return true

  return (bundled.syncedAt ?? 0) > (existing.syncedAt ?? 0) && bundled.matchupCount >= existing.matchupCount
}
