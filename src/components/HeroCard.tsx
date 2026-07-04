import React from 'react'
import type { DotaPosition, HeroConfig } from '../types'
import { HERO_POSITION_LABELS, tierLabel } from '../utils/heroPool.ts'

interface HeroCardProps {
  hero: string
  active: boolean
  tier?: HeroConfig['tier']
  positions: DotaPosition[]
  selected?: boolean
  hasNote?: boolean
  due?: boolean
  onSelect: (hero: string) => void
}

function HeroCard({ hero, active, tier, positions, selected = false, hasNote = false, due = false, onSelect }: HeroCardProps) {
  return (
    <button
      type="button"
      onClick={() => onSelect(hero)}
      className={`w-full rounded-xl border p-3 text-left transition-all active:translate-y-px ${
        selected
          ? 'border-[var(--accent-border)] bg-[var(--accent-muted)]'
          : active
            ? 'border-[var(--border)] bg-[var(--surface-1)] hover:border-[var(--accent-border)] hover:bg-[var(--surface-2)]'
            : 'border-[var(--border)] bg-[var(--surface-1)] opacity-70 hover:opacity-100'
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-[var(--text-primary)]">{hero}</div>
          <div className="mt-1 flex flex-wrap gap-1">
            {positions.length > 0 ? positions.map(position => (
              <span key={position} className="rounded border border-[var(--border)] px-1.5 py-0.5 text-[10px] text-[var(--text-muted)]">
                {HERO_POSITION_LABELS[position]}
              </span>
            )) : (
              <span className="rounded border border-[var(--border)] px-1.5 py-0.5 text-[10px] text-[var(--text-muted)]">未设位置</span>
            )}
          </div>
        </div>
        <span className={`shrink-0 rounded px-2 py-0.5 text-[10px] ${active ? 'bg-[var(--gold-muted)] text-[var(--gold-strong)]' : 'bg-[var(--surface-2)] text-[var(--text-muted)]'}`}>
          {tierLabel(tier, active)}
        </span>
      </div>
      <div className="mt-2 flex flex-wrap gap-1 text-[10px]">
        {hasNote && <span className="rounded bg-[var(--surface-2)] px-2 py-0.5 text-[var(--text-secondary)]">有档案</span>}
        {due && <span className="rounded bg-[var(--bg-warning)] px-2 py-0.5 text-[var(--text-warning)]">待复习</span>}
        {!active && <span className="rounded bg-[var(--surface-2)] px-2 py-0.5 text-[var(--text-muted)]">不进默认推荐</span>}
      </div>
    </button>
  )
}

export default React.memo(HeroCard)
