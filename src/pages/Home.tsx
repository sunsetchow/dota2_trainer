import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAppState, useMatchLogs, useDailyCheckins, useMMRLogs, useCycles } from '../store/useStore.ts'
import WeekBadge from '../components/WeekBadge.tsx'
import AlertBanner from '../components/AlertBanner.tsx'
import MMRInput from '../components/MMRInput.tsx'
import ChecklistPanel from '../components/ChecklistPanel.tsx'
import { calcLongestStreak, calcStreak, countRecentLosses, todayStr } from '../utils/cycle.ts'
import type { MatchLog, DailyCheckin, MMRLog } from '../types'

export default function Home() {
  const navigate = useNavigate()
  const { appState, update: updateAppState } = useAppState()
  const { matchLogs } = useMatchLogs()
  const { checkins, upsert: upsertCheckin } = useDailyCheckins()
  const { add: addMMR } = useMMRLogs()
  const { cycles } = useCycles()
  const [dismissedBanner, setDismissedBanner] = useState(false)

  const activeCycle = cycles.find(c => c.cycleId === appState?.activeCycleId)
  const recentLosses = countRecentLosses(matchLogs)
  const showLossBanner = recentLosses >= 2 && !dismissedBanner

  const streak = calcStreak(checkins)
  const longestStreak = calcLongestStreak(checkins)
  const todayCheckin = checkins.find(c => c.date === todayStr())

  const handleStartGame = async () => {
    if (appState?.pendingPreGameSetupId) {
      const ok = window.confirm('上一条赛前设定还未关联对局，是否放弃？')
      if (!ok) return
      await updateAppState({ pendingPreGameSetupId: undefined })
    }
    navigate('/pre-game')
  }

  const recentMatches: MatchLog[] = [...matchLogs]
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, 3)

  return (
    <div className="p-6 space-y-6 max-w-2xl mx-auto">
      {/* 标题 */}
      <div>
        <h1 className="text-2xl font-bold text-[var(--text-primary)]">Dota2 训练日志</h1>
        <p className="text-sm text-[var(--text-muted)]">
          连训 {streak} 天
          {longestStreak > 0 ? ` · 最长 ${longestStreak} 天` : ''}
        </p>
      </div>

      {/* 连败提示 */}
      {showLossBanner && (
        <AlertBanner
          type="warning"
          message={`⚠️ 你已连败 ${recentLosses} 把，考虑休息一下？`}
          onDismiss={() => setDismissedBanner(true)}
        />
      )}

      {/* Pending 提示 */}
      {appState?.pendingPreGameSetupId && (
        <AlertBanner
          type="info"
          message="有一条赛前设定等待关联，记得完成赛后记录。"
        />
      )}

      {/* 周次 */}
      {activeCycle && <WeekBadge cycle={activeCycle} />}

      {/* 主操作按钮 */}
      <div className="grid grid-cols-3 gap-3">
        <button
          type="button"
          onClick={() => navigate('/draft')}
          className="flex flex-col items-center gap-2 p-4 rounded-xl border border-[var(--border)] bg-[var(--surface-1)] hover:border-blue-400 transition-all"
        >
          <span className="text-2xl">⚔️</span>
          <span className="text-sm font-medium text-[var(--text-primary)]">Draft 助手</span>
        </button>
        <button
          type="button"
          onClick={handleStartGame}
          className={`flex flex-col items-center gap-2 p-4 rounded-xl border transition-all ${
            appState?.pendingPreGameSetupId
              ? 'border-orange-500 bg-orange-500/10 hover:bg-orange-500/20'
              : 'border-[var(--border)] bg-[var(--surface-1)] hover:border-blue-400'
          }`}
        >
          <span className="text-2xl">🎮</span>
          <span className="text-sm font-medium text-[var(--text-primary)]">开始新局</span>
          {appState?.pendingPreGameSetupId && (
            <span className="text-xs text-orange-400">有待关联</span>
          )}
        </button>
        <button
          type="button"
          onClick={() => navigate('/post-game')}
          className="flex flex-col items-center gap-2 p-4 rounded-xl border border-[var(--border)] bg-[var(--surface-1)] hover:border-blue-400 transition-all"
        >
          <span className="text-2xl">📝</span>
          <span className="text-sm font-medium text-[var(--text-primary)]">记录对局</span>
        </button>
      </div>

      {/* 今日 Checklist */}
      {activeCycle && (
        <div className="space-y-2">
          <h2 className="text-sm font-semibold text-[var(--text-secondary)] uppercase tracking-wider">今日打卡</h2>
          <div className="p-4 rounded-xl border border-[var(--border)] bg-[var(--surface-1)]">
            <ChecklistPanel
              cycle={activeCycle}
              existingCheckin={todayCheckin}
              onSave={async (checkin: DailyCheckin) => {
                await upsertCheckin(checkin)
              }}
            />
          </div>
        </div>
      )}

      {/* 最近 3 局 */}
      {recentMatches.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-[var(--text-secondary)] uppercase tracking-wider">最近对局</h2>
            <button
              type="button"
              onClick={() => navigate('/history')}
              className="text-xs text-blue-400 hover:text-blue-300"
            >
              查看全部
            </button>
          </div>
          <div className="space-y-2">
            {recentMatches.map((log: MatchLog) => (
              <button
                type="button"
                key={log.id}
                onClick={() => navigate(`/history/${log.id}`)}
                className="w-full text-left flex items-center gap-3 px-4 py-3 rounded-lg border border-[var(--border)] bg-[var(--surface-1)] hover:border-blue-400 transition-all"
              >
                <span className={`text-xs font-bold px-2 py-0.5 rounded ${
                  log.result === 'win'
                    ? 'bg-[var(--bg-success)] text-[var(--text-success)]'
                    : 'bg-[var(--bg-danger)] text-[var(--text-danger)]'
                }`}>
                  {log.result === 'win' ? '胜' : '败'}
                </span>
                <span className="text-sm font-medium text-[var(--text-primary)] flex-1">{log.hero}</span>
                <span className="text-xs text-[var(--text-muted)]">{log.durationMin} 分钟</span>
                <span className="text-xs text-[var(--text-muted)]">
                  {new Date(log.timestamp).toLocaleDateString('zh-CN')}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* MMR 浮动录入 */}
      <MMRInput onAdd={async (log: MMRLog) => { await addMMR(log) }} />
    </div>
  )
}
