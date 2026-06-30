import React from 'react'
import type { TrainingCycle } from '../types'
import { getCurrentWeek, getDaysElapsed } from '../utils/cycle.ts'

interface WeekBadgeProps {
  cycle: TrainingCycle
}

export default function WeekBadge({ cycle }: WeekBadgeProps) {
  const week = getCurrentWeek(cycle)
  const days = getDaysElapsed(cycle)
  const weekTheme = cycle.weekThemes.find(w => w.week === week)
  const theme = weekTheme?.theme ?? '训练中'

  return (
    <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-[var(--surface-1)] border border-[var(--border)]">
      <div className="flex flex-col">
        <span className="text-xs text-[var(--text-muted)] uppercase tracking-wider font-medium">当前周次</span>
        <span className="text-2xl font-bold text-[var(--text-primary)]">第 {week} 周</span>
      </div>
      <div className="w-px h-10 bg-[var(--border)]" />
      <div className="flex flex-col flex-1">
        <span className="text-xs text-[var(--text-muted)] uppercase tracking-wider font-medium">主题</span>
        <span className="text-sm font-medium text-[var(--text-secondary)]">{theme}</span>
      </div>
      <div className="flex flex-col items-end">
        <span className="text-xs text-[var(--text-muted)] uppercase tracking-wider font-medium">已进行</span>
        <span className="text-sm font-medium text-[var(--text-secondary)]">{days} 天</span>
      </div>
    </div>
  )
}
