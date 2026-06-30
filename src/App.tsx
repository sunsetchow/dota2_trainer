import React from 'react'
import { HashRouter, Routes, Route, NavLink } from 'react-router-dom'
import Home from './pages/Home.tsx'
import DraftAssistant from './pages/DraftAssistant.tsx'
import PreGame from './pages/PreGame.tsx'
import PostGame from './pages/PostGame.tsx'
import TrainingPlan from './pages/TrainingPlan.tsx'
import History from './pages/History.tsx'
import MatchDetail from './pages/MatchDetail.tsx'
import HeroNotes from './pages/HeroNotes.tsx'
import Settings from './pages/Settings.tsx'

export default function App() {
  return (
    <HashRouter>
      <div className="min-h-screen bg-[var(--bg)] flex flex-col">
        {/* 顶部导航 */}
        <nav className="flex items-center gap-1 px-4 py-2 border-b border-[var(--border)] bg-[var(--surface-1)] flex-shrink-0">
          <NavLink
            to="/"
            end
            className={({ isActive }) =>
              `px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                isActive
                  ? 'bg-blue-600/20 text-blue-300'
                  : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
              }`
            }
          >
            首页
          </NavLink>
          <NavLink
            to="/draft"
            className={({ isActive }) =>
              `px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                isActive
                  ? 'bg-blue-600/20 text-blue-300'
                  : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
              }`
            }
          >
            Draft 助手
          </NavLink>
          <NavLink
            to="/plan"
            className={({ isActive }) =>
              `px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                isActive
                  ? 'bg-blue-600/20 text-blue-300'
                  : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
              }`
            }
          >
            训练计划
          </NavLink>
          <NavLink
            to="/history"
            className={({ isActive }) =>
              `px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                isActive
                  ? 'bg-blue-600/20 text-blue-300'
                  : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
              }`
            }
          >
            历史
          </NavLink>
          <NavLink
            to="/hero-notes"
            className={({ isActive }) =>
              `px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                isActive
                  ? 'bg-blue-600/20 text-blue-300'
                  : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
              }`
            }
          >
            英雄档案
          </NavLink>
          <NavLink
            to="/settings"
            className={({ isActive }) =>
              `px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                isActive
                  ? 'bg-blue-600/20 text-blue-300'
                  : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
              }`
            }
          >
            设置
          </NavLink>
        </nav>

        {/* 页面内容 */}
        <main className="flex-1 overflow-y-auto">
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/draft" element={<DraftAssistant />} />
            <Route path="/pre-game" element={<PreGame />} />
            <Route path="/post-game" element={<PostGame />} />
            <Route path="/plan" element={<TrainingPlan />} />
            <Route path="/history" element={<History />} />
            <Route path="/history/:id" element={<MatchDetail />} />
            <Route path="/hero-notes" element={<HeroNotes />} />
            <Route path="/settings" element={<Settings />} />
          </Routes>
        </main>
      </div>
    </HashRouter>
  )
}
