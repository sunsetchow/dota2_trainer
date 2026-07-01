import type { DailyCheckin } from '../types'
import { dateFromDateKey, dateKeyFromDate, todayStr } from './cycle.ts'

export const MAX_FREEZE_TOKENS = 2
export const EARN_FREEZE_EVERY_N_DAYS = 7
export const MILESTONE_STREAKS = [21, 42, 100]

export function reconcileStreakFreeze(
  checkins: DailyCheckin[],
  freezeTokens: number,
  freezeUsedDates: string[],
): { freezeTokens: number; freezeUsedDates: string[]; changed: boolean } {
  const checkinDates = new Set(checkins.map(c => c.date))
  const covered = new Set(freezeUsedDates)
  let tokens = Math.max(0, Math.min(MAX_FREEZE_TOKENS, freezeTokens))
  let changed = tokens !== freezeTokens

  const mostRecentCheckin = [...checkinDates].sort().pop()
  if (!mostRecentCheckin) return { freezeTokens: tokens, freezeUsedDates: [...covered].sort(), changed }

  const cursor = dateFromDateKey(mostRecentCheckin)
  cursor.setDate(cursor.getDate() + 1)
  const yesterday = dateFromDateKey(todayStr())
  yesterday.setDate(yesterday.getDate() - 1)

  while (cursor.getTime() <= yesterday.getTime()) {
    const key = dateKeyFromDate(cursor)
    if (!checkinDates.has(key) && !covered.has(key)) {
      if (tokens > 0) {
        covered.add(key)
        tokens -= 1
        changed = true
      } else {
        break
      }
    }
    cursor.setDate(cursor.getDate() + 1)
  }

  return { freezeTokens: tokens, freezeUsedDates: [...covered].sort(), changed }
}

export function grantFreezeTokenIfEarned(streak: number, currentTokens: number): number {
  if (streak > 0 && streak % EARN_FREEZE_EVERY_N_DAYS === 0 && currentTokens < MAX_FREEZE_TOKENS) {
    return currentTokens + 1
  }
  return currentTokens
}

export function hitMilestoneToday(previousStreak: number, nextStreak: number): number | null {
  return MILESTONE_STREAKS.find(threshold => previousStreak !== threshold && nextStreak === threshold) ?? null
}
