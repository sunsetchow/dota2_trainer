import React, { useState, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { nanoid } from 'nanoid'
import { useAppState, useCycles } from '../store/useStore.ts'
import HeroSelector from '../components/HeroSelector.tsx'
import QuickSelect from '../components/QuickSelect.tsx'
import checklistData from '../data/checklist.json'
import type { PreGameSetup, ChecklistItem } from '../types'
import { getCurrentWeek } from '../utils/cycle.ts'

const ALL_CHECKLIST: ChecklistItem[] = checklistData as ChecklistItem[]

export default function PreGame() {
  const navigate = useNavigate()
  const location = useLocation()
  const { appState, update: updateAppState } = useAppState()
  const { cycles } = useCycles()

  // ✅ location.state 空值保护
  const heroFromDraft: string = (location.state as { hero?: string; enemySupports?: string[] } | null)?.hero ?? ''
  const supportsFromDraft: string[] = (location.state as { hero?: string; enemySupports?: string[] } | null)?.enemySupports ?? []

  const [hero, setHero] = useState(heroFromDraft)
  const [trainingGoal, setTrainingGoal] = useState('')
  const [enemySupport1, setEnemySupport1] = useState(supportsFromDraft[0] ?? '')
  const [enemySupport2, setEnemySupport2] = useState(supportsFromDraft[1] ?? '')
  const [saving, setSaving] = useState(false)

  // 当前活跃周期的周主题快速选项
  const activeCycle = cycles.find(c => c.cycleId === appState?.activeCycleId)
  const currentWeek = activeCycle ? getCurrentWeek(activeCycle) : 0
  const weekTheme = activeCycle?.weekThemes.find(w => w.week === currentWeek)
  const quickGoalOptions = (weekTheme?.checklistItemIds ?? [])
    .map(id => ALL_CHECKLIST.find(c => c.id === id)?.label)
    .filter((l): l is string => Boolean(l))

  // 英雄池（激活的英雄）
  const heroPool = appState?.heroPool.filter(h => h.active).map(h => h.name) ?? []

  const canSave = hero.trim() && trainingGoal.trim()

  const handleSave = async () => {
    if (!canSave || saving) return
    setSaving(true)
    try {
      const currentAppState = await window.electronStore.getAppState()
      // 若已有 pending，提示用户
      if (currentAppState.pendingPreGameSetupId) {
        const ok = window.confirm('上一条赛前设定还未关联对局，是否放弃？')
        if (!ok) { setSaving(false); return }
      }

      const setup: PreGameSetup = {
        id: nanoid(),
        timestamp: Date.now(),
        hero: hero.trim(),
        trainingGoal: trainingGoal.trim(),
        enemySupports: [enemySupport1, enemySupport2].filter(s => s.trim()),
        cycleId: currentAppState.activeCycleId,
      }
      await window.electronStore.addPreGameSetup(setup)
      await window.electronStore.setAppState({ pendingPreGameSetupId: setup.id })
      navigate('/')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="p-6 space-y-6 max-w-lg mx-auto">
      <div>
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="text-xs text-[var(--text-muted)] hover:text-[var(--text-secondary)] mb-3 flex items-center gap-1"
        >
          ← 返回
        </button>
        <h1 className="text-xl font-bold text-[var(--text-primary)]">赛前设定</h1>
        {weekTheme && (
          <p className="text-sm text-[var(--text-muted)]">当前周主题：{weekTheme.theme}</p>
        )}
      </div>

      {/* 英雄选择 */}
      <HeroSelector
        label="本局英雄"
        value={hero}
        onChange={setHero}
        heroPool={heroPool.length > 0 ? heroPool : undefined}
        placeholder="从英雄池中选择…"
      />

      {/* 训练目标 */}
      <QuickSelect
        label="本局训练目标"
        options={quickGoalOptions.slice(0, 5)}
        value={trainingGoal}
        onChange={setTrainingGoal}
        placeholder="自定义目标…"
      />

      {/* 对方辅助 */}
      <div className="space-y-2">
        <label className="block text-xs font-medium text-[var(--text-muted)] uppercase tracking-wider">对方辅助（可选）</label>
        <div className="grid grid-cols-2 gap-2">
          <input
            type="text"
            value={enemySupport1}
            onChange={e => setEnemySupport1(e.target.value)}
            placeholder="辅助 1"
            className="px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--surface-1)] text-[var(--text-primary)] text-sm focus:outline-none focus:border-blue-500"
          />
          <input
            type="text"
            value={enemySupport2}
            onChange={e => setEnemySupport2(e.target.value)}
            placeholder="辅助 2"
            className="px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--surface-1)] text-[var(--text-primary)] text-sm focus:outline-none focus:border-blue-500"
          />
        </div>
      </div>

      {/* 保存 */}
      <button
        type="button"
        onClick={handleSave}
        disabled={!canSave || saving}
        className="w-full py-3 rounded-xl font-semibold text-sm bg-blue-600 text-white hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
      >
        {saving ? '保存中…' : '开始游戏'}
      </button>
    </div>
  )
}
