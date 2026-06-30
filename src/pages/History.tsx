import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMatchLogs } from '../store/useStore.ts'
import { getReviewDimensionLabel } from '../data/reviewDimensions.ts'
import type { MatchLog } from '../types'

export default function History() {
  const navigate = useNavigate()
  const { matchLogs } = useMatchLogs()

  const [filterResult, setFilterResult] = useState<'all' | 'win' | 'loss'>('all')
  const [filterHero, setFilterHero] = useState('')
  const [filterZone, setFilterZone] = useState<'all' | 'green' | 'orange' | 'red'>('all')

  const sorted = [...matchLogs].sort((a, b) => b.timestamp - a.timestamp)

  const filtered = sorted.filter(log => {
    if (filterResult !== 'all' && log.result !== filterResult) return false
    if (filterHero && !log.hero.includes(filterHero)) return false
    if (filterZone !== 'all' && log.worstDeathZone !== filterZone) return false
    return true
  })

  // 英雄列表（用于筛选）
  const heroes = [...new Set(matchLogs.map(l => l.hero))].sort()

  const btnBase = "px-3 py-1 rounded-lg text-xs font-medium border transition-all"
  const btnActive = "border-blue-500 bg-blue-500/20 text-blue-300"
  const btnInactive = "border-[var(--border)] bg-[var(--surface-1)] text-[var(--text-muted)] hover:border-blue-400"

  return (
    <div className="p-6 space-y-4 max-w-2xl mx-auto">
      <div>
        <button type="button" onClick={() => navigate('/')} className="text-xs text-[var(--text-muted)] hover:text-[var(--text-secondary)] mb-3">← 返回</button>
        <h1 className="text-xl font-bold text-[var(--text-primary)]">对局历史</h1>
        <p className="text-sm text-[var(--text-muted)]">共 {matchLogs.length} 局 · 显示 {filtered.length} 局</p>
      </div>

      {/* 筛选栏 */}
      <div className="space-y-2">
        <div className="flex flex-wrap gap-2 items-center">
          <span className="text-xs text-[var(--text-muted)]">胜负：</span>
          {(['all', 'win', 'loss'] as const).map(v => (
            <button
              key={v}
              type="button"
              onClick={() => setFilterResult(v)}
              className={`${btnBase} ${filterResult === v ? btnActive : btnInactive}`}
            >
              {v === 'all' ? '全部' : v === 'win' ? '胜利' : '失败'}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          <span className="text-xs text-[var(--text-muted)]">死亡区：</span>
          {(['all', 'green', 'orange', 'red'] as const).map(v => (
            <button
              key={v}
              type="button"
              onClick={() => setFilterZone(v)}
              className={`${btnBase} ${filterZone === v ? btnActive : btnInactive}`}
            >
              {v === 'all' ? '全部' : v === 'green' ? '绿区' : v === 'orange' ? '橙区' : '红区'}
            </button>
          ))}
        </div>
        {heroes.length > 0 && (
          <div className="flex flex-wrap gap-2 items-center">
            <span className="text-xs text-[var(--text-muted)]">英雄：</span>
            <button
              type="button"
              onClick={() => setFilterHero('')}
              className={`${btnBase} ${filterHero === '' ? btnActive : btnInactive}`}
            >
              全部
            </button>
            {heroes.map(h => (
              <button
                key={h}
                type="button"
                onClick={() => setFilterHero(h === filterHero ? '' : h)}
                className={`${btnBase} ${filterHero === h ? btnActive : btnInactive}`}
              >
                {h}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* 对局列表 */}
      <div className="space-y-2">
        {filtered.length === 0 && (
          <p className="text-center text-sm text-[var(--text-muted)] py-8">暂无对局记录</p>
        )}
        {filtered.map((log: MatchLog) => (
          <button
            type="button"
            key={log.id}
            onClick={() => navigate(`/history/${log.id}`)}
            className="w-full text-left p-4 rounded-xl border border-[var(--border)] bg-[var(--surface-1)] hover:border-blue-400 transition-all space-y-2"
          >
            <div className="flex items-center gap-3">
              <span className={`text-xs font-bold px-2 py-0.5 rounded ${
                log.result === 'win'
                  ? 'bg-[var(--bg-success)] text-[var(--text-success)]'
                  : 'bg-[var(--bg-danger)] text-[var(--text-danger)]'
              }`}>
                {log.result === 'win' ? '胜' : '败'}
              </span>
              <span className="font-medium text-[var(--text-primary)] flex-1">{log.hero}</span>
              {log.source === 'opendota' && (
                <span className="text-xs px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-300 border border-blue-500/30">
                  OpenDota
                </span>
              )}
              <span className="text-xs text-[var(--text-muted)]">{log.durationMin} 分钟</span>
              <span className="text-xs text-[var(--text-muted)]">
                {new Date(log.timestamp).toLocaleDateString('zh-CN')}
              </span>
            </div>
            <div className="text-xs text-[var(--text-secondary)] space-y-1">
              <div className="flex gap-2 flex-wrap">
                <span className={`px-1.5 py-0.5 rounded text-xs ${
                  log.trainingGoalMet === 'yes'
                    ? 'bg-[var(--bg-success)] text-[var(--text-success)]'
                    : log.trainingGoalMet === 'partial'
                    ? 'bg-[var(--bg-warning)] text-[var(--text-warning)]'
                    : 'bg-[var(--bg-danger)] text-[var(--text-danger)]'
                }`}>
                  目标{log.trainingGoalMet === 'yes' ? '完成' : log.trainingGoalMet === 'partial' ? '部分' : '未完成'}
                </span>
                {log.laneResult && (
                  <span className="px-1.5 py-0.5 rounded bg-[var(--surface-2)] text-[var(--text-muted)]">
                    对线：{log.laneResult === 'dominated' ? '压制' : log.laneResult === 'even' ? '持平' : '被压'}
                    {log.laneEfficiency !== undefined ? ` · ${Math.round(log.laneEfficiency)}%` : ''}
                  </span>
                )}
                {log.reviewDimension && (
                  <span className="px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-300">
                    复盘：{getReviewDimensionLabel(log.reviewDimension)}{log.reviewTopic ? ` · ${log.reviewTopic}` : ''}
                  </span>
                )}
                {log.worstDeathZone && (
                  <span className="px-1.5 py-0.5 rounded bg-[var(--surface-2)] text-[var(--text-muted)]">
                    死亡：{log.worstDeathZone === 'green' ? '绿区' : log.worstDeathZone === 'orange' ? '橙区' : '红区'}
                  </span>
                )}
                {log.csAt10 !== undefined && (
                  <span className="px-1.5 py-0.5 rounded bg-[var(--surface-2)] text-[var(--text-muted)]">
                    10分钟补刀：{log.csAt10}
                  </span>
                )}
                {log.firstKeyItemMin !== undefined && (
                  <span className="px-1.5 py-0.5 rounded bg-[var(--surface-2)] text-[var(--text-muted)]">
                    关键装：{log.firstKeyItemName ? `${log.firstKeyItemName} · ` : ''}{log.firstKeyItemMin}分钟
                  </span>
                )}
                {log.kills !== undefined && (
                  <span className="px-1.5 py-0.5 rounded bg-[var(--surface-2)] text-[var(--text-muted)]">
                    KDA：{log.kills}/{log.deaths ?? '-'}/{log.assists ?? '-'}
                  </span>
                )}
                {log.gpm !== undefined && (
                  <span className="px-1.5 py-0.5 rounded bg-[var(--surface-2)] text-[var(--text-muted)]">
                    GPM/XPM：{log.gpm}/{log.xpm ?? '-'}
                  </span>
                )}
                {log.lastHits !== undefined && (
                  <span className="px-1.5 py-0.5 rounded bg-[var(--surface-2)] text-[var(--text-muted)]">
                    LH/DN：{log.lastHits}/{log.denies ?? '-'}
                  </span>
                )}
                {log.matchId && (
                  <span className="px-1.5 py-0.5 rounded bg-[var(--surface-2)] text-[var(--text-muted)]">
                    ID：{log.matchId}
                  </span>
                )}
              </div>
              {log.biggestMistake && (
                <p><span className="text-[var(--text-muted)]">错误：</span>{log.biggestMistake}</p>
              )}
              {log.nextGameFocus && (
                <p><span className="text-[var(--text-muted)]">下局：</span>{log.nextGameFocus}</p>
              )}
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}
