import React from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useMatchLogs } from '../store/useStore.ts'
import { getReviewDimensionLabel } from '../data/reviewDimensions.ts'
import PercentileBar, { buildPercentileMetrics } from '../components/PercentileBar.tsx'
import DeathPositionMap from '../components/DeathPositionMap.tsx'
import { getPhaseRelativeScore } from '../utils/phasePerformance.ts'
import { getDisplayHeroName } from '../utils/heroIdentity.ts'
import { useLanguage, useT } from '../i18n/index.ts'

function Field({ label, value }: { label: string; value?: React.ReactNode }) {
  if (value === undefined || value === null || value === '') return null
  return (
    <div className="px-3 py-2 rounded-lg bg-[var(--surface-1)] border border-[var(--border)]">
      <div className="text-xs text-[var(--text-muted)]">{label}</div>
      <div className="mt-1 text-sm text-[var(--text-primary)]">{value}</div>
    </div>
  )
}

function goalLabel(value: 'yes' | 'partial' | 'no', t: ReturnType<typeof useT>) {
  if (value === 'yes') return t('matchDetail.goalYes')
  if (value === 'partial') return t('matchDetail.goalPartial')
  return t('matchDetail.goalNo')
}

// stomp 只有 Stratz 数据源才有；OpenDota 或手动填写时是 undefined，退回原来笼统的
// "压制/被压"，不替没有这个信息的记录瞎猜大胜小胜。
function laneLabel(value: 'dominated' | 'even' | 'lost' | undefined, stomp: boolean | undefined, t: ReturnType<typeof useT>) {
  if (value === 'even') return t('common.laneEven')
  if (value === 'dominated') return stomp === undefined ? t('common.laneDominated') : stomp ? t('common.laneStompWin') : t('common.laneCloseWin')
  if (value === 'lost') return stomp === undefined ? t('common.laneLost') : stomp ? t('common.laneStompLoss') : t('common.laneCloseLoss')
  return undefined
}

function zoneLabel(value: 'green' | 'orange' | 'red' | undefined, t: ReturnType<typeof useT>) {
  if (value === 'green') return t('common.zoneGreen')
  if (value === 'orange') return t('common.zoneOrange')
  if (value === 'red') return t('common.zoneRed')
  return undefined
}

function laneStatsLabel(efficiency: number | undefined, laneKills: number | undefined, t: ReturnType<typeof useT>) {
  const parts = [
    efficiency !== undefined ? t('matchDetail.laneEfficiency', { pct: Math.round(efficiency) }) : undefined,
    laneKills !== undefined ? t('matchDetail.laneKills', { n: laneKills }) : undefined,
  ].filter((item): item is string => Boolean(item))
  return parts.length > 0 ? parts.join(' · ') : undefined
}

function formatPhase(value: number | undefined, relative: number | null | undefined, t: ReturnType<typeof useT>) {
  if (value === undefined) return undefined
  const relativeText = relative === null || relative === undefined
    ? ''
    : t('matchDetail.phaseRelative', { sign: relative >= 0 ? '+' : '', pct: relative.toFixed(0) })
  return t('matchDetail.phaseValue', { gpm: Math.round(value), relative: relativeText })
}

