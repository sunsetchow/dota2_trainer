import React from 'react'
import { HashRouter, Routes, Route } from 'react-router-dom'
import AppShell from './app/AppShell.tsx'
import { LanguageProvider } from './i18n/index.ts'
import Home from './pages/Home.tsx'
import DraftAssistant from './pages/DraftAssistant.tsx'
import PreGame from './pages/PreGame.tsx'
import PostGame from './pages/PostGame.tsx'
import TrainingPlan from './pages/TrainingPlan.tsx'
import History from './pages/History.tsx'
import MatchDetail from './pages/MatchDetail.tsx'
import Progress from './pages/Progress.tsx'
import HeroNotes from './pages/HeroNotes.tsx'
import Settings from './pages/Settings.tsx'

export default function App() {
  return (
    <HashRouter>
      <LanguageProvider>
        <AppShell>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/draft" element={<DraftAssistant />} />
            <Route path="/pre-game" element={<PreGame />} />
            <Route path="/post-game" element={<PostGame />} />
            <Route path="/plan" element={<TrainingPlan />} />
            <Route path="/history" element={<History />} />
            <Route path="/history/:id" element={<MatchDetail />} />
            <Route path="/progress" element={<Progress />} />
            <Route path="/hero-notes" element={<HeroNotes />} />
            <Route path="/settings" element={<Settings />} />
          </Routes>
        </AppShell>
      </LanguageProvider>
    </HashRouter>
  )
}
