import type { TrainingCycle, DailyCheckin } from '../types'

export function dateKeyFromDate(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function dateFromDateKey(dateKey: string): Date {
  const [year, month, day] = dateKey.split('-').map(Number)
  if (!year || !month || !day) return new Date(Number.NaN)
  return new Date(year, month - 1, day)
}

export function getWeekForTimestamp(ts: number, cycle: TrainingCycle): number {
  const startDate = dateFromDateKey(cycle.startDate)
  startDate.setHours(0, 0, 0, 0)
  const targetDate = new Date(ts)
  targetDate.setHours(0, 0, 0, 0)
  const start = startDate.getTime()
  const diffDays = Math.floor((targetDate.getTime() - start) / 86_400_000)
  return Math.max(0, Math.floor(diffDays / 7))
}

export function getCurrentWeek(cycle: TrainingCycle): number {
  return getWeekForTimestamp(Date.now(), cycle)
}

export function getDaysElapsed(cycle: TrainingCycle): number {
  const startDate = dateFromDateKey(cycle.startDate)
  startDate.setHours(0, 0, 0, 0)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const diffDays = Math.floor((today.getTime() - startDate.getTime()) / 86_400_000)
  return diffDays < 0 ? 0 : diffDays + 1
}

// calcStreak: 今日未打卡时沿用昨天的 streak 而非归零
export function calcStreak(checkins: DailyCheckin[]): number {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const yesterday = new Date(today)
  yesterday.setDate(yesterday.getDate() - 1)

  const dates = [...new Set(checkins.map(c => c.date))].sort().reverse()
  if (dates.length === 0) return 0

  const mostRecent = dateFromDateKey(dates[0])
  mostRecent.setHours(0, 0, 0, 0)
  const isToday = mostRecent.getTime() === today.getTime()
  const isYesterday = mostRecent.getTime() === yesterday.getTime()
  if (!isToday && !isYesterday) return 0 // 超过 1 天没打卡，streak 断了

  let streak = 0
  let expected = isToday ? today : yesterday
  for (const dateStr of dates) {
    const d = dateFromDateKey(dateStr)
    d.setHours(0, 0, 0, 0)
    if (d.getTime() === expected.getTime()) {
      streak++
      expected = new Date(expected)
      expected.setDate(expected.getDate() - 1)
    } else {
      break
    }
  }
  return streak
}

export function calcLongestStreak(checkins: DailyCheckin[]): number {
  const dates = [...new Set(checkins.map(c => c.date))].sort()
  if (dates.length === 0) return 0

  let longest = 0
  let current = 0
  let previous: Date | null = null

  for (const dateStr of dates) {
    const currentDate = dateFromDateKey(dateStr)
    currentDate.setHours(0, 0, 0, 0)

    if (!previous) {
      current = 1
    } else {
      const diffDays = Math.round((currentDate.getTime() - previous.getTime()) / 86_400_000)
      current = diffDays === 1 ? current + 1 : 1
    }

    longest = Math.max(longest, current)
    previous = currentDate
  }

  return longest
}

export function todayStr(): string {
  return dateKeyFromDate(new Date())
}

// 连败检测：用 findIndex，不用 takeWhile（Array 没有此方法）
export function countRecentLosses(logs: Array<{ result: string; timestamp: number }>): number {
  const recent = [...logs].sort((a, b) => b.timestamp - a.timestamp).slice(0, 10)
  const firstWinIdx = recent.findIndex(m => m.result !== 'loss')
  return firstWinIdx === -1 ? recent.length : firstWinIdx
}