export default function MatchDetail() {
  const navigate = useNavigate()
  const { id } = useParams()
  const { matchLogs } = useMatchLogs()
  const log = matchLogs.find(item => item.id === id)
  const t = useT()
  const language = useLanguage()

  if (!log) {
    return (
      <div className="p-6 max-w-2xl mx-auto space-y-4">
        <button type="button" onClick={() => navigate('/history')} className="text-xs text-[var(--text-muted)] hover:text-[var(--text-secondary)]">{t('matchDetail.backToHistory')}</button>
        <div className="p-4 rounded-xl border border-[var(--border)] bg-[var(--surface-1)] text-sm text-[var(--text-muted)]">
          {t('matchDetail.notFound')}
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 space-y-5 max-w-2xl mx-auto">
      <div>
        <button type="button" onClick={() => navigate('/history')} className="text-xs text-[var(--text-muted)] hover:text-[var(--text-secondary)] mb-3">{t('matchDetail.backToHistory')}</button>
        <div className="flex items-start gap-3">
          <span className={`text-xs font-bold px-2 py-0.5 rounded mt-1 ${
            log.result === 'win'
              ? 'bg-[var(--bg-success)] text-[var(--text-success)]'
              : 'bg-[var(--bg-danger)] text-[var(--text-danger)]'
          }`}>
            {log.result === 'win' ? t('matchDetail.resultWin') : t('matchDetail.resultLoss')}
          </span>
          <div className="flex-1">
            <h1 className="text-xl font-bold text-[var(--text-primary)]">{getDisplayHeroName(log.hero, language)}</h1>
            <p className="text-sm text-[var(--text-muted)]">
              {t('matchDetail.durationLine', {
                date: new Date(log.timestamp).toLocaleString(language === 'zh' ? 'zh-CN' : 'en-US'),
                duration: log.durationMin,
                source: log.source === 'opendota' ? ' · OpenDota' : '',
              })}
            </p>
          </div>
        </div>
      </div>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-[var(--text-secondary)] uppercase tracking-wider">{t('matchDetail.reviewSection')}</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label={t('matchDetail.goalLabel')} value={goalLabel(log.trainingGoalMet, t)} />
          <Field label={t('matchDetail.reviewDimensionLabel')} value={getReviewDimensionLabel(log.reviewDimension, language)} />
          <Field label={t('matchDetail.reviewTopicLabel')} value={log.reviewTopic} />
          <Field label={t('matchDetail.laneResultLabel')} value={laneLabel(log.laneResult, log.laneStomp, t)} />
          <Field label={t('matchDetail.laneStatsLabel')} value={laneStatsLabel(log.laneEfficiency, log.laneKills, t)} />
          <Field label={t('matchDetail.deathZoneLabel')} value={zoneLabel(log.worstDeathZone, t)} />
          <Field label={t('matchDetail.enemyCarryLabel')} value={log.enemyCarry ? getDisplayHeroName(log.enemyCarry, language) : undefined} />
          <Field label={t('matchDetail.draftScoreLabel')} value={log.draftScore ? `${log.draftScore}/5` : undefined} />
          <Field label={t('matchDetail.biggestMistakeLabel')} value={log.biggestMistake} />
          <Field label={t('matchDetail.nextFocusLabel')} value={log.nextGameFocus} />
          <Field label={t('matchDetail.notesLabel')} value={log.notes} />
        </div>
      </section>

      {(log.reviewClipDeath || log.reviewClipFight || log.reviewClipObjective) && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-[var(--text-secondary)] uppercase tracking-wider">{t('matchDetail.clipSection')}</h2>
          <div className="grid grid-cols-1 gap-3">
            <Field label={t('matchDetail.clipDeathLabel')} value={log.reviewClipDeath} />
            <Field label={t('matchDetail.clipFightLabel')} value={log.reviewClipFight} />
            <Field label={t('matchDetail.clipObjectiveLabel')} value={log.reviewClipObjective} />
          </div>
        </section>
      )}

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-[var(--text-secondary)] uppercase tracking-wider">{t('matchDetail.statsSection')}</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Field label={t('matchDetail.matchIdLabel')} value={log.matchId} />
          <Field label={t('matchDetail.csAt10Label')} value={log.csAt10} />
          <Field label={t('matchDetail.dnAt10Label')} value={log.dnAt10} />
          <Field label={t('matchDetail.firstKeyItemLabel')} value={log.firstKeyItemMin ? t('matchDetail.firstKeyItemValue', { name: log.firstKeyItemName ? `${log.firstKeyItemName} · ` : '', minutes: log.firstKeyItemMin }) : undefined} />
          <Field label={t('matchDetail.kdaLabel')} value={log.kills !== undefined ? t('matchDetail.kdaValue', { k: log.kills, d: log.deaths ?? '-', a: log.assists ?? '-' }) : undefined} />
          <Field label={t('matchDetail.gpmXpmLabel')} value={log.gpm !== undefined ? t('matchDetail.gpmXpmValue', { gpm: log.gpm, xpm: log.xpm ?? '-' }) : undefined} />
          <Field label={t('matchDetail.lastHitsLabel')} value={log.lastHits !== undefined ? t('matchDetail.lastHitsValue', { lh: log.lastHits, dn: log.denies ?? '-' }) : undefined} />
          <Field label={t('matchDetail.levelLabel')} value={log.level} />
          <Field label={t('matchDetail.sideLabel')} value={log.isRadiant === undefined ? undefined : log.isRadiant ? t('matchDetail.sideRadiant') : t('matchDetail.sideDire')} />
        </div>
      </section>

      <PercentileBar metrics={buildPercentileMetrics(log, t)} />

      {(log.laningGpm !== undefined || log.midGpm !== undefined || log.lateGpm !== undefined) && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-[var(--text-secondary)] uppercase tracking-wider">{t('matchDetail.phaseSection')}</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Field label={t('matchDetail.phaseLaning')} value={formatPhase(log.laningGpm, getPhaseRelativeScore(log.hero, 'laning', log.laningGpm, matchLogs, log.id), t)} />
            <Field label={t('matchDetail.phaseMid')} value={formatPhase(log.midGpm, getPhaseRelativeScore(log.hero, 'mid', log.midGpm, matchLogs, log.id), t)} />
            <Field label={t('matchDetail.phaseLate')} value={formatPhase(log.lateGpm, getPhaseRelativeScore(log.hero, 'late', log.lateGpm, matchLogs, log.id), t)} />
          </div>
        </section>
      )}

      {log.deathPositions && log.deathPositions.length > 0 && (
        <DeathPositionMap deathPositions={log.deathPositions} />
      )}
    </div>
  )
}
