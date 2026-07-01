import type {
  DotaPosition,
  DraftReason,
  EnemyByPosition,
  HeroConfig,
  HeroMatchupCache,
  PositionMetaSnapshot,
  RankedDraftHero,
} from '../types'

export const POSITIONS = ['1', '2', '3', '4', '5'] as const

export const POSITION_LABELS: Record<DotaPosition, string> = {
  '1': '1号位',
  '2': '2号位',
  '3': '3号位',
  '4': '4号位',
  '5': '5号位',
}

export const POSITION_WEIGHTS: Record<DotaPosition, number> = {
  '1': 1.35,
  '2': 1.15,
  '3': 0.75,
  '4': 0.9,
  '5': 0.85,
}

export const UNKNOWN_POSITION_FACTOR = 0.35
export const MIN_SAMPLE_FLOOR = 10
export const KNOWN_RISK_WARNING = 5

const PROFICIENCY_WEIGHTS: Record<NonNullable<HeroConfig['tier']>, number> = {
  main: 8,
  practice: 3,
  backup: -4,
}

interface MatchupLookup {
  advantage: number
  gamesPlayed?: number
  source: 'stratz' | 'opendota' | 'static'
}

interface RankDraftHeroesInput {
  candidates: string[]
  enemyByPosition: EnemyByPosition
  heroPool: HeroConfig[]
  matchupCache: HeroMatchupCache | null
  positionMeta: PositionMetaSnapshot
  matchupMinGames: number
  counters: Record<string, Record<string, number>>
  countered: Record<string, Record<string, number>>
  supportMap: Record<string, Record<string, number>>
}

function signed(value: number): string {
  return `${value >= 0 ? '+' : ''}${value.toFixed(1)}`
}

function tierLabel(tier?: HeroConfig['tier'], active = false): string {
  if (!active) return '池外'
  if (tier === 'main') return '主力'
  if (tier === 'practice' || !tier) return '练习'
  if (tier === 'backup') return '备用'
  return '池外'
}

function getProficiencyScore(config?: HeroConfig): number {
  if (!config?.active) return -12
  if (!config.tier) return PROFICIENCY_WEIGHTS.practice
  return PROFICIENCY_WEIGHTS[config.tier]
}

function getDynamicLookup(
  candidate: string,
  enemy: string,
  matchupCache: HeroMatchupCache | null,
  matchupMinGames: number,
): MatchupLookup | null {
  const stats = matchupCache?.matchups[candidate]?.[enemy]
  if (!stats || stats.gamesPlayed < MIN_SAMPLE_FLOOR) return null
  const confidence = Math.min(1, stats.gamesPlayed / matchupMinGames)
  return {
    advantage: stats.advantage * confidence,
    gamesPlayed: stats.gamesPlayed,
    source: matchupCache.source,
  }
}

function getStaticLookup(
  candidate: string,
  enemy: string,
  counters: Record<string, Record<string, number>>,
  countered: Record<string, Record<string, number>>,
  supportMap: Record<string, Record<string, number>>,
): MatchupLookup | null {
  const counterAdvantage = counters[candidate]?.[enemy]
  if (typeof counterAdvantage === 'number' && counterAdvantage !== 0) {
    return { advantage: counterAdvantage, source: 'static' }
  }

  const counteredByAdvantage = countered[candidate]?.[enemy]
  if (typeof counteredByAdvantage === 'number' && counteredByAdvantage !== 0) {
    return { advantage: -counteredByAdvantage, source: 'static' }
  }

  const supportThreat = supportMap[enemy]?.[candidate]
  if (typeof supportThreat === 'number' && supportThreat !== 0) {
    return { advantage: -supportThreat, source: 'static' }
  }

  return null
}

function getMatchupLookup(
  candidate: string,
  enemy: string,
  input: RankDraftHeroesInput,
): MatchupLookup | null {
  return getDynamicLookup(candidate, enemy, input.matchupCache, input.matchupMinGames)
    ?? getStaticLookup(candidate, enemy, input.counters, input.countered, input.supportMap)
}

function knownReason(position: DotaPosition, enemy: string, lookup: MatchupLookup, weightedScore: number): DraftReason {
  const games = lookup.gamesPlayed ? `（${lookup.gamesPlayed}局）` : ''
  const source = lookup.source === 'static' ? '本地表' : lookup.source === 'stratz' ? 'Stratz' : 'OpenDota'
  return {
    type: weightedScore >= 0 ? 'known-counter' : 'known-risk',
    label: `${weightedScore >= 0 ? '反制' : '风险'}：${POSITION_LABELS[position]} ${enemy} 胜率 ${signed(lookup.advantage)}%${games} · ${source} ×${POSITION_WEIGHTS[position]}`,
    score: weightedScore,
    position,
    enemy,
    gamesPlayed: lookup.gamesPlayed,
    source: lookup.source,
  }
}

