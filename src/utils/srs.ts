import { dateFromDateKey, dateKeyFromDate } from './cycle.ts'

export type SrsRating = 'forgot' | 'hard' | 'good' | 'easy'

const DEFAULT_EASE = 2.5
const MIN_EASE = 1.3

export function applySrsRating(
  current: { ease?: number; intervalDays?: number },
  rating: SrsRating,
  today: string,
): { ease: number; intervalDays: number; nextReviewDate: string } {
  const ease = current.ease ?? DEFAULT_EASE
  const interval = current.intervalDays ?? 1
  let nextEase = ease
  let nextInterval: number

  switch (rating) {
    case 'forgot':
      nextInterval = Math.max(1, Math.round(interval * 0.1))
      nextEase = Math.max(MIN_EASE, ease - 0.2)
      break
    case 'hard':
      nextInterval = Math.max(1, Math.round(interval * 1.2))
      nextEase = Math.max(MIN_EASE, ease - 0.15)
      break
    case 'good':
      nextInterval = Math.max(1, Math.round(interval * ease))
      break
    case 'easy':
      nextInterval = Math.max(1, Math.round(interval * ease * 1.3))
      nextEase = ease + 0.15
      break
  }

  const next = dateFromDateKey(today)
  next.setDate(next.getDate() + nextInterval)

  return {
    ease: nextEase,
    intervalDays: nextInterval,
    nextReviewDate: dateKeyFromDate(next),
  }
}

export function isDueForReview(note: { srsNextReviewDate?: string }, today: string): boolean {
  if (!note.srsNextReviewDate) return true
  return note.srsNextReviewDate <= today
}
