import type { HeroTimingCache, HeroTimingProfile } from '../types'
import { useT } from '../i18n/index.ts'

const SEGMENTS: Array<{ key: keyof Pick<HeroTimingProfile, 'early' | 'mid' | 'late' | 'veryLate'>; labelKey: string }> = [
  { key: 'early', labelKey: 'timing.early' },
  { key: 'mid', labelKey: 'timing.mid' },
  { key: 'late', labelKey: 'timing.late' },
  { key: 'veryLate', labelKey: 'timing.veryLate' },
]

function percent(value: number): string {
  return `${(value * 100).toFixed(1)}%`
}

function signedPct(value: number): string {
  return `${value >= 0 ? '+' : ''}${(value * 100).toFixed(1)}%`
}

function averageEnemyWinRate(enemyHeroIds: number[], timingCache: HeroTimingCache, key: keyof Pick<HeroTimingProfile, 'early' | 'mid' | 'late' | 'veryLate'>): number | null {
  const values = enemyHeroIds
    .map(id => timingCache.profiles[String(id)]?.[key].winRate)
    .filter((value): value is number => value !== null && value !== undefined)
  if (values.length === 0) return null
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

export default function CompositionTimeline({
  selectedHeroId,
  enemyHeroIds,
  timingCache,
}: {
  selectedHeroId?: number
  enemyHeroIds: number[]
  timingCache: HeroTimingCache | null
}) {
  const t = useT()
  if (!selectedHeroId || enemyHeroIds.length === 0 || !timingCache) return null
  const selectedProfile = timingCache.profiles[String(selectedHeroId)]
  if (!selectedProfile) return null

  const rows = SEGMENTS.map(segment => {
    const mine = selectedProfile[segment.key].winRate
    const enemy = averageEnemyWinRate(enemyHeroIds, timingCache, segment.key)
    return {
      ...segment,
      label: t(segment.labelKey),
      mine,
      enemy,
      diff: mine !== null && enemy !== null ? mine - enemy : null,
    }
  }).filter(row => row.mine !== null && row.enemy !== null)

  if (rows.length === 0) return null

  const strongest = [...rows]
    .filter(row => row.diff !== null && Math.abs(row.diff) >= 0.02)
    .sort((a, b) => Math.abs(b.diff ?? 0) - Math.abs(a.diff ?? 0))[0]

  return (
    <div className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface-1)] p-3">
      <div className="mb-2 text-sm font-semibold text-[var(--text-primary)]">{t('compositionTimeline.title')}</div>
      <div className="space-y-2">
        {rows.map(row => {
          const diff = row.diff ?? 0
          return (
            <div key={row.key} className="grid grid-cols-[4rem_1fr_auto] items-center gap-2 text-xs">
              <span className="text-[var(--text-muted)]">{row.label}</span>
              <div className="h-2 overflow-hidden rounded-full bg-[var(--surface-2)]">
                <div
                  className={diff >= 0 ? 'h-full bg-[var(--text-success)]' : 'h-full bg-[var(--text-danger)]'}
                  style={{ width: `${Math.min(100, Math.max(6, Math.abs(diff) * 500))}%` }}
                />
              </div>
              <span className={diff >= 0 ? 'number text-[var(--text-success)]' : 'number text-[var(--text-danger)]'}>
                {signedPct(diff)}
              </span>
              <span className="col-start-2 col-span-2 text-[11px] text-[var(--text-muted)]">
                {t('compositionTimeline.rowSummary', { mine: percent(row.mine as number), enemy: percent(row.enemy as number) })}
              </span>
            </div>
          )
        })}
      </div>
      {strongest ? (
        <p className="mt-3 text-xs leading-5 text-[var(--text-secondary)]">
          {strongest.diff && strongest.diff > 0
            ? t('compositionTimeline.strongerMine', { label: strongest.label, diff: signedPct(strongest.diff) })
            : t('compositionTimeline.strongerEnemy', { label: strongest.label, diff: signedPct(strongest.diff ?? 0) })}
        </p>
      ) : (
        <p className="mt-3 text-xs leading-5 text-[var(--text-muted)]">{t('compositionTimeline.balanced')}</p>
      )}
    </div>
  )
}