function rankReason(reason: DraftReason): number {
  if (reason.type === 'proficiency') return 0.5
  return Math.abs(reason.score)
}

export function rankDraftHeroes(input: RankDraftHeroesInput): RankedDraftHero[] {
  const poolByHero = new Map(input.heroPool.map(item => [item.name, item]))
  const knownEntries = POSITIONS
    .map(position => ({ position, enemy: input.enemyByPosition[position] }))
    .filter((item): item is { position: DotaPosition; enemy: string } => Boolean(item.enemy))
  const unknownPositions = POSITIONS.filter(position => !input.enemyByPosition[position])

  return input.candidates.map(hero => {
    const config = poolByHero.get(hero)
    const proficiencyScore = getProficiencyScore(config)
    const proficiencyLabel = tierLabel(config?.tier, Boolean(config?.active))
    const reasons: DraftReason[] = []

    let knownScore = 0
    let knownCounterScore = 0
    let knownRiskScore = 0

    for (const { position, enemy } of knownEntries) {
      const lookup = getMatchupLookup(hero, enemy, input)
      if (!lookup) continue
      const weightedScore = lookup.advantage * POSITION_WEIGHTS[position]
      knownScore += weightedScore
      if (weightedScore >= 0) knownCounterScore += weightedScore
      else knownRiskScore += Math.abs(weightedScore)
      reasons.push(knownReason(position, enemy, lookup, weightedScore))
    }

    let unknownScore = 0
    let unknownCounterScore = 0
    let unknownRiskScore = 0

    for (const position of unknownPositions) {
      const metaHeroes = input.positionMeta.positions[position] ?? []
      let weightedTotal = 0
      let totalWeight = 0
      const contributors: Array<{ enemy: string; score: number; weight: number }> = []

      for (const metaHero of metaHeroes) {
        if (metaHero.hero === hero) continue
        const lookup = getMatchupLookup(hero, metaHero.hero, input)
        if (!lookup) continue
        weightedTotal += lookup.advantage * metaHero.weight
        totalWeight += metaHero.weight
        contributors.push({ enemy: metaHero.hero, score: lookup.advantage, weight: metaHero.weight })
      }

      if (totalWeight <= 0) continue
      const avg = weightedTotal / totalWeight
      const score = avg * POSITION_WEIGHTS[position] * UNKNOWN_POSITION_FACTOR
      unknownScore += score
      if (score >= 0) unknownCounterScore += score
      else unknownRiskScore += Math.abs(score)

      const top = contributors
        .sort((a, b) => Math.abs(b.score * b.weight) - Math.abs(a.score * a.weight))
        .slice(0, 3)
        .map(item => `${item.enemy} ${signed(item.score)}%`)
        .join(' / ')
      reasons.push({
        type: score >= 0 ? 'unknown-counter' : 'unknown-risk',
        label: `${score >= 0 ? '机会' : '风险'}：未知 ${POSITION_LABELS[position]} 热门预期 ${signed(score)}（${top}）`,
        score,
        position,
        source: 'meta',
      })
    }

    reasons.push({
      type: 'proficiency',
      label: `熟练度：${proficiencyLabel} ${signed(proficiencyScore)}`,
      score: proficiencyScore,
      source: 'meta',
    })

    const totalScore = knownScore + unknownScore + proficiencyScore
    return {
      hero,
      knownScore,
      unknownScore,
      proficiencyScore,
      totalScore,
      knownCounterScore,
      knownRiskScore,
      unknownCounterScore,
      unknownRiskScore,
      reasons: reasons.sort((a, b) => rankReason(b) - rankReason(a)),
      poolTier: config?.tier,
      proficiencyLabel,
    }
  }).sort((a, b) => b.totalScore - a.totalScore)
}

export function scoreFormula(item: RankedDraftHero): string {
  return `综合 ${Math.round(item.totalScore)} = 已知 ${signed(item.knownScore)} + 未知 ${signed(item.unknownScore)} + 熟练度 ${signed(item.proficiencyScore)}`
}

export function recommendationTone(item: RankedDraftHero, index: number): 'success' | 'accent' | 'warning' {
  if (index <= 2 && item.totalScore > 0 && item.knownRiskScore < KNOWN_RISK_WARNING) return 'success'
  if (item.knownRiskScore >= KNOWN_RISK_WARNING || item.totalScore < 0) return 'warning'
  return 'accent'
}

export function recommendationLabel(item: RankedDraftHero, index: number): string {
  if (index <= 2 && item.totalScore > 0 && item.knownRiskScore < KNOWN_RISK_WARNING) return '推荐'
  if (item.knownRiskScore >= KNOWN_RISK_WARNING || item.totalScore < 0) return '谨慎'
  return '可选'
}
