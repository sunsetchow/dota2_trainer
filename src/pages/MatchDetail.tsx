import React from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useMatchLogs } from '../store/useStore.ts'
import { getReviewDimensionLabel } from '../data/reviewDimensions.ts'
import PercentileBar, { buildPercentileMetrics } from '../components/PercentileBar.tsx'
import { getPhaseRelativeScore } from '../utils/phasePerformance.ts'

function Field({ label, value }: { label: string; value?: React.ReactNode }) {
  if (value === undefined || value === null || value === '') return null
  return (
    <div className="px-3 py-2 rounded-lg bg-[var(--surface-1)] border border-[var(--border)]">
      <div className="text-xs text-[var(--text-muted)]">{label}</div>
      <div className="mt-1 text-sm text-[var(--text-primary)]">{value}</div>
    </div>
  )
}

function resultLabel(result: 'win' | 'loss') {
  return result === 'win' ? '胜利' : '失败'
}

function goalLabel(value: 'yes' | 'partial' | 'no') {
  if (value === 'yes') return '完成'
  if (value === 'partial') return '部分完成'
  return '未完成'
}

function laneLabel(value?: 'dominated' | 'even' | 'lost') {
  if (value === 'dominated') return '压制'
  if (value === 'even') return '持平'
  if (value === 'lost') return '被压'
  return undefined
}

function zoneLabel(value?: 'green' | 'orange' | 'red') {
  if (value === 'green') return '绿区'
  if (value === 'orange') return '橙区'
  if (value === 'red') return '红区'
  return undefined
}

function laneStatsLabel(efficiency?: number, laneKills?: number) {
  const parts = [
    efficiency !== undefined ? `效率 ${Math.round(efficiency)}%` : undefined,
    laneKills !== undefined ? `对线单位击杀 ${laneKills}` : undefined,
  ].filter((item): item is string => Boolean(item))
  return parts.length > 0 ? parts.join(' · ') : undefined
}

function formatPhase(value?: number, relative?: number | null) {
  if (value === undefined) return undefined
  const relativeText = relative === null || relative === undefined
    ? ''
    : ` · ${relative >= 0 ? '+' : ''}${relative.toFixed(0)}% vs 历史`
  return `${Math.round(value)} GPM${relativeText}`
}

export default function MatchDetail() {
  const navigate = useNavigate()
  const { id } = useParams()
  const { matchLogs } = useMatchLogs()
  const log = matchLogs.find(item => item.id === id)

  if (!log) {
    return (
      <div className="p-6 max-w-2xl mx-auto space-y-4">
        <button type="button" onClick={() => navigate('/history')} className="text-xs text-[var(--text-muted)] hover:text-[var(--text-secondary)]">← 返回历史</button>
        <div className="p-4 rounded-xl border border-[var(--border)] bg-[var(--surface-1)] text-sm text-[var(--text-muted)]">
          没有找到这条对局记录。
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 space-y-5 max-w-2xl mx-auto">
      <div>
        <button type="button" onClick={() => navigate('/history')} className="text-xs text-[var(--text-muted)] hover:text-[var(--text-secondary)] mb-3">← 返回历史</button>
        <div className="flex items-start gap-3">
          <span className={`text-xs font-bold px-2 py-0.5 rounded mt-1 ${
            log.result === 'win'
              ? 'bg-[var(--bg-success)] text-[var(--text-success)]'
              : 'bg-[var(--bg-danger)] text-[var(--text-danger)]'
          }`}>
            {resultLabel(log.result)}
          </span>
          <div className="flex-1">
            <h1 className="text-xl font-bold text-[var(--text-primary)]">{log.hero}</h1>
            <p className="text-sm text-[var(--text-muted)]">
              {new Date(log.timestamp).toLocaleString('zh-CN')} · {log.durationMin} 分钟
              {log.source === 'opendota' ? ' · OpenDota' : ''}
            </p>
          </div>
        </div>
      </div>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-[var(--text-secondary)] uppercase tracking-wider">训练复盘</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="训练目标完成情况" value={goalLabel(log.trainingGoalMet)} />
          <Field label="复盘维度" value={getReviewDimensionLabel(log.reviewDimension)} />
          <Field label="具体判断问题" value={log.reviewTopic} />
          <Field label="对线结果" value={laneLabel(log.laneResult)} />
          <Field label="OpenDota 对线明细" value={laneStatsLabel(log.laneEfficiency, log.laneKills)} />
          <Field label="最蠢死亡区域" value={zoneLabel(log.worstDeathZone)} />
          <Field label="对方 1 号位" value={log.enemyCarry} />
          <Field label="Draft 评分" value={log.draftScore ? `${log.draftScore}/5` : undefined} />
          <Field label="最大错误" value={log.biggestMistake} />
          <Field label="下局唯一改进点" value={log.nextGameFocus} />
          <Field label="备注" value={log.notes} />
        </div>
      </section>

      {(log.reviewClipDeath || log.reviewClipFight || log.reviewClipObjective) && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-[var(--text-secondary)] uppercase tracking-wider">3 片段复盘</h2>
          <div className="grid grid-cols-1 gap-3">
            <Field label="关键死亡片段" value={log.reviewClipDeath} />
            <Field label="关键团战片段" value={log.reviewClipFight} />
            <Field label="关键目标片段" value={log.reviewClipObjective} />
          </div>
        </section>
      )}

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-[var(--text-secondary)] uppercase tracking-wider">对局数据</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Field label="Match ID" value={log.matchId} />
          <Field label="10 分钟补刀" value={log.csAt10} />
          <Field label="10 分钟反补" value={log.dnAt10} />
          <Field label="第一件关键装" value={log.firstKeyItemMin ? `${log.firstKeyItemName ? `${log.firstKeyItemName} · ` : ''}${log.firstKeyItemMin} 分钟` : undefined} />
          <Field label="KDA" value={log.kills !== undefined ? `${log.kills}/${log.deaths ?? '-'}/${log.assists ?? '-'}` : undefined} />
          <Field label="GPM / XPM" value={log.gpm !== undefined ? `${log.gpm} / ${log.xpm ?? '-'}` : undefined} />
          <Field label="总补刀 / 反补" value={log.lastHits !== undefined ? `${log.lastHits} / ${log.denies ?? '-'}` : undefined} />
          <Field label="等级" value={log.level} />
          <Field label="阵营" value={log.isRadiant === undefined ? undefined : log.isRadiant ? '天辉' : '夜魇'} />
        </div>
      </section>

      <PercentileBar metrics={buildPercentileMetrics(log)} />

      {(log.laningGpm !== undefined || log.midGpm !== undefined || log.lateGpm !== undefined) && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-[var(--text-secondary)] uppercase tracking-wider">分阶段表现</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Field label="对线期 0-10" value={formatPhase(log.laningGpm, getPhaseRelativeScore(log.hero, 'laning', log.laningGpm, matchLogs, log.id))} />
            <Field label="中期 10-25" value={formatPhase(log.midGpm, getPhaseRelativeScore(log.hero, 'mid', log.midGpm, matchLogs, log.id))} />
            <Field label="后期 25+" value={formatPhase(log.lateGpm, getPhaseRelativeScore(log.hero, 'late', log.lateGpm, matchLogs, log.id))} />
          </div>
        </section>
      )}
    </div>
  )
}
