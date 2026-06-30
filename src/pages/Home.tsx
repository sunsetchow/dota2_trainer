import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAppState, useMatchLogs, useDailyCheckins, useMMRLogs, useCycles } from '../store/useStore.ts'
import WeekBadge from '../components/WeekBadge.tsx'
import MMRInput from '../components/MMRInput.tsx'
import MMRTrend from '../components/MMRTrend.tsx'
import ChecklistPanel from '../components/ChecklistPanel.tsx'
import { calcLongestStreak, calcStreak, countRecentLosses, todayStr } from '../utils/cycle.ts'
import type { MatchLog, DailyCheckin, MMRLog } from '../types'
import Button from '../components/ui/Button.tsx'
import Card from '../components/ui/Card.tsx'
import Badge from '../components/ui/Badge.tsx'
import Banner from '../components/ui/Banner.tsx'

function formatDate(ts: number) {
  return new Date(ts).toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' })
}

export default function Home() {
  const navigate = useNavigate()
  const { appState, update: updateAppState } = useAppState()
  const { matchLogs } = useMatchLogs()
  const { checkins, upsert: upsertCheckin } = useDailyCheckins()
  const { mmrLogs, add: addMMR } = useMMRLogs()
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

  const primaryAction = appState?.pendingPreGameSetupId
    ? { label: '记录赛后', onClick: () => navigate('/post-game'), helper: '有一局赛前设定正在等待关联。' }
    : todayCheckin
      ? { label: '进入 Draft', onClick: () => navigate('/draft'), helper: '今日已打卡，可以开始下一局训练。' }
      : { label: '完成今日打卡', onClick: () => document.getElementById('today-checkin')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), helper: '先选训练档位，再进入实战。' }

  return (
    <div className="mx-auto max-w-[1280px] space-y-6 px-4 py-6 md:px-6">
      <section className="grid gap-4 lg:grid-cols-[1.35fr_0.95fr]">
        <Card className="overflow-hidden p-5 md:p-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div className="min-w-0">
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <Badge tone={todayCheckin ? 'success' : 'accent'}>{todayCheckin ? '今日已打卡' : '今日待打卡'}</Badge>
                <Badge tone="neutral" className="number">连训 {streak} 天</Badge>
                {longestStreak > 0 && <Badge tone="neutral" className="number">最长 {longestStreak} 天</Badge>}
              </div>
              <h1 className="text-2xl font-bold tracking-tight text-[var(--text-primary)] md:text-3xl">今日训练驾驶舱</h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--text-secondary)]">
                先锁定训练目标，再进入对局。赛后只记录最大错误和下局唯一改进点。
              </p>
            </div>
            <div className="shrink-0">
              <Button variant="primary" onClick={primaryAction.onClick}>{primaryAction.label}</Button>
            </div>
          </div>

          {activeCycle && (
            <div className="mt-5">
              <WeekBadge cycle={activeCycle} />
            </div>
          )}
        </Card>

        <Card tone="accent" className="p-5 md:p-6">
          <div className="flex h-full flex-col justify-between gap-5">
            <div>
              <div className="text-sm font-semibold text-[var(--accent-strong)]">下一步行动</div>
              <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">{primaryAction.helper}</p>
            </div>
            <div className="grid gap-2">
              <Button variant="primary" size="lg" fullWidth onClick={primaryAction.onClick}>{primaryAction.label}</Button>
              <div className="grid grid-cols-2 gap-2">
                <Button variant="secondary" onClick={() => navigate('/draft')}>Draft 助手</Button>
                <Button variant="secondary" onClick={handleStartGame}>开始新局</Button>
              </div>
              <Button variant="ghost" onClick={() => navigate('/post-game')}>手动记录赛后</Button>
            </div>
          </div>
        </Card>
      </section>

      <div className="grid gap-6 lg:grid-cols-[1.35fr_0.95fr]">
        <section id="today-checkin" className="space-y-3 scroll-mt-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-[var(--text-primary)]">今日打卡</h2>
              <p className="mt-1 text-sm text-[var(--text-muted)]">记录训练档位和完成项，计划页只负责回看。</p>
            </div>
            {todayCheckin && <Badge tone="success">{todayCheckin.sessionType}</Badge>}
          </div>

          {activeCycle ? (
            <Card className="p-4 md:p-5">
              <ChecklistPanel
                cycle={activeCycle}
                existingCheckin={todayCheckin}
                onSave={async (checkin: DailyCheckin) => {
                  await upsertCheckin(checkin)
                }}
              />
            </Card>
          ) : (
            <Card className="p-5 text-sm text-[var(--text-muted)]">训练周期正在初始化。</Card>
          )}
        </section>

        <aside className="space-y-4">
          {showLossBanner && (
            <Banner
              tone="warning"
              action={<Button variant="ghost" size="sm" onClick={() => setDismissedBanner(true)}>知道了</Button>}
            >
              已连败 {recentLosses} 把。建议先复盘上一局最大错误，再决定是否继续排位。
            </Banner>
          )}

          {appState?.pendingPreGameSetupId && (
            <Banner tone="info" action={<Button variant="secondary" size="sm" onClick={() => navigate('/post-game')}>去记录</Button>}>
              有一条赛前设定等待关联，完成赛后记录后训练闭环才算结束。
            </Banner>
          )}

          <Card className="p-4 md:p-5">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold text-[var(--text-primary)]">最近对局</h2>
                <p className="mt-1 text-sm text-[var(--text-muted)]">看重复错误，不看流水账。</p>
              </div>
              <Button variant="ghost" size="sm" onClick={() => navigate('/history')}>全部</Button>
            </div>

            {recentMatches.length > 0 ? (
              <div className="space-y-2">
                {recentMatches.map((log: MatchLog) => (
                  <button
                    type="button"
                    key={log.id}
                    onClick={() => navigate(`/history/${log.id}`)}
                    className="w-full rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface-2)] p-3 text-left transition-all hover:border-[var(--accent-border)] hover:bg-[var(--surface-3)] active:translate-y-px"
                  >
                    <div className="flex items-center gap-2">
                      <Badge tone={log.result === 'win' ? 'success' : 'danger'}>{log.result === 'win' ? '胜' : '败'}</Badge>
                      <span className="min-w-0 flex-1 truncate text-sm font-semibold text-[var(--text-primary)]">{log.hero}</span>
                      <span className="number text-xs text-[var(--text-muted)]">{log.durationMin}m</span>
                      <span className="number text-xs text-[var(--text-muted)]">{formatDate(log.timestamp)}</span>
                    </div>
                    {(log.biggestMistake || log.nextGameFocus) && (
                      <div className="mt-2 space-y-1 text-xs leading-5 text-[var(--text-secondary)]">
                        {log.biggestMistake && <div className="line-clamp-1">错点：{log.biggestMistake}</div>}
                        {log.nextGameFocus && <div className="line-clamp-1 text-[var(--accent-strong)]">下局：{log.nextGameFocus}</div>}
                      </div>
                    )}
                  </button>
                ))}
              </div>
            ) : (
              <div className="rounded-[var(--radius-md)] border border-dashed border-[var(--border)] bg-[var(--surface-2)] p-4 text-sm leading-6 text-[var(--text-muted)]">
                还没有对局记录。打一局后，用 2 分钟写下最大错误和下局唯一改进点。
              </div>
            )}
          </Card>

          <MMRTrend logs={mmrLogs} />
        </aside>
      </div>

      <MMRInput onAdd={async (log: MMRLog) => { await addMMR(log) }} />
    </div>
  )
}
