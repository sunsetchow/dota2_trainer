import React from 'react'
import { useNavigate } from 'react-router-dom'
import { useAppState, useCycles, useDailyCheckins } from '../store/useStore.ts'
import { calcLongestStreak, calcStreak, dateKeyFromDate, getCurrentWeek, todayStr } from '../utils/cycle.ts'
import checklistData from '../data/checklist.json'
import type { ChecklistItem } from '../types'

const CHECKLIST_ITEMS = checklistData as ChecklistItem[]
const checklistById = new Map(CHECKLIST_ITEMS.map(item => [item.id, item]))

const dimensionLabels: Record<string, string> = {
  ops: '操作',
  pregame: '局外',
  economy: '经济',
  combat: '战斗',
  objective: '目标',
  discipline: '纪律',
  review: '复盘',
}

function getDateStr(date: Date): string {
  return dateKeyFromDate(date)
}

function weekLabel(week: number): string {
  return week === 0 ? '基线周' : `第 ${week} 周`
}

export default function TrainingPlan() {
  const navigate = useNavigate()
  const { appState } = useAppState()
  const { cycles } = useCycles()
  const { checkins } = useDailyCheckins()

  const activeCycle = cycles.find(c => c.cycleId === appState?.activeCycleId)
  const currentWeek = activeCycle ? getCurrentWeek(activeCycle) : 0
  const streak = calcStreak(checkins)
  const longestStreak = calcLongestStreak(checkins)
  const today = todayStr()
  const checkinDates = new Set(checkins.map(c => c.date))

  if (!activeCycle) {
    return (
      <div className="p-6 text-center text-[var(--text-muted)]">
        <p>加载中...</p>
      </div>
    )
  }

  const currentTheme = activeCycle.weekThemes.find(wt => wt.week === currentWeek)
  const currentItems = (currentTheme?.checklistItemIds ?? [])
    .map(id => checklistById.get(id))
    .filter((item): item is ChecklistItem => Boolean(item))

  const calendarWeeks = activeCycle.weekThemes.map(wt => {
    const weekStart = new Date(activeCycle.startDate)
    weekStart.setDate(weekStart.getDate() + wt.week * 7)
    const days = Array.from({ length: 7 }, (_, i) => {
      const date = new Date(weekStart)
      date.setDate(date.getDate() + i)
      return date
    })
    const hasCheckin = days.some(day => checkinDates.has(getDateStr(day)))
    return { ...wt, days, hasCheckin }
  })

  return (
    <div className="p-6 space-y-6 max-w-2xl mx-auto">
      <div>
        <button type="button" onClick={() => navigate('/')} className="text-xs text-[var(--text-muted)] hover:text-[var(--text-secondary)] mb-3">
          ← 返回
        </button>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-[var(--text-primary)]">8 周训练计划</h1>
            <p className="text-sm text-[var(--text-muted)]">起始日：{activeCycle.startDate}</p>
          </div>
          <button
            type="button"
            onClick={() => navigate('/')}
            className="px-3 py-1.5 rounded-lg bg-[var(--accent)] text-[var(--text-primary)] text-sm font-semibold hover:bg-[var(--accent-strong)] transition-colors"
          >
            今日打卡
          </button>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="px-3 py-2 rounded-lg bg-[var(--surface-1)] border border-[var(--border)]">
          <div className="text-xs text-[var(--text-muted)]">当前周</div>
          <div className="mt-1 text-lg font-semibold text-[var(--text-primary)]">{weekLabel(currentWeek)}</div>
        </div>
        <div className="px-3 py-2 rounded-lg bg-[var(--surface-1)] border border-[var(--border)]">
          <div className="text-xs text-[var(--text-muted)]">连训</div>
          <div className="mt-1 text-lg font-semibold text-[var(--text-primary)]">{streak} 天</div>
        </div>
        <div className="px-3 py-2 rounded-lg bg-[var(--surface-1)] border border-[var(--border)]">
          <div className="text-xs text-[var(--text-muted)]">最长</div>
          <div className="mt-1 text-lg font-semibold text-[var(--text-primary)]">{longestStreak} 天</div>
        </div>
      </div>

      {currentTheme && (
        <section className="space-y-3">
          <div>
            <h2 className="text-sm font-semibold text-[var(--text-secondary)] uppercase tracking-wider">当周重点</h2>
            <p className="text-sm text-[var(--text-muted)] mt-1">{currentTheme.theme}</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {currentItems.map(item => (
              <div key={item.id} className="px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--surface-1)]">
                <div className="text-sm text-[var(--text-primary)]">{item.label}</div>
                <div className="mt-1 text-xs text-[var(--text-muted)]">
                  {dimensionLabels[item.dimension] ?? item.dimension} · {item.sessionTypes.join(' / ')}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-[var(--text-secondary)] uppercase tracking-wider">打卡日历</h2>
        {calendarWeeks.map(wt => {
          const isCurrentWeek = wt.week === currentWeek
          const isPast = wt.week < currentWeek
          return (
            <div
              key={wt.week}
              className={`rounded-xl border p-3 transition-all ${
                isCurrentWeek
                  ? 'border-[var(--accent-border)] bg-[var(--accent-muted)]'
                  : isPast
                    ? 'border-[var(--border)] bg-[var(--surface-1)] opacity-70'
                    : 'border-[var(--border)] bg-[var(--surface-1)]'
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span className={`text-xs font-bold px-2 py-0.5 rounded shrink-0 ${
                    isCurrentWeek ? 'bg-[var(--accent-muted)] text-[var(--accent-strong)]' : 'bg-[var(--surface-2)] text-[var(--text-muted)]'
                  }`}>
                    {weekLabel(wt.week)}
                  </span>
                  <span className="text-sm text-[var(--text-secondary)] truncate">{wt.theme}</span>
                </div>
                {wt.hasCheckin && <span className="text-xs text-green-400 shrink-0">有打卡</span>}
              </div>
              <div className="flex gap-1">
                {wt.days.map((day, i) => {
                  const dateStr = getDateStr(day)
                  const hasCheckin = checkinDates.has(dateStr)
                  const isToday = dateStr === today
                  const isFuture = dateStr > today
                  return (
                    <div
                      key={`${wt.week}-${i}`}
                      className={`flex-1 h-6 rounded text-center text-xs leading-6 ${
                        hasCheckin
                          ? 'bg-green-500/20 text-green-300 font-medium'
                          : isToday
                            ? 'bg-[var(--accent-muted)] text-[var(--accent-strong)] font-bold border border-[var(--accent-border)]'
                            : isFuture
                              ? 'bg-[var(--surface-2)] text-[var(--text-muted)]'
                              : 'bg-red-500/10 text-red-300/50'
                      }`}
                      title={dateStr}
                    >
                      {['一', '二', '三', '四', '五', '六', '日'][i]}
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}
      </section>
    </div>
  )
}
