import React, { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useDailyCheckins, useMatchLogs, useMMRLogs } from '../store/useStore.ts'
import { getReviewDimensionLabel } from '../data/reviewDimensions.ts'
import { getDisplayHeroName } from '../utils/heroIdentity.ts'
import { useLanguage, useT } from '../i18n/index.ts'
import Card from '../components/ui/Card.tsx'
import Badge from '../components/ui/Badge.tsx'
import MMRTrend from '../components/MMRTrend.tsx'
import type { MatchLog, TrainingDimension } from '../types'

const WINDOWS = [7, 14, 30]

function pct(value: number): string {
  return `${Math.round(value)}%`
}

function dateCutoff(days: number): number {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() - days + 1)
  return d.getTime()
}

function StatCard({ label, value, helper }: { label: string; value: React.ReactNode; helper?: string }) {
  return (
    <Card className="p-4">
      <div className="text-xs text-[var(--text-muted)]">{label}</div>
      <div className="number mt-2 text-2xl font-bold text-[var(--text-primary)]">{value}</div>
      {helper && <div className="mt-1 text-xs text-[var(--text-muted)]">{helper}</div>}
    </Card>
  )
}

function countBy<T extends string>(items: T[]): Record<T, number> {
  return items.reduce((acc, item) => {
    acc[item] = (acc[item] ?? 0) + 1
    return acc
  }, {} as Record<T, number>)
}

function MetricRows({ rows, empty }: { rows: Array<{ label: string; value: string; tone?: 'success' | 'danger' | 'neutral' }>; empty: string }) {
  if (rows.length === 0) {
    return <div className="rounded-[var(--radius-md)] border border-dashed border-[var(--border)] p-4 text-sm text-[var(--text-muted)]">{empty}</div>
  }
  return (
    <div className="space-y-2">
      {rows.map(row => (
        <div key={row.label} className="flex items-center justify-between gap-3 rounded-[var(--radius-md)] bg-[var(--surface-2)] px-3 py-2 text-sm">
          <span className="min-w-0 truncate text-[var(--text-secondary)]">{row.label}</span>
          <span className={`number font-semibold ${row.tone === 'success' ? 'text-[var(--text-success)]' : row.tone === 'danger' ? 'text-[var(--text-danger)]' : 'text-[var(--text-primary)]'}`}>{row.value}</span>
        </div>
      ))}
    </div>
  )
}

function trendRows(logs: MatchLog[], t: ReturnType<typeof useT>, language: 'zh' | 'en') {
  const sorted = [...logs].sort((a, b) => a.timestamp - b.timestamp)
  const byHero = new Map<string, { games: number; wins: number }>()
  for (const log of sorted) {
    const item = byHero.get(log.hero) ?? { games: 0, wins: 0 }
    item.games += 1
    if (log.result === 'win') item.wins += 1
    byHero.set(log.hero, item)
  }
  return [...byHero.entries()]
    .filter(([, item]) => item.games >= 2)
    .sort((a, b) => b[1].games - a[1].games || b[1].wins / b[1].games - a[1].wins / a[1].games)
    .slice(0, 6)
    .map(([hero, item]) => ({ label: t('progress.heroRowLabel', { hero: getDisplayHeroName(hero, language), games: item.games }), value: pct((item.wins / item.games) * 100), tone: item.wins / item.games >= 0.5 ? 'success' as const : 'danger' as const }))
}

