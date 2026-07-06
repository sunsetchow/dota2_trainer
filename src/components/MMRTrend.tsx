import React, { useMemo } from 'react'
import type { MMRLog } from '../types'
import { useT } from '../i18n/index.ts'
import Card from './ui/Card.tsx'
import Badge from './ui/Badge.tsx'

type DailyMMRPoint = {
  date: string
  mmr: number
  notes?: string
}

function compactDate(date: string): string {
  const [, month, day] = date.split('-')
  return month && day ? `${month}/${day}` : date
}

function buildDailySeries(logs: MMRLog[]): DailyMMRPoint[] {
  const byDate = new Map<string, DailyMMRPoint>()
  for (const log of logs) {
    if (!log.date || !Number.isFinite(log.mmr)) continue
    byDate.set(log.date, { date: log.date, mmr: log.mmr, notes: log.notes })
  }
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date))
}

function deltaText(delta: number): string {
  if (delta === 0) return '0'
  return `${delta > 0 ? '+' : ''}${delta}`
}

function Sparkline({ points, t }: { points: DailyMMRPoint[]; t: ReturnType<typeof useT> }) {
  if (points.length < 2) {
    return (
      <div className="flex h-28 items-center justify-center rounded-[var(--radius-md)] border border-dashed border-[var(--border)] bg-[var(--surface-2)] text-sm text-[var(--text-muted)]">
        {t('mmrTrend.needTwoDays')}
      </div>
    )
  }

  const visible = points.slice(-14)
  const min = Math.min(...visible.map(point => point.mmr))
  const max = Math.max(...visible.map(point => point.mmr))
  const range = Math.max(1, max - min)
  const coords = visible.map((point, index) => {
    const x = visible.length === 1 ? 0 : (index / (visible.length - 1)) * 100
    const y = 84 - ((point.mmr - min) / range) * 68
    return `${x.toFixed(2)},${y.toFixed(2)}`
  }).join(' ')

  return (
    <div className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface-2)] p-3">
      <svg viewBox="0 0 100 90" className="h-28 w-full overflow-visible" role="img" aria-label={t('mmrTrend.chartLabel')}>
        <polyline points={coords} fill="none" stroke="var(--gold-strong)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
        {visible.map((point, index) => {
          const [x, y] = coords.split(' ')[index].split(',').map(Number)
          return <circle key={point.date} cx={x} cy={y} r="2.4" fill="var(--accent-strong)" />
        })}
      </svg>
      <div className="mt-1 flex justify-between text-[11px] text-[var(--text-muted)]">
        <span>{compactDate(visible[0].date)}</span>
        <span>{compactDate(visible[visible.length - 1].date)}</span>
      </div>
    </div>
  )
}

export default function MMRTrend({ logs }: { logs: MMRLog[] }) {
  const t = useT()
  const dailySeries = useMemo(() => buildDailySeries(logs), [logs])
  const latest = dailySeries[dailySeries.length - 1]
  const previous = dailySeries[dailySeries.length - 2]
  const first = dailySeries[0]
  const weekBase = dailySeries[Math.max(0, dailySeries.length - 8)]
  const deltaToday = latest && previous ? latest.mmr - previous.mmr : 0
  const deltaWeek = latest && weekBase ? latest.mmr - weekBase.mmr : 0
  const deltaAll = latest && first ? latest.mmr - first.mmr : 0
  const recent = [...dailySeries].reverse().slice(0, 5)

  return (
    <Card className="p-4 md:p-5">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-[var(--text-primary)]">{t('mmrTrend.title')}</h2>
          <p className="mt-1 text-sm text-[var(--text-muted)]">{t('mmrTrend.subtitle')}</p>
        </div>
        <Badge tone={latest ? 'accent' : 'neutral'}>{latest ? compactDate(latest.date) : t('mmrTrend.notRecorded')}</Badge>
      </div>

      {latest ? (
        <>
          <div className="mb-4 grid grid-cols-3 gap-2">
            <div className="rounded-[var(--radius-md)] bg-[var(--surface-2)] p-3">
              <div className="number text-xl font-bold text-[var(--text-primary)]">{latest.mmr}</div>
              <div className="text-xs text-[var(--text-muted)]">{t('mmrTrend.current')}</div>
            </div>
            <div className="rounded-[var(--radius-md)] bg-[var(--surface-2)] p-3">
              <div className={`number text-xl font-bold ${deltaWeek >= 0 ? 'text-[var(--text-success)]' : 'text-[var(--text-danger)]'}`}>{deltaText(deltaWeek)}</div>
              <div className="text-xs text-[var(--text-muted)]">{t('mmrTrend.last7Days')}</div>
            </div>
            <div className="rounded-[var(--radius-md)] bg-[var(--surface-2)] p-3">
              <div className={`number text-xl font-bold ${deltaAll >= 0 ? 'text-[var(--text-success)]' : 'text-[var(--text-danger)]'}`}>{deltaText(deltaAll)}</div>
              <div className="text-xs text-[var(--text-muted)]">{t('mmrTrend.cycleTotal')}</div>
            </div>
          </div>

          <Sparkline points={dailySeries} t={t} />

          <div className="mt-4 space-y-2">
            {recent.map(point => (
              <div key={point.date} className="flex items-center justify-between gap-3 rounded-[var(--radius-sm)] bg-[var(--surface-2)] px-3 py-2 text-sm">
                <div className="min-w-0">
                  <div className="number text-[var(--text-primary)]">{compactDate(point.date)}</div>
                  {point.notes && <div className="mt-0.5 truncate text-xs text-[var(--text-muted)]">{point.notes}</div>}
                </div>
                <div className="number font-semibold text-[var(--text-primary)]">{point.mmr}</div>
              </div>
            ))}
          </div>
        </>
      ) : (
        <div className="rounded-[var(--radius-md)] border border-dashed border-[var(--border)] bg-[var(--surface-2)] p-4 text-sm leading-6 text-[var(--text-muted)]">
          {t('mmrTrend.empty')}
        </div>
      )}
    </Card>
  )
}
