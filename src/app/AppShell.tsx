import React from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import packageJson from '../../package.json'
import { useAppState, useCycles, useDailyCheckins, usePreGameSetups } from '../store/useStore.ts'
import { calcStreak, getCurrentWeek } from '../utils/cycle.ts'
import { getDisplayHeroName } from '../utils/heroIdentity.ts'
import { useLanguage, useT } from '../i18n/index.ts'
import Badge from '../components/ui/Badge.tsx'
import Button from '../components/ui/Button.tsx'

interface AppShellProps {
  children: React.ReactNode
}

const mainNav = [
  { to: '/', labelKey: 'nav.home', end: true },
  { to: '/draft', labelKey: 'nav.draft' },
  { to: '/pre-game', labelKey: 'nav.preGame' },
  { to: '/post-game', labelKey: 'nav.postGame' },
  { to: '/plan', labelKey: 'nav.plan' },
  { to: '/history', labelKey: 'nav.history' },
  { to: '/progress', labelKey: 'nav.progress' },
  { to: '/hero-notes', labelKey: 'nav.heroNotes' },
]

const mobileNav = [
  ...mainNav,
  { to: '/settings', labelKey: 'nav.settings' },
]

function navClass({ isActive }: { isActive: boolean }) {
  return [
    'group flex items-center justify-between rounded-[var(--radius-md)] border px-3 py-2 text-sm font-medium transition-all duration-200',
    isActive
      ? 'border-[var(--accent-border)] bg-[var(--accent-muted)] text-[var(--accent-strong)]'
      : 'border-transparent text-[var(--text-muted)] hover:border-[var(--border)] hover:bg-[var(--surface-2)] hover:text-[var(--text-primary)]',
  ].join(' ')
}

export default function AppShell({ children }: AppShellProps) {
  const navigate = useNavigate()
  const { appState } = useAppState()
  const { cycles } = useCycles()
  const { checkins } = useDailyCheckins()
  const { setups } = usePreGameSetups()
  const t = useT()
  const language = useLanguage()

  const activeCycle = cycles.find(c => c.cycleId === appState?.activeCycleId)
  const currentWeek = activeCycle ? getCurrentWeek(activeCycle) : undefined
  const weekTheme = activeCycle?.weekThemes.find(w => w.week === currentWeek)
  const streak = calcStreak(checkins, appState?.freezeUsedDates ?? [])
  const pendingSetup = setups.find(s => s.id === appState?.pendingPreGameSetupId)

  return (
    <div className="flex h-[100dvh] overflow-hidden bg-[var(--bg)] text-[var(--text-primary)]">
      <aside className="hidden w-[188px] shrink-0 border-r border-[var(--border)] bg-[rgba(18,15,13,0.94)] px-3 py-4 backdrop-blur md:flex md:flex-col">
        <div className="mb-6 px-2">
          <div className="text-sm font-bold tracking-tight text-[var(--text-primary)]">Dota2 Trainer <span className="number text-[10px] font-medium text-[var(--text-muted)]">v{packageJson.version}</span></div>
          <div className="mt-1 text-xs leading-relaxed text-[var(--text-muted)]">{t('appShell.subtitle')}</div>
        </div>

        <nav className="flex flex-1 flex-col gap-1" aria-label={t('appShell.mainNavLabel')}>
          {mainNav.map(item => (
            <NavLink key={item.to} to={item.to} end={item.end} className={navClass}>
              <span>{t(item.labelKey)}</span>
            </NavLink>
          ))}
        </nav>

        <NavLink to="/settings" className={({ isActive }) => `${navClass({ isActive })} mt-3`}>
          <span>{t('nav.settings')}</span>
        </NavLink>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex min-h-[64px] shrink-0 items-center justify-between gap-4 border-b border-[var(--border)] bg-[rgba(27,23,20,0.88)] px-4 backdrop-blur md:px-6">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="accent">{currentWeek === undefined ? t('appShell.weekLoading') : t('appShell.weekLabel', { week: currentWeek })}</Badge>
              {weekTheme && <span className="truncate text-sm font-medium text-[var(--text-primary)]">{weekTheme.theme}</span>}
              {!weekTheme && <span className="text-sm text-[var(--text-muted)]">{t('appShell.cycleUninitialized')}</span>}
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-[var(--text-muted)]">
              <span className="number">{t('appShell.streak', { days: streak })}</span>
              {pendingSetup && <span>{t('appShell.pendingRecord', { hero: getDisplayHeroName(pendingSetup.hero, language) })}</span>}
              <span>{t('appShell.localFirst')}</span>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            {pendingSetup ? (
              <Button variant="primary" size="sm" onClick={() => navigate('/post-game')}>{t('appShell.recordPostGame')}</Button>
            ) : (
              <Button variant="primary" size="sm" onClick={() => navigate('/draft')}>{t('appShell.enterDraft')}</Button>
            )}
            <Button variant="secondary" size="sm" onClick={() => navigate('/draft')}>{t('appShell.startNewGame')}</Button>
            <Button variant="ghost" size="sm" onClick={() => navigate('/settings')}>{t('nav.settings')}</Button>
          </div>
        </header>

        <div className="border-b border-[var(--border)] bg-[var(--surface-1)] px-3 py-2 md:hidden">
          <nav className="flex gap-1 overflow-x-auto" aria-label={t('appShell.mobileNavLabel')}>
            {mobileNav.map(item => (
              <NavLink key={item.to} to={item.to} end={item.end} className={({ isActive }) => `whitespace-nowrap rounded-[var(--radius-sm)] px-3 py-1.5 text-xs font-medium ${isActive ? 'bg-[var(--accent-muted)] text-[var(--accent-strong)]' : 'text-[var(--text-muted)]'}`}>
                {t(item.labelKey)}
              </NavLink>
            ))}
          </nav>
        </div>

        <main className="min-h-0 flex-1 overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  )
}
