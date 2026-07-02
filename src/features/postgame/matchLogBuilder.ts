import type { MatchLog, OpenDotaImportedMatch, PreGameSetup, TrainingDimension } from '../../types'

export interface PostGameMatchLogInput {
  id: string
  activeCycleId: string
  hero: string
  result: 'win' | 'loss'
  durationMin: string
  trainingGoalMet: 'yes' | 'partial' | 'no'
  biggestMistake: string
  nextGameFocus: string
  reviewDimension?: TrainingDimension | ''
  reviewTopic?: string
  worstDeathZone?: 'green' | 'orange' | 'red' | ''
  laneResult?: 'dominated' | 'even' | 'lost' | ''
  firstKeyItemMin?: string
  goodInitiations?: string
  draftScore?: 1 | 2 | 3 | 4 | 5 | 0
  csAt10?: string
  cleanMatchId?: string
  importedMatch?: OpenDotaImportedMatch | null
  pendingSetup?: PreGameSetup | null
  notes?: string
  reviewClipDeath?: string
  reviewClipFight?: string
  reviewClipObjective?: string
}

function parseOptionalInt(value?: string): number | undefined {
  const trimmed = value?.trim()
  if (!trimmed) return undefined
  const parsed = parseInt(trimmed, 10)
  return Number.isFinite(parsed) ? parsed : undefined
}

export function buildPostGameMatchLog(input: PostGameMatchLogInput): MatchLog {
  const cleanMatchId = input.cleanMatchId?.trim() ?? ''
  const imported = input.importedMatch?.matchId === cleanMatchId ? input.importedMatch : null
  const firstKeyItemMin = parseOptionalInt(input.firstKeyItemMin)
  const goodInitiations = parseOptionalInt(input.goodInitiations)
  const csAt10 = parseOptionalInt(input.csAt10)

  return {
    id: input.id,
    timestamp: imported?.timestamp ?? Date.now(),
    hero: input.hero.trim(),
    result: input.result,
    durationMin: parseInt(input.durationMin, 10),
    trainingGoalMet: input.trainingGoalMet,
    biggestMistake: input.biggestMistake.trim(),
    nextGameFocus: input.nextGameFocus.trim(),
    cycleId: input.activeCycleId,
    ...(input.reviewDimension && { reviewDimension: input.reviewDimension }),
    ...(input.reviewTopic?.trim() && { reviewTopic: input.reviewTopic.trim() }),
    ...(input.worstDeathZone && { worstDeathZone: input.worstDeathZone }),
    ...(input.laneResult && { laneResult: input.laneResult }),
    ...(firstKeyItemMin !== undefined && { firstKeyItemMin }),
    ...(imported?.firstKeyItemName && { firstKeyItemName: imported.firstKeyItemName }),
    ...(goodInitiations !== undefined && { goodInitiations }),
    ...(input.draftScore && input.draftScore > 0 && { draftScore: input.draftScore as 1 | 2 | 3 | 4 | 5 }),
    ...(csAt10 !== undefined && { csAt10 }),
    ...(input.pendingSetup?.enemyCarry && { enemyCarry: input.pendingSetup.enemyCarry }),
    ...(input.pendingSetup?.enemySupports?.length && { enemySupports: input.pendingSetup.enemySupports }),
    ...(imported?.enemyHeroes?.length && { enemyHeroes: imported.enemyHeroes }),
    ...(cleanMatchId && { matchId: cleanMatchId }),
    ...(imported && {
      source: 'opendota' as const,
      heroId: imported.heroId,
      kills: imported.kills,
      deaths: imported.deaths,
      assists: imported.assists,
      lastHits: imported.lastHits,
      denies: imported.denies,
      dnAt10: imported.dnAt10,
      gpm: imported.gpm,
      xpm: imported.xpm,
      level: imported.level,
      laneRole: imported.laneRole,
      laneEfficiency: imported.laneEfficiency,
      laneKills: imported.laneKills,
      playerSlot: imported.playerSlot,
      isRadiant: imported.isRadiant,
      opendotaImportedAt: Date.now(),
      gpmPercentile: imported.gpmPercentile,
      xpmPercentile: imported.xpmPercentile,
      lastHitsPercentile: imported.lastHitsPercentile,
      heroDamagePercentile: imported.heroDamagePercentile,
      laningGpm: imported.laningGpm,
      midGpm: imported.midGpm,
      lateGpm: imported.lateGpm,
    }),
    ...(input.notes?.trim() && { notes: input.notes.trim() }),
    ...(input.reviewClipDeath?.trim() && { reviewClipDeath: input.reviewClipDeath.trim() }),
    ...(input.reviewClipFight?.trim() && { reviewClipFight: input.reviewClipFight.trim() }),
    ...(input.reviewClipObjective?.trim() && { reviewClipObjective: input.reviewClipObjective.trim() }),
  }
}
