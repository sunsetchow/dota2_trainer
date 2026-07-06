import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMatchLogs } from '../store/useStore.ts'
import { getReviewDimensionLabel } from '../data/reviewDimensions.ts'
import { getDisplayHeroName } from '../utils/heroIdentity.ts'
import { useLanguage, useT } from '../i18n/index.ts'
import type { MatchLog } from '../types'

export default function History() {
  const navigate = useNavigate()
  const { matchLogs } = useMatchLogs()
  const t = useT()
  const language = useLanguage()

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
  const btnActive = "border-[var(--accent-border)] bg-[var(--accent-muted)] text-[var(--accent-strong)]"
  const btnInactive = "border-[var(--border)] bg-[var(--surface-1)] text-[var(--text-muted)] hover:border-[var(--accent-border)]"

  return (
    <div className="p-6 space-y-4 max-w-2xl mx-auto">
      <div>
        <button type="button" onClick={() => navigate('/')} className="text-xs text-[var(--text-muted)] hover:text-[var(--text-secondary)] mb-3">{t('common.back')}</button>
        <h1 className="text-xl font-bold text-[var(--text-primary)]">{t('history.title')}</h1>
        <p className="text-sm text-[var(--text-muted)]">{t('history.summary', { total: matchLogs.length, shown: filtered.length })}</p>
      </div>

      {/* 筛选栏 */}
      <div className="space-y-2">
        <div className="flex flex-wrap gap-2 items-center">
          <span className="text-xs text-[var(--text-muted)]">{t('history.filterResultLabel')}</span>
          {(['all', 'win', 'loss'] as const).map(v => (
            <button
              key={v}
              type="button"
              onClick={() => setFilterResult(v)}
              className={`${btnBase} ${filterResult === v ? btnActive : btnInactive}`}
            >
              {v === 'all' ? t('history.all') : v === 'win' ? t('history.win') : t('history.loss')}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          <span className="text-xs text-[var(--text-muted)]">{t('history.filterZoneLabel')}</span>
          {(['all', 'green', 'orange', 'red'] as const).map(v => (
            <button
              key={v}
              type="button"
              onClick={() => setFilterZone(v)}
              className={`${btnBase} ${filterZone === v ? btnActive : btnInactive}`}
            >
              {v === 'all' ? t('history.all') : v === 'green' ? t('common.zoneGreen') : v === 'orange' ? t('common.zoneOrange') : t('common.zoneRed')}
            </button>
          ))}
        </div>
        {heroes.length > 0 && (
          <div className="flex flex-wrap gap-2 items-center">
            <span className="text-xs text-[var(--text-muted)]">{t('history.filterHeroLabel')}</span>
            <button
              type="button"
              onClick={() => setFilterHero('')}
              className={`${btnBase} ${filterHero === '' ? btnActive : btnInactive}`}
            >
              {t('history.all')}
            </button>
            {heroes.map(h => (
              <button
                key={h}
                type="button"
                onClick={() => setFilterHero(h === filterHero ? '' : h)}
                className={`${btnBase} ${filterHero === h ? btnActive : btnInactive}`}
              >
                {getDisplayHeroName(h, language)}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* 对局列表 */}
      <div className="space-y-2">
        {filtered.length === 0 && (
          <p className="text-center text-sm text-[var(--text-muted)] py-8">{t('history.noMatches')}</p>
        )}
        {filtered.map((log: MatchLog) => (
          <button
            type="button"
            key={log.id}
            onClick={() => navigate(`/history/${log.id}`)}
            className="w-full text-left p-4 rounded-xl border border-[var(--border)] bg-[var(--surface-1)] hover:border-[var(--accent-border)] transition-all space-y-2"
          >
            <div className="flex items-center gap-3">
              <span className={`text-xs font-bold px-2 py-0.5 rounded ${
                log.result === 'win'
                  ? 'bg-[var(--bg-success)] text-[var(--text-success)]'
                  : 'bg-[var(--bg-danger)] text-[var(--text-danger)]'
              }`}>
                {log.result === 'win' ? t('history.resultWinShort') : t('history.resultLossShort')}
              </span>
              <span className="font-medium text-[var(--text-primary)] flex-1">{getDisplayHeroName(log.hero, language)}</span>
              {log.source === 'opendota' && (
                <span className="text-xs px-1.5 py-0.5 rounded bg-[var(--bg-info)] text-[var(--text-info)] border border-[var(--border-info)]">
                  OpenDota
                </span>
              )}
              <span className="text-xs text-[var(--text-muted)]">{t('history.minutes', { n: log.durationMin })}</span>
              <span className="text-xs text-[var(--text-muted)]">
                {new Date(log.timestamp).toLocaleDateString(language === 'zh' ? 'zh-CN' : 'en-US')}
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
                  {log.trainingGoalMet === 'yes' ? t('history.goalMet') : log.trainingGoalMet === 'partial' ? t('history.goalPartial') : t('history.goalNotMet')}
                </span>
                {log.laneResult && (
                  <span className="px-1.5 py-0.5 rounded bg-[var(--surface-2)] text-[var(--text-muted)]">
                    {t('history.laneLabel', {
                      result: log.laneResult === 'dominated' ? t('common.laneDominated') : log.laneResult === 'even' ? t('common.laneEven') : t('common.laneLost'),
                      efficiency: log.laneEfficiency !== undefined ? ` · ${Math.round(log.laneEfficiency)}%` : '',
                    })}
                  </span>
                )}
                {log.reviewDimension && (
                  <span className="px-1.5 py-0.5 rounded bg-[var(--bg-info)] text-[var(--text-info)]">
                    {t('history.reviewLabel', {
                      dimension: getReviewDimensionLabel(log.reviewDimension, language) ?? '',
                      topic: log.reviewTopic ? ` · ${log.reviewTopic}` : '',
                    })}
                  </span>
                )}
                {log.worstDeathZone && (
                  <span className="px-1.5 py-0.5 rounded bg-[var(--surface-2)] text-[var(--text-muted)]">
                    {t('history.deathZoneLabel', { zone: log.worstDeathZone === 'green' ? t('common.zoneGreen') : log.worstDeathZone === 'orange' ? t('common.zoneOrange') : t('common.zoneRed') })}
                  </span>
                )}
                {log.csAt10 !== undefined && (
                  <span className="px-1.5 py-0.5 rounded bg-[var(--surface-2)] text-[var(--text-muted)]">
                    {t('history.csAt10Label', { cs: log.csAt10 })}
                  </span>
                )}
                {log.firstKeyItemMin !== undefined && (
                  <span className="px-1.5 py-0.5 rounded bg-[var(--surface-2)] text-[var(--text-muted)]">
                    {t('history.keyItemLabel', { item: `${log.firstKeyItemName ? `${log.firstKeyItemName} · ` : ''}${log.firstKeyItemMin}` })}
                  </span>
                )}
                {log.kills !== undefined && (
                  <span className="px-1.5 py-0.5 rounded bg-[var(--surface-2)] text-[var(--text-muted)]">
                    {t('history.kdaLabel', { k: log.kills, d: log.deaths ?? '-', a: log.assists ?? '-' })}
                  </span>
                )}
                {log.gpm !== undefined && (
                  <span className="px-1.5 py-0.5 rounded bg-[var(--surface-2)] text-[var(--text-muted)]">
                    {t('history.gpmXpmLabel', { gpm: log.gpm, xpm: log.xpm ?? '-' })}
                  </span>
                )}
                {log.lastHits !== undefined && (
                  <span className="px-1.5 py-0.5 rounded bg-[var(--surface-2)] text-[var(--text-muted)]">
                    {t('history.lhDnLabel', { lh: log.lastHits, dn: log.denies ?? '-' })}
                  </span>
                )}
                {log.matchId && (
                  <span className="px-1.5 py-0.5 rounded bg-[var(--surface-2)] text-[var(--text-muted)]">
                    {t('history.idLabel', { id: log.matchId })}
                  </span>
                )}
              </div>
              {log.biggestMistake && (
                <p><span className="text-[var(--text-muted)]">{t('history.mistakePrefix')}</span>{log.biggestMistake}</p>
              )}
              {log.nextGameFocus && (
                <p><span className="text-[var(--text-muted)]">{t('history.nextPrefix')}</span>{log.nextGameFocus}</p>
              )}
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}
