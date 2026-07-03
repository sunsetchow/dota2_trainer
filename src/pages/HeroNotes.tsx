import React, { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import HeroCard from '../components/HeroCard.tsx'
import Button from '../components/ui/Button.tsx'
import Badge from '../components/ui/Badge.tsx'
import Card from '../components/ui/Card.tsx'
import HeroNoteReviewCard from '../features/heroNotes/HeroNoteReviewCard.tsx'
import { useAppState, useHeroNotes } from '../store/useStore.ts'
import { getPool, getSugg, resolve } from '../utils/heroes.ts'
import { getHeroIdByName, sameHeroReference } from '../utils/heroIdentity.ts'
import { todayStr } from '../utils/cycle.ts'
import { applySrsRating, isDueForReview, type SrsRating } from '../utils/srs.ts'
import {
  getConfiguredHeroPositions,
  getDefaultHeroPositions,
  HERO_POSITIONS,
  HERO_POSITION_LABELS,
  tierLabel,
  tierRank,
} from '../utils/heroPool.ts'
import type { DotaPosition, HeroConfig, HeroNote } from '../types'

const ALL_HEROES = getPool()

type PoolFilter = 'all' | 'active' | 'main' | 'practice' | 'backup' | 'inactive' | 'due'

const emptyNote = (hero: string): HeroNote => ({
  hero,
  ...(getHeroIdByName(hero) !== undefined && { heroId: getHeroIdByName(hero) }),
  position: '',
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
  matchupNotes: {},
  updatedAt: Date.now(),
})

function parseRules(value: string): string[] {
  return value
    .split('\n')
    .map(item => item.trim())
    .filter(Boolean)
}

function hasNoteContent(note?: HeroNote): boolean {
  if (!note) return false
  return Boolean([
    note.position,
    note.strongPeriod,
    note.weakPeriod,
    note.laneGoal,
    note.firstKeyItem,
    note.counters,
    note.counteredBy,
    note.whenToFight,
    note.whenToFarm,
    note.commonDeaths,
    ...(note.reviewRules ?? []),
    ...Object.values(note.matchupNotes ?? {}).map(item => item.note),
  ].some(value => String(value ?? '').trim()))
}

export default function HeroNotes() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { appState, update: updateAppState } = useAppState()
  const { heroNotes, upsert } = useHeroNotes()
  const heroPool = appState?.heroPool ?? []
  const [selectedHero, setSelectedHero] = useState('')
  const [search, setSearch] = useState('')
  const [positionFilter, setPositionFilter] = useState<DotaPosition | 'all'>('all')
  const [poolFilter, setPoolFilter] = useState<PoolFilter>('all')
  const [form, setForm] = useState<HeroNote>(() => emptyNote(''))
  const [reviewRulesText, setReviewRulesText] = useState('')
  const [status, setStatus] = useState('')

  const today = todayStr()
  const requestedHero = searchParams.get('hero')
  const requestedFilter = searchParams.get('filter')
  const configByHero = useMemo(() => new Map(heroPool.map(config => [config.name, config])), [heroPool])
  const noteByHero = useMemo(() => new Map(heroNotes.map(note => [note.hero, note])), [heroNotes])

  useEffect(() => {
    if (requestedFilter === 'due') setPoolFilter('due')
  }, [requestedFilter])

  useEffect(() => {
    const targetHero = requestedHero ? resolve(requestedHero) : null
    if (targetHero && ALL_HEROES.includes(targetHero)) {
      setSelectedHero(targetHero)
    }
  }, [requestedHero])

  useEffect(() => {
    if (!selectedHero) {
      const firstActive = heroPool.find(config => config.active)?.name
      setSelectedHero(firstActive ?? ALL_HEROES[0] ?? '')
    }
  }, [heroPool, selectedHero])

  const selectedConfig = selectedHero ? configByHero.get(selectedHero) : undefined
  const selectedPositions = selectedHero ? getConfiguredHeroPositions(selectedHero, selectedConfig) : []
  const selectedNote = selectedHero ? noteByHero.get(selectedHero) ?? heroNotes.find(note => sameHeroReference(note, { hero: selectedHero })) : undefined

  useEffect(() => {
    const hero = selectedHero.trim()
    const note = selectedNote ?? emptyNote(hero)
    setForm(note)
    setReviewRulesText(note.reviewRules.join('\n'))
  }, [selectedHero, selectedNote])

  const activeCount = heroPool.filter(config => config.active).length
  const mainCount = heroPool.filter(config => config.active && config.tier === 'main').length
  const practiceCount = heroPool.filter(config => config.active && (config.tier === 'practice' || !config.tier)).length
  const backupCount = heroPool.filter(config => config.active && config.tier === 'backup').length
  const dueNotes = useMemo(
    () => heroNotes
      .filter(note => isDueForReview(note, today))
      .sort((a, b) => (a.srsNextReviewDate ?? '').localeCompare(b.srsNextReviewDate ?? '') || a.hero.localeCompare(b.hero, 'zh-CN')),
    [heroNotes, today],
  )
  const dueCount = dueNotes.length

  const filteredHeroes = useMemo(() => {
    const searchCandidates = search.trim() ? getSugg(search, 200) : ALL_HEROES
    const searchSet = new Set(searchCandidates)
    return ALL_HEROES
      .filter(hero => searchSet.has(hero))
      .filter(hero => {
        const config = configByHero.get(hero)
        const active = Boolean(config?.active)
        const note = noteByHero.get(hero)
        const positions = getConfiguredHeroPositions(hero, config)
        if (positionFilter !== 'all' && !positions.includes(positionFilter)) return false
        if (poolFilter === 'active') return active
        if (poolFilter === 'inactive') return !active
        if (poolFilter === 'main') return active && config?.tier === 'main'
        if (poolFilter === 'practice') return active && (config?.tier === 'practice' || !config?.tier)
        if (poolFilter === 'backup') return active && config?.tier === 'backup'
        if (poolFilter === 'due') return Boolean(note && isDueForReview(note, today))
        return true
      })
      .sort((a, b) => {
        const ac = configByHero.get(a)
        const bc = configByHero.get(b)
        const activeDelta = Number(Boolean(bc?.active)) - Number(Boolean(ac?.active))
        if (activeDelta) return activeDelta
        const tierDelta = tierRank(ac?.tier) - tierRank(bc?.tier)
        if (tierDelta) return tierDelta
        const dueDelta = Number(Boolean(noteByHero.get(b) && isDueForReview(noteByHero.get(b)!, today))) - Number(Boolean(noteByHero.get(a) && isDueForReview(noteByHero.get(a)!, today)))
        if (dueDelta) return dueDelta
        return a.localeCompare(b, 'zh-CN')
      })
  }, [configByHero, noteByHero, poolFilter, positionFilter, search, today])

  const saveHeroConfig = async (hero: string, patch: Partial<HeroConfig>) => {
    if (!appState || !hero) return
    const existing = heroPool.find(config => config.name === hero)
    const nextConfig: HeroConfig = {
      name: hero,
      ...(getHeroIdByName(hero) !== undefined && { heroId: getHeroIdByName(hero) }),
      active: patch.active ?? existing?.active ?? true,
      tier: patch.tier ?? existing?.tier ?? 'practice',
      positions: patch.positions ?? existing?.positions ?? getDefaultHeroPositions(hero),
    }
    const nextPool = existing
      ? heroPool.map(config => config.name === hero ? nextConfig : config)
      : [...heroPool, nextConfig]
    await updateAppState({ heroPool: nextPool })
    setStatus('英雄配置已更新。')
    setTimeout(() => setStatus(''), 1800)
  }

  const togglePosition = async (position: DotaPosition) => {
    if (!selectedHero) return
    const current = selectedPositions
    const next = current.includes(position)
      ? current.filter(item => item !== position)
      : [...current, position].sort()
    await saveHeroConfig(selectedHero, { positions: next })
  }

  const updateField = (field: keyof HeroNote, value: string) => {
    setForm(prev => ({ ...prev, [field]: value }))
  }

  const handleSaveNote = async () => {
    const hero = selectedHero.trim()
    if (!hero) {
      setStatus('请先选择英雄。')
      return
    }

    await upsert({
      ...form,
      hero,
      ...(getHeroIdByName(hero) !== undefined && { heroId: getHeroIdByName(hero) }),
      reviewRules: parseRules(reviewRulesText),
      matchupNotes: form.matchupNotes,
      srsEase: form.srsEase,
      srsIntervalDays: form.srsIntervalDays,
      srsNextReviewDate: form.srsNextReviewDate,
      srsLastRating: form.srsLastRating,
      updatedAt: Date.now(),
    })
    setStatus('英雄档案已保存。')
    setTimeout(() => setStatus(''), 2500)
  }

  const handleRateSelectedNote = async (rating: SrsRating) => {
    if (!selectedNote) return
    const result = applySrsRating({ ease: selectedNote.srsEase, intervalDays: selectedNote.srsIntervalDays }, rating, today)
    await upsert({
      ...selectedNote,
      srsEase: result.ease,
      srsIntervalDays: result.intervalDays,
      srsNextReviewDate: result.nextReviewDate,
      srsLastRating: rating,
      updatedAt: Date.now(),
    })

    const nextDue = dueNotes.find(note => note.hero !== selectedNote.hero)
    if (nextDue) {
      setSelectedHero(nextDue.hero)
      setPoolFilter('due')
      setStatus(`${selectedNote.hero} 已安排到 ${result.nextReviewDate}，已切到下一条待复习。`)
    } else {
      setStatus(`${selectedNote.hero} 已安排到 ${result.nextReviewDate}。今天的英雄笔记复习完成。`)
    }
    setTimeout(() => setStatus(''), 3000)
  }

  const inputCls = 'w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--surface-1)] text-[var(--text-primary)] text-sm focus:outline-none focus:border-[var(--accent-border)]'
  const textareaCls = `${inputCls} min-h-20 resize-y`
  const active = Boolean(selectedConfig?.active)
  const tier = selectedConfig?.tier ?? 'practice'
  const draftImpact = selectedPositions.length
    ? selectedPositions.map(position => `${HERO_POSITION_LABELS[position]}推荐池`).join('、')
    : '暂不进入任何位置推荐池'

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6">
      <div>
        <button type="button" onClick={() => navigate('/')} className="mb-3 text-xs text-[var(--text-muted)] hover:text-[var(--text-secondary)]">
          ← 返回
        </button>
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-[var(--text-primary)]">英雄中心</h1>
            <p className="mt-1 text-sm text-[var(--text-muted)]">统一管理个人英雄池、位置池、熟练度、英雄档案和待复习状态。</p>
          </div>
          <Button type="button" onClick={handleSaveNote} disabled={!selectedHero.trim()}>
            保存英雄档案
          </Button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Card className="p-3"><div className="number text-lg font-semibold text-[var(--text-primary)]">{activeCount}</div><div className="text-xs text-[var(--text-muted)]">已启用</div></Card>
        <Card className="p-3"><div className="number text-lg font-semibold text-[var(--text-primary)]">{mainCount}</div><div className="text-xs text-[var(--text-muted)]">主力</div></Card>
        <Card className="p-3"><div className="number text-lg font-semibold text-[var(--text-primary)]">{practiceCount}</div><div className="text-xs text-[var(--text-muted)]">练习</div></Card>
        <Card className="p-3"><div className="number text-lg font-semibold text-[var(--text-primary)]">{backupCount}</div><div className="text-xs text-[var(--text-muted)]">备用</div></Card>
        <Card className="p-3"><div className="number text-lg font-semibold text-[var(--text-primary)]">{dueCount}</div><div className="text-xs text-[var(--text-muted)]">待复习</div></Card>
      </div>

      {status && (
        <div className="rounded-lg border border-[var(--border-info)] bg-[var(--bg-info)] px-4 py-3 text-sm text-[var(--text-info)]">
          {status}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
        <Card className="space-y-4 p-4">
          <div className="space-y-2">
            <label className="block text-xs font-medium uppercase tracking-wider text-[var(--text-muted)]">搜索英雄</label>
            <input value={search} onChange={event => setSearch(event.target.value)} placeholder="搜索中文名、英文名或别名" className={inputCls} />
          </div>

          <div className="space-y-2">
            <div className="text-xs font-medium uppercase tracking-wider text-[var(--text-muted)]">英雄池筛选</div>
            <div className="flex flex-wrap gap-2">
              {([
                ['all', '全部'],
                ['active', '我的英雄池'],
                ['main', '主力'],
                ['practice', '练习'],
                ['backup', '备用'],
                ['inactive', '未启用'],
                ['due', '待复习'],
              ] as Array<[PoolFilter, string]>).map(([value, label]) => (
                <button key={value} type="button" onClick={() => setPoolFilter(value)} className={`rounded-full border px-3 py-1 text-xs ${poolFilter === value ? 'border-[var(--accent-border)] bg-[var(--accent-muted)] text-[var(--accent-strong)]' : 'border-[var(--border)] text-[var(--text-muted)] hover:border-[var(--accent-border)]'}`}>
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <div className="text-xs font-medium uppercase tracking-wider text-[var(--text-muted)]">位置筛选</div>
            <div className="grid grid-cols-3 gap-2">
              <button type="button" onClick={() => setPositionFilter('all')} className={`rounded-lg border px-2 py-1.5 text-xs ${positionFilter === 'all' ? 'border-[var(--accent-border)] bg-[var(--accent-muted)] text-[var(--accent-strong)]' : 'border-[var(--border)] text-[var(--text-muted)]'}`}>全部</button>
              {HERO_POSITIONS.map(position => (
                <button key={position} type="button" onClick={() => setPositionFilter(position)} className={`rounded-lg border px-2 py-1.5 text-xs ${positionFilter === position ? 'border-[var(--accent-border)] bg-[var(--accent-muted)] text-[var(--accent-strong)]' : 'border-[var(--border)] text-[var(--text-muted)]'}`}>
                  {HERO_POSITION_LABELS[position]}
                </button>
              ))}
            </div>
          </div>

          <div className="max-h-[680px] space-y-2 overflow-y-auto pr-1">
            {filteredHeroes.map(hero => {
              const config = configByHero.get(hero)
              const note = noteByHero.get(hero)
              return (
                <HeroCard
                  key={hero}
                  hero={hero}
                  active={Boolean(config?.active)}
                  tier={config?.tier}
                  positions={getConfiguredHeroPositions(hero, config)}
                  selected={selectedHero === hero}
                  hasNote={hasNoteContent(note)}
                  due={Boolean(note && isDueForReview(note, today))}
                  onClick={() => setSelectedHero(hero)}
                />
              )
            })}
          </div>
        </Card>

        <div className="space-y-4">
          <Card className="space-y-4 p-5">
            <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
              <div>
                <h2 className="text-xl font-semibold text-[var(--text-primary)]">{selectedHero || '选择英雄'}</h2>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Badge tone={active ? 'success' : 'neutral'}>{active ? '已启用' : '未启用'}</Badge>
                  <Badge tone="accent">{tierLabel(tier, active)}</Badge>
                  {hasNoteContent(selectedNote) && <Badge tone="info">有档案</Badge>}
                  {selectedNote && isDueForReview(selectedNote, today) && <Badge tone="warning">待复习</Badge>}
                </div>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2 rounded-xl border border-[var(--border)] bg-[var(--surface-1)] p-4">
                <div className="text-sm font-semibold text-[var(--text-primary)]">基础配置</div>
                <label className="flex items-center justify-between gap-3 text-sm text-[var(--text-secondary)]">
                  <span>启用到我的英雄池</span>
                  <input type="checkbox" checked={active} onChange={event => saveHeroConfig(selectedHero, { active: event.target.checked })} className="h-4 w-4 accent-red-500" />
                </label>
                <div className="grid grid-cols-3 gap-2 pt-2">
                  {(['main', 'practice', 'backup'] as const).map(nextTier => (
                    <button key={nextTier} type="button" onClick={() => saveHeroConfig(selectedHero, { active: true, tier: nextTier })} className={`rounded-lg border px-2 py-2 text-xs ${active && tier === nextTier ? 'border-[var(--gold)] bg-[var(--gold-muted)] text-[var(--gold-strong)]' : 'border-[var(--border)] text-[var(--text-muted)] hover:border-[var(--accent-border)]'}`}>
                      {tierLabel(nextTier, true)}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-2 rounded-xl border border-[var(--border)] bg-[var(--surface-1)] p-4">
                <div className="text-sm font-semibold text-[var(--text-primary)]">可用位置</div>
                <div className="grid grid-cols-5 gap-2">
                  {HERO_POSITIONS.map(position => (
                    <button key={position} type="button" onClick={() => togglePosition(position)} className={`rounded-lg border px-2 py-2 text-xs font-semibold ${selectedPositions.includes(position) ? 'border-[var(--accent-border)] bg-[var(--accent-muted)] text-[var(--accent-strong)]' : 'border-[var(--border)] text-[var(--text-muted)] hover:border-[var(--accent-border)]'}`}>
                      {position}
                    </button>
                  ))}
                </div>
                <button type="button" onClick={() => saveHeroConfig(selectedHero, { positions: getDefaultHeroPositions(selectedHero) })} className="text-xs text-[var(--text-muted)] hover:text-[var(--text-secondary)]">
                  恢复默认位置池
                </button>
              </div>
            </div>

            <div className="rounded-xl border border-[var(--border-info)] bg-[var(--bg-info)] p-4 text-sm leading-6 text-[var(--text-info)]">
              <div className="font-semibold">Draft 影响预览</div>
              <div className="mt-1">当前会出现在：{draftImpact}</div>
              <div>熟练度：{tierLabel(tier, active)}，{tier === 'main' ? 'Draft 熟练度加权最高。' : tier === 'backup' ? 'Draft 会降权推荐。' : 'Draft 正常加权。'}</div>
              {!active && <div>关闭后：不进入默认推荐，但仍可在全部英雄搜索里手动选。</div>}
            </div>
          </Card>

          {selectedHero.trim() && (
            <Card className="rounded-xl p-4 text-sm text-[var(--text-secondary)]">
              <div className="font-semibold text-[var(--text-primary)]">间隔复习</div>
              <div className="mt-1 text-xs text-[var(--text-muted)]">
                下次复习：{form.srsNextReviewDate ?? '今天 / 未排程'}
                {form.srsIntervalDays ? ` · 间隔 ${form.srsIntervalDays} 天` : ''}
                {form.srsEase ? ` · ease ${form.srsEase.toFixed(2)}` : ''}
              </div>
            </Card>
          )}

          {selectedNote && isDueForReview(selectedNote, today) && (
            <HeroNoteReviewCard note={selectedNote} onRate={handleRateSelectedNote} />
          )}

          <Card className="space-y-4 p-5">
            <div>
              <h3 className="text-base font-semibold text-[var(--text-primary)]">英雄档案</h3>
              <p className="mt-1 text-xs text-[var(--text-muted)]">位置池由上方“可用位置”控制；这里的位置字段保留为自由文本笔记。</p>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <label className="space-y-1"><span className="block text-xs text-[var(--text-muted)]">位置笔记</span><input value={form.position} onChange={e => updateField('position', e.target.value)} className={inputCls} /></label>
              <label className="space-y-1"><span className="block text-xs text-[var(--text-muted)]">第一件关键装</span><input value={form.firstKeyItem} onChange={e => updateField('firstKeyItem', e.target.value)} className={inputCls} /></label>
              <label className="space-y-1"><span className="block text-xs text-[var(--text-muted)]">强势期</span><input value={form.strongPeriod} onChange={e => updateField('strongPeriod', e.target.value)} className={inputCls} /></label>
              <label className="space-y-1"><span className="block text-xs text-[var(--text-muted)]">弱势期</span><input value={form.weakPeriod} onChange={e => updateField('weakPeriod', e.target.value)} className={inputCls} /></label>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <label className="space-y-1"><span className="block text-xs text-[var(--text-muted)]">对线目标</span><textarea value={form.laneGoal} onChange={e => updateField('laneGoal', e.target.value)} className={textareaCls} /></label>
              <label className="space-y-1"><span className="block text-xs text-[var(--text-muted)]">常见死亡</span><textarea value={form.commonDeaths} onChange={e => updateField('commonDeaths', e.target.value)} className={textareaCls} /></label>
              <label className="space-y-1"><span className="block text-xs text-[var(--text-muted)]">何时打架</span><textarea value={form.whenToFight} onChange={e => updateField('whenToFight', e.target.value)} className={textareaCls} /></label>
              <label className="space-y-1"><span className="block text-xs text-[var(--text-muted)]">何时刷钱</span><textarea value={form.whenToFarm} onChange={e => updateField('whenToFarm', e.target.value)} className={textareaCls} /></label>
              <label className="space-y-1"><span className="block text-xs text-[var(--text-muted)]">克制</span><textarea value={form.counters} onChange={e => updateField('counters', e.target.value)} className={textareaCls} /></label>
              <label className="space-y-1"><span className="block text-xs text-[var(--text-muted)]">被克制</span><textarea value={form.counteredBy} onChange={e => updateField('counteredBy', e.target.value)} className={textareaCls} /></label>
            </div>

            <label className="block space-y-1">
              <span className="block text-xs text-[var(--text-muted)]">复盘规则</span>
              <textarea value={reviewRulesText} onChange={e => setReviewRulesText(e.target.value)} className={`${textareaCls} min-h-28`} />
            </label>

            <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-1)] p-4">
              <div className="text-sm font-semibold text-[var(--text-primary)]">对位英雄笔记</div>
              <p className="mt-1 text-xs text-[var(--text-muted)]">赛后复盘可按对位英雄沉淀心得；这里按英雄聚合展示。`counteredBy` / `counters` 仍是自由文本兼容字段。</p>
              {Object.values(form.matchupNotes ?? {}).length > 0 ? (
                <div className="mt-3 space-y-2">
                  {Object.values(form.matchupNotes ?? {})
                    .sort((a, b) => a.opponentHero.localeCompare(b.opponentHero, 'zh-CN'))
                    .map(item => (
                      <div key={item.opponentHero} className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-3 text-sm">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-semibold text-[var(--text-primary)]">vs {item.opponentHero}</span>
                          <Badge tone={item.stance === 'counteredBy' ? 'warning' : item.stance === 'counters' ? 'success' : 'neutral'}>
                            {item.stance === 'counteredBy' ? '风险/被克制' : item.stance === 'counters' ? '优势/克制' : '心得'}
                          </Badge>
                        </div>
                        <div className="mt-2 whitespace-pre-wrap text-[var(--text-secondary)]">{item.note}</div>
                      </div>
                    ))}
                </div>
              ) : (
                <div className="mt-3 text-sm text-[var(--text-muted)]">暂无对位笔记。赛后记录时可以邀请保存。</div>
              )}
            </div>
          </Card>
        </div>
      </div>
    </div>
  )
}
