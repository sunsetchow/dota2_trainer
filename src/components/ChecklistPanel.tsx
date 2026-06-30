import React, { useState, useEffect } from 'react'
import type { ChecklistItem, SessionType, TrainingCycle, DailyCheckin } from '../types'
import checklistData from '../data/checklist.json'
import { getCurrentWeek, todayStr } from '../utils/cycle.ts'
import { nanoid } from 'nanoid'

const ALL_ITEMS: ChecklistItem[] = checklistData as ChecklistItem[]

interface ChecklistPanelProps {
  cycle: TrainingCycle
  existingCheckin?: DailyCheckin
  onSave?: (checkin: DailyCheckin) => void
}

export default function ChecklistPanel({ cycle, existingCheckin, onSave }: ChecklistPanelProps) {
  const currentWeek = getCurrentWeek(cycle)
  const [sessionType, setSessionType] = useState<SessionType>(existingCheckin?.sessionType ?? '90min')
  const [checkedItems, setCheckedItems] = useState<string[]>(existingCheckin?.checkedItems ?? [])

  useEffect(() => {
    if (existingCheckin) {
      setSessionType(existingCheckin.sessionType)
      setCheckedItems(existingCheckin.checkedItems)
    }
  }, [existingCheckin])

  // 当前档位 + 当前周 weekRange 内的 items
  const visibleItems = ALL_ITEMS.filter(item => {
    if (!item.sessionTypes.includes(sessionType)) return false
    if (item.weekRange) {
      const [lo, hi] = item.weekRange
      return currentWeek >= lo && currentWeek <= hi
    }
    return true
  })

  const handleSessionTypeChange = (newType: SessionType) => {
    const newItemIds = ALL_ITEMS
      .filter(item => item.sessionTypes.includes(newType))
      .map(item => item.id)
    // 保留在新档位里也存在的已勾选项
    const preserved = checkedItems.filter(id => newItemIds.includes(id))
    setCheckedItems(preserved)
    setSessionType(newType)
  }

  const toggle = (id: string) => {
    setCheckedItems(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    )
  }

  const handleSave = () => {
    if (!onSave) return
    const checkin: DailyCheckin = {
      id: existingCheckin?.id ?? nanoid(),
      date: todayStr(),
      sessionType,
      checkedItems,
    }
    onSave(checkin)
  }

  const dimensionColor: Record<string, string> = {
    ops: 'text-[var(--text-info)]',
    pregame: 'text-purple-400',
    economy: 'text-yellow-400',
    combat: 'text-red-400',
    objective: 'text-green-400',
    discipline: 'text-orange-400',
    review: 'text-[var(--text-muted)]',
  }

  return (
    <div className="space-y-4">
      {/* 档位切换 */}
      <div className="flex gap-2">
        {(['30min', '90min', '3hr'] as SessionType[]).map(type => (
          <button
            key={type}
            type="button"
            onClick={() => handleSessionTypeChange(type)}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium border transition-all ${
              sessionType === type
                ? 'border-[var(--accent-border)] bg-[var(--accent-muted)] text-[var(--accent-strong)]'
                : 'border-[var(--border)] bg-[var(--surface-1)] text-[var(--text-secondary)] hover:border-[var(--accent-border)]'
            }`}
          >
            {type}
          </button>
        ))}
      </div>

      {/* Checklist 项目 */}
      <div className="space-y-2">
        {visibleItems.map(item => (
          <label
            key={item.id}
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg border border-[var(--border)] bg-[var(--surface-1)] cursor-pointer hover:border-[var(--accent-border)] transition-colors"
          >
            <input
              type="checkbox"
              checked={checkedItems.includes(item.id)}
              onChange={() => toggle(item.id)}
              className="w-4 h-4 rounded accent-[var(--accent)]"
            />
            <span className="flex-1 text-sm text-[var(--text-primary)]">{item.label}</span>
            <span className={`text-xs font-medium ${dimensionColor[item.dimension] ?? 'text-[var(--text-muted)]'}`}>
              {item.dimension}
            </span>
            {item.weekRange && (
              <span className="text-xs text-[var(--text-muted)]">
                W{item.weekRange[0]}-{item.weekRange[1]}
              </span>
            )}
          </label>
        ))}
        {visibleItems.length === 0 && (
          <p className="text-sm text-[var(--text-muted)] text-center py-4">当前档位暂无 Checklist 项</p>
        )}
      </div>

      {/* 进度 */}
      <div className="flex items-center justify-between text-xs text-[var(--text-muted)]">
        <span>已完成 {checkedItems.filter(id => visibleItems.some(i => i.id === id)).length} / {visibleItems.length}</span>
        {onSave && (
          <button
            type="button"
            onClick={handleSave}
            className="px-4 py-1.5 rounded-lg text-sm font-semibold bg-[var(--accent)] text-[var(--text-primary)] hover:bg-[var(--accent-strong)] transition-colors"
          >
            保存打卡
          </button>
        )}
      </div>
    </div>
  )
}
