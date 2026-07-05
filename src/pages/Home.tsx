import React, { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAppState, useMatchLogs, useDailyCheckins, useMMRLogs, useCycles, useHeroNotes } from '../store/useStore.ts'
import WeekBadge from '../components/WeekBadge.tsx'
import MMRInput from '../components/MMRInput.tsx'
import MMRTrend from '../components/MMRTrend.tsx'
import ChecklistPanel from '../components/ChecklistPanel.tsx'
import { calcLongestStreak, calcStreak, countRecentLosses, todayStr } from '../utils/cycle.ts'
import { grantFreezeTokenIfEarned, hitMilestoneToday, reconcileStreakFreeze } from '../utils/streakFreeze.ts'
import { isDueForReview } from '../utils/srs.ts'
import { getDisplayHeroName } from '../utils/heroIdentity.ts'
import { useLanguage, useT } from '../i18n/index.ts'
import type { MatchLog, DailyCheckin, MMRLog } from '../types'
import Button from '../components/ui/Button.tsx'
import Card from '../components/ui/Card.tsx'
import Badge from '../components/ui/Badge.tsx'
import Banner from '../components/ui/Banner.tsx'

export default function Home() {
  const navigate = useNavigate()
  const { appState, update: updateAppState } = useAppState()
  const { matchLogs } = useMatchLogs()
  const { checkins, upsert: upsertCheckin } = useDailyCheckins()
  const { mmrLogs, add: addMMR } = useMMRLogs()
  const { cycles } = useCycles()
  const { heroNotes } = useHeroNotes()
  const [dismissedBanner, setDismissedBanner] = useState(false)
  const [milestoneBanner, setMilestoneBanner] = useState('')
  const t = useT()
  const language = useLanguage()

  const formatDate = (ts: number) => new Date(ts).toLocaleDateString(language === 'zh' ? 'zh-CN' : 'en-US', { month: '2-digit', day: '2-digit' })

  const activeCycle = cycles.find(c => c.cycleId === appState?.activeCycleId)
  const recentLosses = countRecentLosses(matchLogs)
  const showLossBanner = recentLosses >= 2 && !dismissedBanner
  const freezeUsedDates = appState?.freezeUsedDates ?? []
  const freezeTokens = appState?.checklistFreezeTokens ?? 0
  const streak = calcStreak(checkins, freezeUsedDates)
  const longestStreak = calcLongestStreak(checkins, freezeUsedDates)
  const todayCheckin = checkins.find(c => c.date === todayStr())
  const today = todayStr()
  const dueNotes = useMemo(
    () => heroNotes
      .filter(note => isDueForReview(note, today))
      .sort((a, b) => (a.srsNextReviewDate ?? '').localeCompare(b.srsNextReviewDate ?? '') || a.hero.localeCompare(b.hero, 'zh-CN')),
    [heroNotes, today],
  )
  const dueNotesCount = dueNotes.length
  const firstDueHero = dueNotes[0]?.hero

  useEffect(() => {
    if (!appState) return
    const previousFreezeDates = appState.freezeUsedDates ?? []
    const result = reconcileStreakFreeze(checkins, appState.checklistFreezeTokens ?? 0, previousFreezeDates)
    if (!result.changed) return

    // 用 freeze 覆盖前后的 streak 差值判断这次自动补卡是否跨过了发放 token 的 7 天整数倍边界，
    // 否则"某天靠 freeze 续上、刚好跨过第 7/14 天"这种情况永远不会发 token（只有手动打卡才会检查）。
    const previousStreak = calcStreak(checkins, previousFreezeDates)
    const nextStreak = calcStreak(checkins, result.freezeUsedDates)
    const nextTokens = previousStreak !== nextStreak
      ? grantFreezeTokenIfEarned(nextStreak, result.freezeTokens)
      : result.freezeTokens

    updateAppState({ checklistFreezeTokens: nextTokens, freezeUsedDates: result.freezeUsedDates })

    const milestone = hitMilestoneToday(previousStreak, nextStreak)
    if (milestone) setMilestoneBanner(t('home.milestoneBanner', { days: milestone }))
  }, [checkins, appState])

  const handleStartGame = async () => {
    if (appState?.pendingPreGameSetupId) {
      const ok = window.confirm(t('home.confirmDiscardSetup'))
      if (!ok) return
      await updateAppState({ pendingPreGameSetupId: undefined })
    }
    navigate('/draft')
  }

  const recentMatches: MatchLog[] = [...matchLogs]
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, 3)

  const primaryAction = appState?.pendingPreGameSetupId
    ? { label: t('appShell.recordPostGame'), onClick: () => navigate('/post-game'), helper: t('home.primaryActionPostGameHelper') }
    : todayCheckin
      ? { label: t('appShell.enterDraft'), onClick: () => navigate('/draft'), helper: t('home.primaryActionDraftHelper') }
      : { label: t('home.primaryActionCheckin'), onClick: () => document.getElementById('today-checkin')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), helper: t('home.primaryActionCheckinHelper') }

  return (
    <div className="mx-auto max-w-[1280px] space-y-6 px-4 py-6 md:px-6">
      <section className="grid gap-4 lg:grid-cols-[1.35fr_0.95fr]">
        <Card className="overflow-hidden p-5 md:p-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div className="min-w-0">
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <Badge tone={todayCheckin ? 'success' : 'accent'}>{todayCheckin ? t('home.todayCheckedIn') : t('home.todayPending')}</Badge>
                <Badge tone="neutral" className="number">{t('appShell.streak', { days: streak })}</Badge>
                <Badge tone="neutral" className="number">{t('home.freeze', { tokens: freezeTokens })}</Badge>
                {longestStreak > 0 && <Badge tone="neutral" className="number">{t('home.longestStreak', { days: longestStreak })}</Badge>}
              </div>
              <h1 className="text-2xl font-bold tracking-tight text-[var(--text-primary)] md:text-3xl">{t('home.title')}</h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--text-secondary)]">
                {t('home.subtitle')}
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
              <div className="text-sm font-semibold text-[var(--accent-strong)]">{t('home.nextAction')}</div>
              <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">{primaryAction.helper}</p>
            </div>
            <div className="grid gap-2">
              <Button variant="primary" size="lg" fullWidth onClick={primaryAction.onClick}>{primaryAction.label}</Button>
              <div className="grid grid-cols-2 gap-2">
                <Button variant="secondary" onClick={() => navigate('/draft')}>{t('home.draftAssistant')}</Button>
                <Button variant="secondary" onClick={handleStartGame}>{t('appShell.startNewGame')}</Button>
              </div>
              <Button variant="ghost" onClick={() => navigate('/post-game')}>{t('home.manualPostGame')}</Button>
            </div>
          </div>
        </Card>
      </section>

      <div className="grid gap-6 lg:grid-cols-[1.35fr_0.95fr]">
        <section id="today-checkin" className="space-y-3 scroll-mt-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-[var(--text-primary)]">{t('home.todayCheckinTitle')}</h2>
              <p className="mt-1 text-sm text-[var(--text-muted)]">{t('home.todayCheckinDesc')}</p>
            </div>
            {todayCheckin && <Badge tone="success">{todayCheckin.sessionType}</Badge>}
          </div>

          {activeCycle ? (
            <Card className="p-4 md:p-5">
              <ChecklistPanel
                cycle={activeCycle}
                existingCheckin={todayCheckin}
                onSave={async (checkin: DailyCheckin) => {
                  const previousStreak = calcStreak(checkins, freezeUsedDates)
                  const nextCheckins = [
                    ...checkins.filter(item => item.date !== checkin.date),
                    checkin,
                  ].sort((a, b) => a.date.localeCompare(b.date))
                  await upsertCheckin(checkin)
                  const nextStreak = calcStreak(nextCheckins, freezeUsedDates)
                  const nextTokens = previousStreak !== nextStreak ? grantFreezeTokenIfEarned(nextStreak, freezeTokens) : freezeTokens
                  if (nextTokens !== freezeTokens) await updateAppState({ checklistFreezeTokens: nextTokens })
                  const milestone = hitMilestoneToday(previousStreak, nextStreak)
                  if (milestone) setMilestoneBanner(t('home.milestoneBanner', { days: milestone }))
                }}
              />
            </Card>
          ) : (
            <Card className="p-5 text-sm text-[var(--text-muted)]">{t('home.cycleInitializing')}</Card>
          )}
        </section>

        <aside className="space-y-4">
          {milestoneBanner && (
            <Banner tone="success" action={<Button variant="ghost" size="sm" onClick={() => setMilestoneBanner('')}>{t('home.collapse')}</Button>}>
              {milestoneBanner}
            </Banner>
          )}

          {dueNotesCount > 0 && (
            <Banner tone="info" action={<Button variant="secondary" size="sm" onClick={() => navigate(firstDueHero ? `/hero-notes?hero=${encodeURIComponent(firstDueHero)}&filter=due` : '/hero-notes?filter=due')}>{t('home.goReview')}</Button>}>
              {t('home.dueReviewBanner', { count: dueNotesCount })}
            </Banner>
          )}

          {showLossBanner && (
            <Banner
              tone="warning"
              action={<Button variant="ghost" size="sm" onClick={() => setDismissedBanner(true)}>{t('home.gotIt')}</Button>}
            >
              {t('home.lossBanner', { count: recentLosses })}
            </Banner>
          )}

          {appState?.pendingPreGameSetupId && (
            <Banner tone="info" action={<Button variant="secondary" size="sm" onClick={() => navigate('/post-game')}>{t('home.goRecord')}</Button>}>
              {t('home.pendingSetupBanner')}
            </Banner>
          )}

          <Card className="p-4 md:p-5">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold text-[var(--text-primary)]">{t('home.recentMatches')}</h2>
                <p className="mt-1 text-sm text-[var(--text-muted)]">{t('home.recentMatchesDesc')}</p>
              </div>
              <Button variant="ghost" size="sm" onClick={() => navigate('/history')}>{t('home.all')}</Button>
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
                      <Badge tone={log.result === 'win' ? 'success' : 'danger'}>{log.result === 'win' ? t('home.win') : t('home.loss')}</Badge>
                      <span className="min-w-0 flex-1 truncate text-sm font-semibold text-[var(--text-primary)]">{getDisplayHeroName(log.hero, language)}</span>
                      <span className="number text-xs text-[var(--text-muted)]">{log.durationMin}m</span>
                      <span className="number text-xs text-[var(--text-muted)]">{formatDate(log.timestamp)}</span>
                    </div>
                    {(log.biggestMistake || log.nextGameFocus) && (
                      <div className="mt-2 space-y-1 text-xs leading-5 text-[var(--text-secondary)]">
                        {log.biggestMistake && <div className="line-clamp-1">{t('home.mistakeLabel', { text: log.biggestMistake })}</div>}
                        {log.nextGameFocus && <div className="line-clamp-1 text-[var(--accent-strong)]">{t('home.nextFocusLabel', { text: log.nextGameFocus })}</div>}
                      </div>
                    )}
                  </button>
                ))}
              </div>
            ) : (
              <div className="rounded-[var(--radius-md)] border border-dashed border-[var(--border)] bg-[var(--surface-2)] p-4 text-sm leading-6 text-[var(--text-muted)]">
                {t('home.noMatches')}
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
