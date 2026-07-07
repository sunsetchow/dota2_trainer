import PercentileBar, { buildPercentileMetrics } from '../../components/PercentileBar.tsx'
import { useT } from '../../i18n/index.ts'
import type { OpenDotaImportedMatch, OpenDotaRecentMatch } from '../../types'

// stomp 只有 Stratz 数据源才有（直接来自它自己的三路对线结果判断）；OpenDota 或手动
// 填写时 laneStomp 是 undefined，退回原来笼统的"压制/被压"说法，不瞎猜大胜小胜。
function laneResultLabel(result: 'dominated' | 'even' | 'lost', stomp: boolean | undefined): string {
  if (result === 'even') return '持平'
  if (result === 'dominated') return stomp === undefined ? '压制' : stomp ? '大胜' : '小胜'
  return stomp === undefined ? '被压' : stomp ? '大败' : '小败'
}

// Stratz 的 actualRank 是 medal*10+star 的标准编码（跟 OpenDota 的 rank_tier 一致），
// 比如 53 = 传奇 3。冠绝（Immortal）通常没有星级，只显示段位名。
const RANK_TIER_NAMES: Record<number, string> = {
  1: '先锋', 2: '卫士', 3: '中军', 4: '统帅', 5: '传奇', 6: '万古', 7: '神话', 8: '冠绝',
}
function rankLabel(actualRank: number | undefined): string | undefined {
  if (actualRank === undefined) return undefined
  const tier = Math.floor(actualRank / 10)
  const star = actualRank % 10
  const tierName = RANK_TIER_NAMES[tier]
  if (!tierName) return undefined
  return star > 0 ? `${tierName} ${star}` : tierName
}

interface OpenDotaImportPanelProps {
  dataSourceLabel: string
  matchId: string
  importedMatch: OpenDotaImportedMatch | null
  recentMatches: OpenDotaRecentMatch[]
  openDotaStatus: string
  canRequestParse: boolean
  importingOpenDota: boolean
  autoImportingOpenDota: boolean
  analyzingOpenDota: boolean
  loadingRecentMatches: boolean
  inputCls: string
  onMatchIdChange: (value: string) => void
  onImportOpenDota: () => void
  onAutoImportOpenDota: () => void
  onLoadRecentOpenDotaMatches: () => void
  onImportRecentMatch: (row: OpenDotaRecentMatch) => void
  onAnalyzeAndImportOpenDota: () => void
}

