import React from 'react'
import { useT } from '../i18n/index.ts'

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

export function buildPercentileMetrics(source: PercentileSource, t: ReturnType<typeof useT>): PercentileMetric[] {
  return [
    { label: t('percentileBar.gpm'), percentile: source.gpmPercentile, detail: source.gpm !== undefined ? t('percentileBar.thisGame', { value: source.gpm }) : undefined },
    { label: t('percentileBar.xpm'), percentile: source.xpmPercentile, detail: source.xpm !== undefined ? t('percentileBar.thisGame', { value: source.xpm }) : undefined },
    { label: t('percentileBar.lastHits'), percentile: source.lastHitsPercentile, detail: source.lastHits !== undefined ? t('percentileBar.thisGame', { value: source.lastHits }) : undefined },
    { label: t('percentileBar.heroDamage'), percentile: source.heroDamagePercentile },
  ]
}

function clamp(value: number): number {
  return Math.max(0, Math.min(100, value))
}

export default function PercentileBar({ metrics }: { metrics: PercentileMetric[] }) {
  const t = useT()
  const visible = metrics.filter(metric => typeof metric.percentile === 'number') as Array<PercentileMetric & { percentile: number }>
  if (visible.length === 0) return null

  return (
    <div className="space-y-3 rounded-xl border border-[var(--border)] bg-[var(--surface-1)] p-4">
      <div>
        <h2 className="text-sm font-semibold text-[var(--text-primary)]">{t('percentileBar.title')}</h2>
        <p className="mt-1 text-xs text-[var(--text-muted)]">{t('percentileBar.subtitle')}</p>
      </div>
      <div className="space-y-3">
        {visible.map(metric => {
          const value = Math.round(clamp(metric.percentile))
          return (
            <div key={metric.label} className="space-y-1.5">
              <div className="flex items-center justify-between gap-3 text-xs">
                <span className="font-medium text-[var(--text-secondary)]">{metric.label}</span>
                <span className="number text-[var(--text-primary)]">{t('percentileBar.percentileValue', { value })}</span>
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
