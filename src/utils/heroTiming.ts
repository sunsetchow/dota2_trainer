import type { HeroTimingConfidence, HeroTimingLabel, HeroTimingProfile, HeroTimingSegment } from '../types'

export interface DurationBin {
  duration_bin: number
  games_played: number
  wins: number
}

export interface TimingHeroIdentity {
  id: number
  displayName: string
  localizedName?: string
}

export const MIN_SEGMENT_GAMES = 200
export const MIN_PEAK_BIN_GAMES = 100
export const MIN_TOTAL_GAMES_MEDIUM = 500
export const MIN_TOTAL_GAMES_HIGH = 2000

function isFiniteNonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && Number.isInteger(value) && value >= 0
}

export function sanitizeDurationBins(value: unknown): DurationBin[] {
  if (!Array.isArray(value)) throw new Error('durations 返回格式不是数组')

  return value.map((row, index) => {
    if (!row || typeof row !== 'object') throw new Error(`durations 第 ${index + 1} 行格式无效`)
    const candidate = row as Record<string, unknown>
    const durationBin = candidate.duration_bin
    const gamesPlayed = candidate.games_played
    const wins = candidate.wins
    if (!isFiniteNonNegativeInteger(durationBin)) throw new Error(`durations 第 ${index + 1} 行 duration_bin 无效`)
    if (!isFiniteNonNegativeInteger(gamesPlayed)) throw new Error(`durations 第 ${index + 1} 行 games_played 无效`)
    if (!isFiniteNonNegativeInteger(wins)) throw new Error(`durations 第 ${index + 1} 行 wins 无效`)
    if (wins > gamesPlayed) throw new Error(`durations 第 ${index + 1} 行 wins 大于 games_played`)
    return { duration_bin: durationBin, games_played: gamesPlayed, wins }
  })
}

export function calcSegment(
  bins: DurationBin[],
  minSecInclusive: number,
  maxSecExclusive: number,
): HeroTimingSegment {
  const segmentBins = bins.filter(bin => bin.duration_bin >= minSecInclusive && bin.duration_bin < maxSecExclusive)
  const games = segmentBins.reduce((sum, bin) => sum + bin.games_played, 0)
  const wins = segmentBins.reduce((sum, bin) => sum + bin.wins, 0)
  return {
    games,
    winRate: games >= MIN_SEGMENT_GAMES ? wins / games : null,
  }
}

export function deriveTimingLabel(profile: Pick<HeroTimingProfile, 'early' | 'mid' | 'late' | 'veryLate' | 'totalGames'>): HeroTimingLabel {
  const { early, mid, late, veryLate, totalGames } = profile
  const validCount = [early, mid, late, veryLate].filter(segment => segment.winRate !== null).length
  if (totalGames < MIN_TOTAL_GAMES_MEDIUM || validCount < 2) return 'insufficient_data'

  if (veryLate.winRate !== null && early.winRate !== null && veryLate.winRate - early.winRate > 0.08) return 'very_late'
  if (late.winRate !== null && mid.winRate !== null && early.winRate !== null && late.winRate > mid.winRate + 0.03 && late.winRate > early.winRate + 0.02) return 'late'
  if (early.winRate !== null && mid.winRate !== null && early.winRate > mid.winRate + 0.02) return 'early'
  if (mid.winRate !== null) {
    const comparable = [early, late].filter(segment => segment.winRate !== null)
    if (comparable.length > 0 && comparable.every(segment => mid.winRate !== null && segment.winRate !== null && mid.winRate > segment.winRate + 0.02)) return 'mid'
  }
  return 'balanced'
}

export function derivePeakMinute(bins: DurationBin[]): number | undefined {
  const candidates = bins.filter(bin => bin.games_played >= MIN_PEAK_BIN_GAMES)
  if (candidates.length === 0) return undefined
  const peak = candidates.reduce((best, bin) => (bin.wins / bin.games_played) > (best.wins / best.games_played) ? bin : best)
  return Math.round(peak.duration_bin / 60)
}

export function deriveConfidence(totalGames: number): HeroTimingConfidence {
  if (totalGames >= MIN_TOTAL_GAMES_HIGH) return 'high'
  if (totalGames >= MIN_TOTAL_GAMES_MEDIUM) return 'medium'
  return 'low'
}

export function deriveHeroTimingProfile(hero: TimingHeroIdentity, bins: DurationBin[]): HeroTimingProfile {
  const sortedBins = [...bins].sort((a, b) => a.duration_bin - b.duration_bin)
  const early = calcSegment(sortedBins, 0, 1800)
  const mid = calcSegment(sortedBins, 1800, 2700)
  const late = calcSegment(sortedBins, 2700, 3600)
  const veryLate = calcSegment(sortedBins, 3600, Number.POSITIVE_INFINITY)
  const totalGames = sortedBins.reduce((sum, bin) => sum + bin.games_played, 0)
  const labelInput = { early, mid, late, veryLate, totalGames }
  return {
    heroId: hero.id,
    displayName: hero.displayName,
    ...(hero.localizedName && { localizedName: hero.localizedName }),
    early,
    mid,
    late,
    veryLate,
    timingLabel: deriveTimingLabel(labelInput),
    ...(derivePeakMinute(sortedBins) !== undefined && { peakMinute: derivePeakMinute(sortedBins) }),
    totalGames,
    confidence: deriveConfidence(totalGames),
  }
}

export const TIMING_LABEL_ZH: Record<HeroTimingLabel, string> = {
  early: '前期',
  mid: '中期',
  late: '后期',
  very_late: '大后期',
  balanced: '均衡',
  insufficient_data: '数据少',
}
