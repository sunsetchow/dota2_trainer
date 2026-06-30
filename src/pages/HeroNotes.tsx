import React, { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import HeroSelector from '../components/HeroSelector.tsx'
import { useAppState, useHeroNotes } from '../store/useStore.ts'
import type { HeroNote } from '../types'

const emptyNote = (hero: string): HeroNote => ({
  hero,
  position: '3',
  strongPeriod: '',
  weakPeriod: '',
  laneGoal: '',
  firstKeyItem: '',
  counters: '',
  counteredBy: '',
  whenToFight: '',
  whenToFarm: '',
  commonDeaths: '',
  reviewRules: [],
  updatedAt: Date.now(),
})

function parseRules(value: string): string[] {
  return value
    .split('\n')
    .map(item => item.trim())
    .filter(Boolean)
}

export default function HeroNotes() {
  const navigate = useNavigate()
  const { appState } = useAppState()
  const { heroNotes, upsert } = useHeroNotes()
  const heroPool = appState?.heroPool.filter(h => h.active).map(h => h.name) ?? []
  const [selectedHero, setSelectedHero] = useState('')
  const [form, setForm] = useState<HeroNote>(() => emptyNote(''))
  const [reviewRulesText, setReviewRulesText] = useState('')
  const [status, setStatus] = useState('')

  const selectedNote = useMemo(
    () => heroNotes.find(note => note.hero === selectedHero.trim()),
    [heroNotes, selectedHero]
  )

  useEffect(() => {
    const hero = selectedHero.trim()
    const note = selectedNote ?? emptyNote(hero)
    setForm(note)
    setReviewRulesText(note.reviewRules.join('\n'))
  }, [selectedHero, selectedNote])

  const updateField = (field: keyof HeroNote, value: string) => {
    setForm(prev => ({ ...prev, [field]: value }))
  }

  const handleSave = async () => {
    const hero = selectedHero.trim()
    if (!hero) {
      setStatus('请先选择英雄。')
      return
    }

    await upsert({
      ...form,
      hero,
      reviewRules: parseRules(reviewRulesText),
      updatedAt: Date.now(),
    })
    setStatus('英雄档案已保存。')
    setTimeout(() => setStatus(''), 2500)
  }

  const inputCls = 'w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--surface-1)] text-[var(--text-primary)] text-sm focus:outline-none focus:border-[var(--accent-border)]'
  const textareaCls = `${inputCls} min-h-20 resize-y`

  return (
    <div className="p-6 space-y-6 max-w-2xl mx-auto">
      <div>
        <button type="button" onClick={() => navigate('/')} className="text-xs text-[var(--text-muted)] hover:text-[var(--text-secondary)] mb-3">
          ← 返回
        </button>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-[var(--text-primary)]">英雄档案</h1>
            <p className="text-sm text-[var(--text-muted)]">{heroNotes.length} 个英雄</p>
          </div>
          <button
            type="button"
            onClick={handleSave}
            disabled={!selectedHero.trim()}
            className="px-4 py-2 rounded-lg bg-[var(--accent)] text-[var(--text-primary)] text-sm font-semibold hover:bg-[var(--accent-strong)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            保存
          </button>
        </div>
      </div>

      {status && (
        <div className="px-4 py-3 rounded-lg border border-[var(--border-info)] bg-[var(--bg-info)] text-[var(--text-info)] text-sm">
          {status}
        </div>
      )}

      <HeroSelector
        label="英雄"
        value={selectedHero}
        onChange={setSelectedHero}
        heroPool={heroPool.length > 0 ? heroPool : undefined}
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <label className="space-y-1">
          <span className="block text-xs text-[var(--text-muted)]">位置</span>
          <input value={form.position} onChange={e => updateField('position', e.target.value)} className={inputCls} />
        </label>
        <label className="space-y-1">
          <span className="block text-xs text-[var(--text-muted)]">第一件关键装</span>
          <input value={form.firstKeyItem} onChange={e => updateField('firstKeyItem', e.target.value)} className={inputCls} />
        </label>
        <label className="space-y-1">
          <span className="block text-xs text-[var(--text-muted)]">强势期</span>
          <input value={form.strongPeriod} onChange={e => updateField('strongPeriod', e.target.value)} className={inputCls} />
        </label>
        <label className="space-y-1">
          <span className="block text-xs text-[var(--text-muted)]">弱势期</span>
          <input value={form.weakPeriod} onChange={e => updateField('weakPeriod', e.target.value)} className={inputCls} />
        </label>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <label className="space-y-1">
          <span className="block text-xs text-[var(--text-muted)]">对线目标</span>
          <textarea value={form.laneGoal} onChange={e => updateField('laneGoal', e.target.value)} className={textareaCls} />
        </label>
        <label className="space-y-1">
          <span className="block text-xs text-[var(--text-muted)]">常见死亡</span>
          <textarea value={form.commonDeaths} onChange={e => updateField('commonDeaths', e.target.value)} className={textareaCls} />
        </label>
        <label className="space-y-1">
          <span className="block text-xs text-[var(--text-muted)]">何时打架</span>
          <textarea value={form.whenToFight} onChange={e => updateField('whenToFight', e.target.value)} className={textareaCls} />
        </label>
        <label className="space-y-1">
          <span className="block text-xs text-[var(--text-muted)]">何时刷钱</span>
          <textarea value={form.whenToFarm} onChange={e => updateField('whenToFarm', e.target.value)} className={textareaCls} />
        </label>
        <label className="space-y-1">
          <span className="block text-xs text-[var(--text-muted)]">克制</span>
          <textarea value={form.counters} onChange={e => updateField('counters', e.target.value)} className={textareaCls} />
        </label>
        <label className="space-y-1">
          <span className="block text-xs text-[var(--text-muted)]">被克制</span>
          <textarea value={form.counteredBy} onChange={e => updateField('counteredBy', e.target.value)} className={textareaCls} />
        </label>
      </div>

      <label className="space-y-1 block">
        <span className="block text-xs text-[var(--text-muted)]">复盘规则</span>
        <textarea
          value={reviewRulesText}
          onChange={e => setReviewRulesText(e.target.value)}
          className={`${textareaCls} min-h-28`}
        />
      </label>
    </div>
  )
}
