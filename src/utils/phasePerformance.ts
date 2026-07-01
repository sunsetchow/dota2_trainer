import type { MatchLog } from '../types'

const PHASE_FIELD = {
  laning: 'laningGpm',
  mid: 'midGpm',
  late: 'lateGpm',
} as const

export type PhaseKey = keyof typeof PHASE_FIELD

const MIN_SAMPLES = 3

export function getPhaseRelativeScore(
  hero: string,
  phase: PhaseKey,
  currentValue: number | undefined,
  allLogs: MatchLog[],
  currentLogId?: string,
): number | null {
  if (currentValue === undefined) return null
  const field = PHASE_FIELD[phase]
  const history = allLogs
    .filter(log => log.id !== currentLogId && log.hero === hero && typeof log[field] === 'number')
    .map(log => log[field] as number)

  if (history.length < MIN_SAMPLES) return null
  const avg = history.reduce((sum, value) => sum + value, 0) / history.length
  if (avg === 0) return null
  return ((currentValue - avg) / avg) * 100
}
