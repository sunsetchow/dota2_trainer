import React from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { useAppState, useCycles, useDailyCheckins, usePreGameSetups } from '../store/useStore.ts'
import { calcStreak, getCurrentWeek } from '../utils/cycle.ts'
import Badge from '../components/ui/Badge.tsx'
import Button from '../components/ui/Button.tsx'

interface AppShellProps {
  children: React.ReactNode
}

const mainNav = [
  { to: '/', label: '首页', end: true },
  { to: '/draft', label: 'Draft' },
  { to: '/pre-game', label: '赛前' },
  { to: '/post-game', label: '赛后' },
  { to: '/plan', label: '计划' },
  { to: '/history', label: '历史' },
  { to: '/progress', label: '进步' },
  { to: '/hero-notes', label: '英雄' },
]

const mobileNav = [
  ...mainNav,
  { to: '/settings', label: '设置' },
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

  const activeCycle = cycles.find(c => c.cycleId === appState?.activeCycleId)
  const currentWeek = activeCycle ? getCurrentWeek(activeCycle) : undefined
  const weekTheme = activeCycle?.weekThemes.find(w => w.week === currentWeek)
  const streak = calcStreak(checkins)
  const pendingSetup = setups.find(s => s.id === appState?.pendingPreGameSetupId)

  return (
    <div className="flex min-h-[100dvh] overflow-hidden bg-[var(--bg)] text-[var(--text-primary)]">
      <aside className="hidden w-[188px] shrink-0 border-r border-[var(--border)] bg-[rgba(18,15,13,0.94)] px-3 py-4 backdrop-blur md:flex md:flex-col">
        <div className="mb-6 px-2">
          <div className="text-sm font-bold tracking-tight text-[var(--text-primary)]">Dota2 Trainer</div>
          <div className="mt-1 text-xs leading-relaxed text-[var(--text-muted)]">战术训练控制台</div>
        </div>

        <nav className="flex flex-1 flex-col gap-1" aria-label="主导航">
          {mainNav.map(item => (
            <NavLink key={item.to} to={item.to} end={item.end} className={navClass}>
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>

        <NavLink to="/settings" className={({ isActive }) => `${navClass({ isActive })} mt-3`}>
          <span>设置</span>
        </NavLink>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex min-h-[64px] shrink-0 items-center justify-between gap-4 border-b border-[var(--border)] bg-[rgba(27,23,20,0.88)] px-4 backdrop-blur md:px-6">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="accent">{currentWeek === undefined ? '周期加载中' : `第 ${currentWeek} 周`}</Badge>
              {weekTheme && <span className="truncate text-sm font-medium text-[var(--text-primary)]">{weekTheme.theme}</span>}
              {!weekTheme && <span className="text-sm text-[var(--text-muted)]">训练周期待初始化</span>}
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-[var(--text-muted)]">
              <span className="number">连训 {streak} 天</span>
              {pendingSetup && <span>待记录：{pendingSetup.hero}</span>}
              <span>本地优先</span>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            {pendingSetup ? (
              <Button variant="primary" size="sm" onClick={() => navigate('/post-game')}>记录赛后</Button>
            ) : (
              <Button variant="primary" size="sm" onClick={() => navigate('/draft')}>进入 Draft</Button>
            )}
            <Button variant="secondary" size="sm" onClick={() => navigate('/pre-game')}>开始新局</Button>
            <Button variant="ghost" size="sm" onClick={() => navigate('/settings')}>设置</Button>
          </div>
        </header>

        <div className="border-b border-[var(--border)] bg-[var(--surface-1)] px-3 py-2 md:hidden">
          <nav className="flex gap-1 overflow-x-auto" aria-label="移动导航">
            {mobileNav.map(item => (
              <NavLink key={item.to} to={item.to} end={item.end} className={({ isActive }) => `whitespace-nowrap rounded-[var(--radius-sm)] px-3 py-1.5 text-xs font-medium ${isActive ? 'bg-[var(--accent-muted)] text-[var(--accent-strong)]' : 'text-[var(--text-muted)]'}`}>
                {item.label}
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