export default function Progress() {
  const navigate = useNavigate()
  const { matchLogs } = useMatchLogs()
  const { checkins } = useDailyCheckins()
  const { mmrLogs } = useMMRLogs()
  const t = useT()
  const language = useLanguage()

  const stats = useMemo(() => {
    const now = Date.now()
    const windows = WINDOWS.map(days => {
      const logs = matchLogs.filter(log => log.timestamp >= dateCutoff(days))
      const wins = logs.filter(log => log.result === 'win').length
      return { days, games: logs.length, wins, winRate: logs.length ? wins / logs.length : 0 }
    })

    const dimensions = countBy(matchLogs.map(log => log.reviewDimension).filter((value): value is TrainingDimension => Boolean(value)))
    const dimensionRows = Object.entries(dimensions)
      .sort((a, b) => b[1] - a[1])
      .map(([dimension, count]) => ({ label: getReviewDimensionLabel(dimension as TrainingDimension, language) ?? dimension, value: t('progress.timesCount', { n: count }) }))

    const laneResults = countBy(matchLogs.map(log => log.laneResult).filter((value): value is 'dominated' | 'even' | 'lost' => Boolean(value)))
    const laneRows = [
      { key: 'dominated', label: t('common.laneDominated'), tone: 'success' as const },
      { key: 'even', label: t('common.laneEven'), tone: 'neutral' as const },
      { key: 'lost', label: t('common.laneLost'), tone: 'danger' as const },
    ].filter(item => laneResults[item.key as keyof typeof laneResults]).map(item => ({ label: item.label, value: t('progress.laneRowValue', { n: laneResults[item.key as keyof typeof laneResults] }), tone: item.tone }))

    const csLogs = matchLogs.filter(log => typeof log.csAt10 === 'number')
    const itemLogs = matchLogs.filter(log => typeof log.firstKeyItemMin === 'number')
    const avgCs = csLogs.length ? csLogs.reduce((sum, log) => sum + (log.csAt10 ?? 0), 0) / csLogs.length : 0
    const avgKeyItem = itemLogs.length ? itemLogs.reduce((sum, log) => sum + (log.firstKeyItemMin ?? 0), 0) / itemLogs.length : 0
    const activeDays = new Set(checkins.map(c => c.date)).size
    const focusRows = Object.entries(countBy(matchLogs.map(log => log.nextGameFocus).filter(Boolean) as string[]))
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([focus, count]) => ({ label: focus, value: t('progress.timesCount', { n: count }) }))

    return { now, windows, dimensionRows, laneRows, avgCs, avgKeyItem, activeDays, focusRows, heroRows: trendRows(matchLogs, t, language) }
  }, [matchLogs, checkins, t, language])

  const totalWins = matchLogs.filter(log => log.result === 'win').length
  const totalWinRate = matchLogs.length ? totalWins / matchLogs.length : 0

  return (
    <div className="mx-auto max-w-[1280px] space-y-6 px-4 py-6 md:px-6">
      <div>
        <button type="button" onClick={() => navigate('/')} className="mb-3 text-xs text-[var(--text-muted)] hover:text-[var(--text-secondary)]">{t('progress.backHome')}</button>
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="mb-2 flex gap-2"><Badge tone="accent">{t('progress.badgeP1')}</Badge><Badge tone="neutral">{t('progress.badgeProgress')}</Badge></div>
            <h1 className="text-2xl font-bold tracking-tight text-[var(--text-primary)] md:text-3xl">{t('progress.title')}</h1>
            <p className="mt-2 text-sm text-[var(--text-secondary)]">{t('progress.subtitle')}</p>
          </div>
        </div>
      </div>

      <section className="grid gap-3 md:grid-cols-4">
        <StatCard label={t('progress.totalGames')} value={matchLogs.length} helper={t('progress.totalGamesHelper', { wins: totalWins })} />
        <StatCard label={t('progress.totalWinRate')} value={pct(totalWinRate * 100)} helper={t('progress.totalWinRateHelper')} />
        <StatCard label={t('progress.activeDays')} value={stats.activeDays} helper={t('progress.activeDaysHelper')} />
        <StatCard label={t('progress.avgCs')} value={stats.avgCs ? Math.round(stats.avgCs) : '-'} helper={t('progress.avgCsHelper')} />
      </section>

      <section className="grid gap-6 lg:grid-cols-[1fr_0.95fr]">
        <MMRTrend logs={mmrLogs} />
        <Card className="p-4 md:p-5">
          <h2 className="text-base font-semibold text-[var(--text-primary)]">{t('progress.winRateWindow')}</h2>
          <div className="mt-4 grid gap-2">
            {stats.windows.map(item => (
              <div key={item.days} className="flex items-center justify-between rounded-[var(--radius-md)] bg-[var(--surface-2)] px-3 py-2">
                <span className="text-sm text-[var(--text-secondary)]">{t('progress.windowLabel', { days: item.days, games: item.games })}</span>
                <span className={`number font-semibold ${item.winRate >= 0.5 ? 'text-[var(--text-success)]' : 'text-[var(--text-danger)]'}`}>{item.games ? pct(item.winRate * 100) : '-'}</span>
              </div>
            ))}
          </div>
        </Card>
      </section>

      <section className="grid gap-6 lg:grid-cols-3">
        <Card className="p-4 md:p-5">
          <h2 className="mb-3 text-base font-semibold text-[var(--text-primary)]">{t('progress.dimensionErrors')}</h2>
          <MetricRows rows={stats.dimensionRows} empty={t('progress.dimensionEmpty')} />
        </Card>
        <Card className="p-4 md:p-5">
          <h2 className="mb-3 text-base font-semibold text-[var(--text-primary)]">{t('progress.heroPerformance')}</h2>
          <MetricRows rows={stats.heroRows} empty={t('progress.heroPerformanceEmpty')} />
        </Card>
        <Card className="p-4 md:p-5">
          <h2 className="mb-3 text-base font-semibold text-[var(--text-primary)]">{t('progress.laneResult')}</h2>
          <MetricRows rows={stats.laneRows} empty={t('progress.laneResultEmpty')} />
        </Card>
      </section>

      <section className="grid gap-6 lg:grid-cols-[0.8fr_1.2fr]">
        <Card className="p-4 md:p-5">
          <h2 className="mb-3 text-base font-semibold text-[var(--text-primary)]">{t('progress.keyItemTime')}</h2>
          <div className="number text-3xl font-bold text-[var(--text-primary)]">{stats.avgKeyItem ? `${stats.avgKeyItem.toFixed(1)}m` : '-'}</div>
          <p className="mt-2 text-sm text-[var(--text-muted)]">{t('progress.keyItemTimeDesc')}</p>
        </Card>
        <Card className="p-4 md:p-5">
          <h2 className="mb-3 text-base font-semibold text-[var(--text-primary)]">{t('progress.commonFocus')}</h2>
          <MetricRows rows={stats.focusRows} empty={t('progress.commonFocusEmpty')} />
        </Card>
      </section>
    </div>
  )
}
