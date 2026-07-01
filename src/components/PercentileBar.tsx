import React from 'react'

export interface PercentileMetric {
  label: string
  percentile?: number
  detail?: string
}

export interface PercentileSource {
  gpmPercentile?: number
  xpmPercentile?: number
  lastHitsPercentile?: number
  heroDamagePercentile?: number
  gpm?: number
  xpm?: number
  lastHits?: number
}

export function buildPercentileMetrics(source: PercentileSource): PercentileMetric[] {
  return [
    { label: 'GPM', percentile: source.gpmPercentile, detail: source.gpm !== undefined ? `本局 ${source.gpm}` : undefined },
    { label: 'XPM', percentile: source.xpmPercentile, detail: source.xpm !== undefined ? `本局 ${source.xpm}` : undefined },
    { label: '补刀速度', percentile: source.lastHitsPercentile, detail: source.lastHits !== undefined ? `总补刀 ${source.lastHits}` : undefined },
    { label: '英雄伤害', percentile: source.heroDamagePercentile },
  ]
}

function clamp(value: number): number {
  return Math.max(0, Math.min(100, value))
}

export default function PercentileBar({ metrics }: { metrics: PercentileMetric[] }) {
  const visible = metrics.filter(metric => typeof metric.percentile === 'number') as Array<PercentileMetric & { percentile: number }>
  if (visible.length === 0) return null

  return (
    <div className="space-y-3 rounded-xl border border-[var(--border)] bg-[var(--surface-1)] p-4">
      <div>
        <h2 className="text-sm font-semibold text-[var(--text-primary)]">赛后能力评分卡</h2>
        <p className="mt-1 text-xs text-[var(--text-muted)]">基于 OpenDota 同英雄 benchmark 百分位。</p>
      </div>
      <div className="space-y-3">
        {visible.map(metric => {
          const value = Math.round(clamp(metric.percentile))
          return (
            <div key={metric.label} className="space-y-1.5">
              <div className="flex items-center justify-between gap-3 text-xs">
                <span className="font-medium text-[var(--text-secondary)]">{metric.label}</span>
                <span className="number text-[var(--text-primary)]">超过同英雄 {value}% 对局</span>
              </div>
              <div className="h-2 rounded-full bg-[var(--surface-2)]">
                <div className="h-2 rounded-full bg-[var(--accent)]" style={{ width: `${value}%` }} />
              </div>
              {metric.detail && <div className="text-xs text-[var(--text-muted)]">{metric.detail}</div>}
            </div>
          )
        })}
      </div>
    </div>
  )
}
