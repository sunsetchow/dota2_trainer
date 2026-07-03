import { describe, expect, it } from 'vitest'

import {
  calcSegment,
  deriveHeroTimingProfile,
  derivePeakMinute,
  deriveTimingLabel,
  MIN_SEGMENT_GAMES,
  sanitizeDurationBins,
} from './heroTiming'

const baseSegments = {
  early: { winRate: 0.45, games: 500 },
  mid: { winRate: 0.50, games: 600 },
  late: { winRate: 0.52, games: 700 },
  veryLate: { winRate: null, games: 50 },
}

describe('hero timing utilities', () => {
  it('calculates weighted segment win rates and returns null for low-sample segments', () => {
    expect(calcSegment([
      { duration_bin: 900, games_played: 100, wins: 40 },
      { duration_bin: 1200, games_played: 150, wins: 90 },
      { duration_bin: 1800, games_played: 999, wins: 999 },
    ], 0, 1800)).toEqual({ games: 250, winRate: 0.52 })

    expect(calcSegment([
      { duration_bin: 900, games_played: MIN_SEGMENT_GAMES - 1, wins: 120 },
    ], 0, 1800)).toEqual({ games: MIN_SEGMENT_GAMES - 1, winRate: null })
  })

  it('does not mark a hero very late just because very-late data is low sample', () => {
    expect(deriveTimingLabel({
      totalGames: 1200,
      early: { winRate: 0.40, games: 800 },
      mid: { winRate: 0.43, games: 300 },
      late: { winRate: null, games: 80 },
      veryLate: { winRate: null, games: 12 },
    })).not.toBe('very_late')
  })

  it('derives timing labels for clear late and balanced profiles', () => {
    expect(deriveTimingLabel({
      ...baseSegments,
      totalGames: 1800,
      late: { winRate: 0.56, games: 700 },
    })).toBe('late')

    expect(deriveTimingLabel({
      ...baseSegments,
      totalGames: 1800,
      early: { winRate: 0.50, games: 500 },
      mid: { winRate: 0.51, games: 600 },
      late: { winRate: 0.50, games: 700 },
    })).toBe('balanced')
  })

  it('returns insufficient_data when total games or valid segments are too low', () => {
    expect(deriveTimingLabel({
      totalGames: 499,
      early: { winRate: 0.60, games: 400 },
      mid: { winRate: 0.40, games: 80 },
      late: { winRate: null, games: 10 },
      veryLate: { winRate: null, games: 0 },
    })).toBe('insufficient_data')
  })

  it('ignores tiny perfect-win bins when deriving peak minute', () => {
    expect(derivePeakMinute([
      { duration_bin: 7200, games_played: 1, wins: 1 },
      { duration_bin: 2400, games_played: 120, wins: 66 },
      { duration_bin: 2700, games_played: 200, wins: 104 },
    ])).toBe(40)
  })

  it('rejects malformed duration bins before deriving profiles', () => {
    expect(() => sanitizeDurationBins([
      { duration_bin: 900, games_played: 10, wins: 11 },
    ])).toThrow(/wins 大于 games_played/)
    expect(() => sanitizeDurationBins({ duration_bin: 900 })).toThrow(/不是数组/)
  })

  it('builds canonical display-name profiles from unsorted duration bins', () => {
    const profile = deriveHeroTimingProfile({ id: 155, displayName: '朗戈', localizedName: 'Largo' }, [
      { duration_bin: 3300, games_played: 80, wins: 45 },
      { duration_bin: 900, games_played: 250, wins: 125 },
      { duration_bin: 2400, games_played: 400, wins: 230 },
      { duration_bin: 1800, games_played: 220, wins: 120 },
      { duration_bin: 300, games_played: 1, wins: 1 },
    ])

    expect(profile).toMatchObject({
      heroId: 155,
      displayName: '朗戈',
      localizedName: 'Largo',
      early: { games: 251 },
      mid: { games: 620 },
      timingLabel: 'mid',
      confidence: 'medium',
    })
  })
})