export default function OpenDotaImportPanel({
  dataSourceLabel,
  matchId,
  importedMatch,
  recentMatches,
  openDotaStatus,
  canRequestParse,
  importingOpenDota,
  autoImportingOpenDota,
  analyzingOpenDota,
  loadingRecentMatches,
  inputCls,
  onMatchIdChange,
  onImportOpenDota,
  onAutoImportOpenDota,
  onLoadRecentOpenDotaMatches,
  onImportRecentMatch,
  onAnalyzeAndImportOpenDota,
}: OpenDotaImportPanelProps) {
  const t = useT()
  return (
    <div className="space-y-2 p-4 rounded-xl border border-[var(--border)] bg-[var(--surface-1)]">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-[var(--text-secondary)] uppercase tracking-wider">{dataSourceLabel}</h2>
          <p className="text-xs text-[var(--text-muted)] mt-1">进入页面会尝试同步最近一局；也可手动输入 Match ID</p>
        </div>
        {importedMatch && (
          <span className="text-xs px-2 py-1 rounded bg-[var(--bg-info)] text-[var(--text-info)] border border-[var(--border-info)]">
            已导入
          </span>
        )}
      </div>
      <div className="grid gap-2 sm:grid-cols-[1fr_auto_auto]">
        <input
          type="text"
          inputMode="numeric"
          value={matchId}
          onChange={e => onMatchIdChange(e.target.value)}
          placeholder="Match ID"
          className={inputCls}
        />
        <button
          type="button"
          onClick={onImportOpenDota}
          disabled={importingOpenDota || autoImportingOpenDota || analyzingOpenDota || !matchId.trim()}
          className="px-4 py-2 rounded-lg bg-[var(--accent)] text-[var(--text-primary)] text-sm font-semibold hover:bg-[var(--accent-strong)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors whitespace-nowrap"
        >
          {importingOpenDota ? '导入中…' : '导入'}
        </button>
        <button
          type="button"
          onClick={onAutoImportOpenDota}
          disabled={importingOpenDota || autoImportingOpenDota || analyzingOpenDota}
          className="px-4 py-2 rounded-lg border border-[var(--accent-border)] bg-[var(--accent-muted)] text-[var(--accent-strong)] text-sm font-medium hover:bg-[var(--surface-2)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors whitespace-nowrap"
        >
          {autoImportingOpenDota ? '同步中…' : '同步最近一局'}
        </button>
      </div>
      <button
        type="button"
        onClick={onLoadRecentOpenDotaMatches}
        disabled={loadingRecentMatches || importingOpenDota || autoImportingOpenDota || analyzingOpenDota}
        className="w-full py-2 rounded-lg border border-[var(--border)] text-[var(--text-secondary)] text-sm font-medium hover:border-[var(--accent-border)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
      >
        {loadingRecentMatches ? '拉取中…' : '查看最近 10 场'}
      </button>
      {recentMatches.length > 0 && (
        <div className="max-h-72 space-y-2 overflow-y-auto rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-2">
          {recentMatches.map(row => (
            <button
              key={row.matchId}
              type="button"
              onClick={() => onImportRecentMatch(row)}
              disabled={row.recorded || importingOpenDota || analyzingOpenDota}
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface-1)] px-3 py-2 text-left transition-colors hover:border-[var(--accent-border)] disabled:cursor-not-allowed disabled:opacity-45"
            >
              <div className="flex items-center justify-between gap-3 text-sm">
                <span className="font-semibold text-[var(--text-primary)]">{row.heroName ?? `英雄 ${row.heroId ?? '-'}`}</span>
                <span className={`text-xs ${row.result === 'win' ? 'text-[var(--text-success)]' : row.result === 'loss' ? 'text-[var(--text-danger)]' : 'text-[var(--text-muted)]'}`}>{row.recorded ? '已记录' : row.result === 'win' ? '胜' : row.result === 'loss' ? '败' : '未知'}</span>
              </div>
              <div className="number mt-1 text-xs text-[var(--text-muted)]">
                {row.timestamp ? new Date(row.timestamp).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : '时间未知'} · {row.durationMin ? `${row.durationMin}m` : '时长未知'} · KDA {row.kills ?? '-'}/{row.deaths ?? '-'}/{row.assists ?? '-'} · {row.matchId}
              </div>
            </button>
          ))}
        </div>
      )}
      <button
        type="button"
        onClick={onAnalyzeAndImportOpenDota}
        disabled={importingOpenDota || analyzingOpenDota || !matchId.trim()}
        className="w-full py-2 rounded-lg border border-[var(--border-info)] bg-[var(--bg-info)] text-[var(--text-info)] text-sm font-medium hover:bg-[var(--surface-2)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
      >
        {analyzingOpenDota ? '分析并等待数据中…' : '请求分析并自动导入'}
      </button>
      {openDotaStatus && (
        <p className={`text-xs ${importedMatch ? 'text-[var(--text-info)]' : 'text-[var(--text-warning)]'}`}>
          {openDotaStatus}
        </p>
      )}
      {canRequestParse && !importedMatch && (
        <button
          type="button"
          onClick={onAnalyzeAndImportOpenDota}
          disabled={analyzingOpenDota}
          className="w-full py-2 rounded-lg border border-orange-500/50 bg-orange-500/10 text-orange-300 text-sm font-medium hover:bg-orange-500/20 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          {analyzingOpenDota ? '分析并等待数据中…' : '请求分析并自动导入'}
        </button>
      )}
      {importedMatch && (
        <>
          <PercentileBar metrics={buildPercentileMetrics(importedMatch, t)} />
          <div className="grid grid-cols-3 gap-2 pt-1 text-xs">
            <div className="px-2 py-1.5 rounded bg-[var(--surface-2)] text-[var(--text-muted)]">
              KDA <span className="text-[var(--text-primary)]">{importedMatch.kills ?? '-'}/{importedMatch.deaths ?? '-'}/{importedMatch.assists ?? '-'}</span>
            </div>
            <div className="px-2 py-1.5 rounded bg-[var(--surface-2)] text-[var(--text-muted)]">
              GPM/XPM <span className="text-[var(--text-primary)]">{importedMatch.gpm ?? '-'}/{importedMatch.xpm ?? '-'}</span>
            </div>
            <div className="px-2 py-1.5 rounded bg-[var(--surface-2)] text-[var(--text-muted)]">
              LH/DN <span className="text-[var(--text-primary)]">{importedMatch.lastHits ?? '-'}/{importedMatch.denies ?? '-'}</span>
            </div>
            {(importedMatch.heroHealing !== undefined || importedMatch.towerDamage !== undefined) && (
              <div className="px-2 py-1.5 rounded bg-[var(--surface-2)] text-[var(--text-muted)] col-span-3">
                治疗/塔伤 <span className="text-[var(--text-primary)]">{importedMatch.heroHealing ?? '-'}/{importedMatch.towerDamage ?? '-'}</span>
              </div>
            )}
            {rankLabel(importedMatch.actualRank) && (
              <div className="px-2 py-1.5 rounded bg-[var(--surface-2)] text-[var(--text-muted)] col-span-3">
                段位 <span className="text-[var(--text-primary)]">{rankLabel(importedMatch.actualRank)}</span>
              </div>
            )}
            {importedMatch.openingWinRate !== undefined && (
              <div className="px-2 py-1.5 rounded bg-[var(--surface-2)] text-[var(--text-muted)] col-span-3">
                开局预测胜率 <span className="text-[var(--text-primary)]">{importedMatch.openingWinRate}%</span>
              </div>
            )}
            {importedMatch.winRateSwings && importedMatch.winRateSwings.length > 0 && (
              <div className="px-2 py-1.5 rounded bg-[var(--surface-2)] text-[var(--text-muted)] col-span-3">
                胜率转折点（约） <span className="text-[var(--text-primary)]">
                  {importedMatch.winRateSwings.map(swing => `第${swing.approxMinute}分钟 ${swing.delta >= 0 ? '+' : ''}${swing.delta}%→${swing.ownWinRate}%`).join(' · ')}
                </span>
              </div>
            )}
            <div className="px-2 py-1.5 rounded bg-[var(--surface-2)] text-[var(--text-muted)] col-span-3">
              对线 <span className="text-[var(--text-primary)]">
                {importedMatch.laneResult
                  ? `${laneResultLabel(importedMatch.laneResult, importedMatch.laneStomp)}${importedMatch.laneEfficiency !== undefined ? ` · 效率 ${Math.round(importedMatch.laneEfficiency)}%` : ''}${importedMatch.laneKills !== undefined ? ` · 对线单位击杀 ${importedMatch.laneKills}` : ''}`
                  : `${dataSourceLabel} 未返回对线明细`}
              </span>
            </div>
            <div className="px-2 py-1.5 rounded bg-[var(--surface-2)] text-[var(--text-muted)] col-span-3">
              关键装 <span className="text-[var(--text-primary)]">{importedMatch.firstKeyItemName && importedMatch.firstKeyItemMin ? `${importedMatch.firstKeyItemName} · ${importedMatch.firstKeyItemMin} 分` : '未命中规则'}</span>
            </div>
            {(importedMatch.laningGpm !== undefined || importedMatch.midGpm !== undefined || importedMatch.lateGpm !== undefined) && (
              <div className="px-2 py-1.5 rounded bg-[var(--surface-2)] text-[var(--text-muted)] col-span-3">
                分阶段 GPM <span className="text-[var(--text-primary)]">对线 {importedMatch.laningGpm !== undefined ? Math.round(importedMatch.laningGpm) : '-'} · 中期 {importedMatch.midGpm !== undefined ? Math.round(importedMatch.midGpm) : '-'} · 后期 {importedMatch.lateGpm !== undefined ? Math.round(importedMatch.lateGpm) : '-'}</span>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
