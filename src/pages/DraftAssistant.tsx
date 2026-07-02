import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { nanoid } from 'nanoid'
import { useAppState } from '../store/useStore.ts'
import { resolve, getSugg, getPool, getSupMap, getCounters, getCountered } from '../utils/heroes.ts'
import {
  POSITIONS,
  POSITION_LABELS,
  recommendationLabel,
  recommendationTone,
  rankDraftHeroes,
  scoreFormula,
} from '../utils/draftScoring.ts'
import positionMetaJson from '../data/positionMetaHeroes.json'
import { isHeroPlayableAtPosition } from '../utils/heroPool.ts'
import type { DotaPosition, EnemyByPosition, HeroConfig, HeroMatchupCache, PositionMetaSnapshot, PreGameSetup, RankedDraftHero } from '../types'
import Button from '../components/ui/Button.tsx'
import Card from '../components/ui/Card.tsx'
import Badge from '../components/ui/Badge.tsx'
import Banner from '../components/ui/Banner.tsx'

const POOL = getPool()
const SUP_MAP = getSupMap()
const COUNTERS = getCounters()
const COUNTERED = getCountered()
const POSITION_META = positionMetaJson as PositionMetaSnapshot

function tierLabel(tier?: HeroConfig['tier'], active = false): string {
  if (!active) return '池外'
  if (tier === 'main') return '主力'
  if (tier === 'practice' || !tier) return '练习'
  if (tier === 'backup') return '备用'
  return '池外'
}

function signed(value: number): string {
  return `${value >= 0 ? '+' : ''}${value.toFixed(1)}`
}

export function getPositionHotHeroPlaceholder(position: DotaPosition, meta: PositionMetaSnapshot = POSITION_META): string {
  const heroes = meta.positions[position]?.slice(0, 3).map(item => item.hero).filter(Boolean) ?? []
  return heroes.length > 0 ? `如：${heroes.join('、')}` : '搜索敌方英雄'
}

function PercentBadge({ value, tone }: { value: number; tone: 'success' | 'danger' }) {
  return <Badge tone={tone} className="number">{value > 0 ? '+' : ''}{value.toFixed(1)}%</Badge>
}

function buildRisk(item: RankedDraftHero): string {
  if (item.knownRiskScore >= 5) return '已知阵容里有明显克制压力，开局先保经验和关键补刀，不要为了换血把线打崩。'
  if (item.unknownRiskScore >= 2) return '未知位置热门英雄对这个选择有潜在风险，后续看到高机动/强消耗英雄时要及时调整出装。'
  if (item.totalScore < 0) return '综合分偏低，除非这是今天明确要练的英雄，否则锁定前再确认熟练度和打法。'
  return '分数结构健康；如果对方后续补出高机动核心，第一件关键装前不要硬接无视野团。'
}

function SuggestionBox({ items, onSelect }: { items: string[]; onSelect: (hero: string) => void }) {
  if (!items.length) return null
  return (
    <div className="absolute left-0 right-0 top-full z-50 mt-1 max-h-48 overflow-y-auto rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface-2)] shadow-lg">
      {items.map(item => (
        <button
          key={item}
          type="button"
          onMouseDown={event => {
            event.preventDefault()
            onSelect(item)
          }}
          className="block w-full px-3 py-2 text-left text-sm text-[var(--text-primary)] transition-colors hover:bg-[var(--surface-1)]"
        >
          {item}
        </button>
      ))}
    </div>
  )
}

function EnemyInput({
  label,
  value,
  suggestions,
  focused,
  setFocused,
  placeholder,
  onChange,
}: {
  label: string
  value: string
  suggestions: string[]
  focused: boolean
  setFocused: (value: boolean) => void
  placeholder: string
  onChange: (value: string) => void
}) {
  return (
    <div className={`relative ${focused ? 'z-[100]' : 'z-0'}`}>
      <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-[var(--text-muted)]">{label}</label>
      <input
        value={value}
        onChange={e => onChange(e.target.value)}
        onFocus={() => setFocused(true)}
        onClick={() => setFocused(true)}
        onBlur={() => setTimeout(() => setFocused(false), 250)}
        placeholder={placeholder}
        className="w-full rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface-1)] px-3 py-2 text-sm text-[var(--text-primary)] focus:border-[var(--accent-border)] focus:outline-none"
      />
      {focused && <SuggestionBox items={suggestions} onSelect={hero => { onChange(hero); setFocused(false) }} />}
    </div>
  )
}

function DraftHeroCard({
  item,
  index,
  selected,
  isInPool,
  tier,
  onClick,
}: {
  item: RankedDraftHero
  index: number
  selected: boolean
  isInPool: boolean
  tier?: HeroConfig['tier']
  onClick: () => void
}) {
  const tone = recommendationTone(item, index)
  const visibleReasons = item.reasons.slice(0, 3)

  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full rounded-[var(--radius-lg)] border p-4 text-left transition-all active:translate-y-px ${
        selected
          ? 'border-[var(--accent-border)] bg-[var(--accent-muted)]'
          : 'border-[var(--border)] bg-[var(--surface-1)] hover:border-[var(--accent-border)] hover:bg-[var(--surface-2)]'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[var(--radius-sm)] bg-[var(--surface-2)] text-sm font-semibold text-[var(--text-secondary)]">
              {item.hero.slice(0, 1)}
            </span>
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold text-[var(--text-primary)]">{item.hero}</div>
              <div className="number mt-0.5 text-xs text-[var(--text-muted)]">{scoreFormula(item)}</div>
            </div>
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap justify-end gap-1">
          <Badge tone={tone}>{recommendationLabel(item, index)}</Badge>
          <Badge tone={isInPool ? 'neutral' : 'warning'}>{tierLabel(tier, isInPool)}</Badge>
        </div>
      </div>
      <div className="mt-3 space-y-1 text-xs leading-5 text-[var(--text-secondary)]">
        {visibleReasons.map(reason => (
          <div
            key={`${reason.type}-${reason.position ?? ''}-${reason.enemy ?? ''}-${reason.label}`}
            className={reason.score < 0 ? 'text-[var(--text-danger)]' : reason.type === 'proficiency' ? 'text-[var(--text-muted)]' : 'text-[var(--text-success)]'}
          >
            {reason.label}
          </div>
        ))}
      </div>
    </button>
  )
}

function DetailList({ title, data, tone }: { title: string; data: Record<string, number>; tone: 'success' | 'danger' }) {
  const entries = Object.entries(data).sort((a, b) => b[1] - a[1]).slice(0, 6)
  return (
    <div>
      <div className={`mb-2 text-xs font-semibold ${tone === 'success' ? 'text-[var(--text-success)]' : 'text-[var(--text-danger)]'}`}>{title}</div>
      {entries.length > 0 ? (
        <div className="space-y-1">
          {entries.map(([hero, value]) => (
            <div key={hero} className="flex items-center justify-between gap-2 rounded-[var(--radius-sm)] bg-[var(--surface-2)] px-2 py-1.5">
              <span className="truncate text-xs text-[var(--text-secondary)]">{hero}</span>
              <PercentBadge value={tone === 'success' ? value : -value} tone={tone} />
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-[var(--radius-sm)] border border-dashed border-[var(--border)] px-3 py-4 text-xs text-[var(--text-muted)]">暂无数据</div>
      )}
    </div>
  )
}

function reasonClass(score: number, type: string): string {
  if (score < 0) return 'text-[var(--text-danger)]'
  if (type === 'proficiency') return 'text-[var(--text-secondary)]'
  return 'text-[var(--text-success)]'
}

export default function DraftAssistant() {
  const navigate = useNavigate()
  const { appState, update: updateAppState } = useAppState()
  const [targetPosition, setTargetPosition] = useState<DotaPosition>('3')
  const [enemyByPosition, setEnemyByPosition] = useState<EnemyByPosition>({})
  const [focusedPosition, setFocusedPosition] = useState<DotaPosition | null>(null)
  const [matchupCache, setMatchupCache] = useState<HeroMatchupCache | null>(null)
  const [syncStatus, setSyncStatus] = useState('')
  const [selectedHero, setSelectedHero] = useState<string>('')
  const lastEnemyKeyRef = useRef('')

  const configuredPool = appState?.heroPool ?? []
  const activePool = configuredPool.filter(h => h.active).map(h => h.name)
  const minGames = appState?.openDota?.matchupMinGames ?? 50

  const resolvedEnemyByPosition = useMemo<EnemyByPosition>(() => {
    const result: EnemyByPosition = {}
    for (const position of POSITIONS) {
      const resolved = resolve(enemyByPosition[position] ?? '')
      if (resolved) result[position] = resolved
    }
    return result
  }, [enemyByPosition])

  const enemyHeroes = POSITIONS.map(position => resolvedEnemyByPosition[position]).filter(Boolean) as string[]
  const enemyHeroKey = enemyHeroes.join('|')
  const enemyKey = `${targetPosition}|${POSITIONS.map(position => `${position}:${resolvedEnemyByPosition[position] ?? ''}`).join('|')}`
  const candidatePool = useMemo(() => {
    const pickedHeroes = new Set(enemyHeroKey ? enemyHeroKey.split('|') : [])
    const configByHero = new Map(configuredPool.map(config => [config.name, config]))
    return POOL
      .filter(hero => isHeroPlayableAtPosition(hero, targetPosition, configByHero.get(hero)))
      .filter(hero => !pickedHeroes.has(hero))
  }, [targetPosition, enemyHeroKey, configuredPool])
  const activeCandidateCount = candidatePool.filter(hero => activePool.includes(hero)).length
  const unknownPositions = POSITIONS.filter(position => !resolvedEnemyByPosition[position])
  const enemyCarry = resolvedEnemyByPosition['1']
  const enemySupports = [resolvedEnemyByPosition['4'], resolvedEnemyByPosition['5']].filter(Boolean) as string[]

  useEffect(() => {
    let cancelled = false

    window.electronStore.getHeroMatchupCache()
      .then(cache => {
        if (!cancelled && cache) setMatchupCache(cache)
      })
      .catch(() => undefined)

    setSyncStatus('正在检查本周 matchup 矩阵缓存')
    window.electronStore.syncOpenDotaHeroMatchups(false)
      .then(result => {
        if (cancelled) return
        setMatchupCache(result.cache)
        setSyncStatus(result.message)
      })
      .catch(error => {
        if (cancelled) return
        setSyncStatus(error instanceof Error ? error.message : String(error))
      })

    return () => { cancelled = true }
  }, [])

  const ranked = useMemo<RankedDraftHero[]>(() => rankDraftHeroes({
    candidates: candidatePool,
    enemyByPosition: resolvedEnemyByPosition,
    heroPool: configuredPool,
    matchupCache,
    positionMeta: POSITION_META,
    matchupMinGames: minGames,
    counters: COUNTERS,
    countered: COUNTERED,
    supportMap: SUP_MAP,
  }), [candidatePool, resolvedEnemyByPosition, configuredPool, matchupCache, minGames])

  useEffect(() => {
    const topHero = ranked[0]?.hero
    if (!topHero) return

    const enemyChanged = lastEnemyKeyRef.current !== enemyKey
    if (!selectedHero || enemyChanged) {
      setSelectedHero(topHero)
      lastEnemyKeyRef.current = enemyKey
    }
  }, [enemyKey, ranked, selectedHero])

  const selected = ranked.find(item => item.hero === selectedHero) ?? ranked[0]

  const getDynamicDetailData = (hero: string, direction: 'counters' | 'countered'): Record<string, number> => {
    const matchups = matchupCache?.matchups[hero]
    if (!matchups) return {}

    return Object.fromEntries(
      Object.entries(matchups)
        .filter(([, stats]) => stats.gamesPlayed >= minGames && (direction === 'counters' ? stats.advantage > 0 : stats.advantage < 0))
        .sort(([, a], [, b]) => direction === 'counters' ? b.advantage - a.advantage : a.advantage - b.advantage)
        .slice(0, 10)
        .map(([enemy, stats]) => [enemy, Math.abs(stats.advantage)])
    )
  }

  const { dynamicCounters, dynamicCountered } = useMemo(() => {
    if (!selected) return { dynamicCounters: {}, dynamicCountered: {} }
    return {
      dynamicCounters: getDynamicDetailData(selected.hero, 'counters'),
      dynamicCountered: getDynamicDetailData(selected.hero, 'countered'),
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.hero, matchupCache, minGames])

  const hasDynamicCounters = Object.keys(dynamicCounters).length > 0
  const hasDynamicCountered = Object.keys(dynamicCountered).length > 0
  const selectedCounters = hasDynamicCounters ? dynamicCounters : (selected ? COUNTERS[selected.hero] || {} : {})
  const selectedCountered = hasDynamicCountered ? dynamicCountered : (selected ? COUNTERED[selected.hero] || {} : {})
  const matchupSourceLabel = matchupCache?.source === 'stratz' ? 'Stratz' : 'OpenDota'
  const counterSource = hasDynamicCounters ? `${matchupSourceLabel} ≥${minGames} 局` : '本地表'
  const counteredSource = hasDynamicCountered ? `${matchupSourceLabel} ≥${minGames} 局` : '本地表'
  const positionMetaSource = `${POSITION_META.source === 'stratz' ? 'Stratz' : '本地默认'} ${POSITION_META.rankBracket ?? 'ALL'} ${POSITION_META.weekKey}`

  const handleEnemyChange = (position: DotaPosition, value: string) => {
    setEnemyByPosition(current => ({ ...current, [position]: value }))
  }

  const handleSelectHero = async (hero: string) => {
    if (!appState) return
    if (appState.pendingPreGameSetupId) {
      const ok = window.confirm('上一条赛前设定还未关联对局，是否放弃？')
      if (!ok) return
    }

    const setup: PreGameSetup = {
      id: nanoid(),
      timestamp: Date.now(),
      hero,
      targetPosition,
      enemyByPosition: resolvedEnemyByPosition,
      ...(enemyCarry && { enemyCarry }),
      ...(enemySupports.length && { enemySupports }),
      cycleId: appState.activeCycleId,
    }

    await window.electronStore.addPreGameSetup(setup)
    await updateAppState({ pendingPreGameSetupId: setup.id })
    navigate('/pre-game', { state: { setup } })
  }

  const riskItems = ranked
    .filter(item => item.knownRiskScore > 0)
    .sort((a, b) => b.knownRiskScore - a.knownRiskScore)
    .slice(0, 5)

  const knownReasons = selected?.reasons.filter(reason => reason.type === 'known-counter' || reason.type === 'known-risk') ?? []
  const unknownReasons = selected?.reasons.filter(reason => reason.type === 'unknown-counter' || reason.type === 'unknown-risk') ?? []
  const proficiencyReasons = selected?.reasons.filter(reason => reason.type === 'proficiency') ?? []

  return (
    <div className="mx-auto max-w-[1280px] space-y-6 px-4 py-6 md:px-6">
      <section className="grid gap-4 lg:grid-cols-[1.35fr_0.95fr]">
        <Card className="p-5 md:p-6">
          <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div>
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <Badge tone={matchupCache ? 'info' : 'neutral'}>{matchupCache ? `Matchup ${matchupCache.weekKey ?? matchupCache.date}` : '本地克制表'}</Badge>
                <Badge tone="success">推荐：{POSITION_LABELS[targetPosition]}</Badge>
                <Badge tone="accent">已识别 {enemyHeroes.length}/5 个敌方位置</Badge>
                {unknownPositions.length > 0 && <Badge tone="neutral">未知：{unknownPositions.map(position => POSITION_LABELS[position]).join('、')}</Badge>}
              </div>
              <h1 className="text-2xl font-bold tracking-tight text-[var(--text-primary)] md:text-3xl">Draft 助手</h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--text-secondary)]">先选择你要出的目标位置；推荐列表只保留能打该位置、且未被对方选择的英雄，再按 matchup 和熟练度排序。</p>
            </div>
          </div>

          <div className="mb-5 space-y-2">
            <div className="text-xs font-medium uppercase tracking-wider text-[var(--text-muted)]">我要出的位置</div>
            <div className="grid grid-cols-5 gap-2">
              {POSITIONS.map(position => (
                <button
                  key={position}
                  type="button"
                  onClick={() => setTargetPosition(position)}
                  className={`rounded-[var(--radius-md)] border px-3 py-2 text-sm font-semibold transition-colors ${
                    targetPosition === position
                      ? 'border-[var(--accent-border)] bg-[var(--accent-muted)] text-[var(--accent-strong)]'
                      : 'border-[var(--border)] bg-[var(--surface-1)] text-[var(--text-secondary)] hover:border-[var(--accent-border)]'
                  }`}
                >
                  {POSITION_LABELS[position]}
                </button>
              ))}
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
            {POSITIONS.map(position => {
              const value = enemyByPosition[position] ?? ''
              const focused = focusedPosition === position
              return (
                <EnemyInput
                  key={position}
                  label={`对方 ${POSITION_LABELS[position]}`}
                  value={value}
                  suggestions={(focused || value ? getSugg(value, 200) : []).filter(hero => {
                    const currentResolved = resolve(value)
                    return hero === currentResolved || !POSITIONS.some(other => other !== position && resolvedEnemyByPosition[other] === hero)
                  })}
                  focused={focused}
                  setFocused={isFocused => setFocusedPosition(isFocused ? position : null)}
                  placeholder={getPositionHotHeroPlaceholder(position)}
                  onChange={nextValue => handleEnemyChange(position, nextValue)}
                />
              )
            })}
          </div>
        </Card>

        <Card className="p-5 md:p-6">
          <div className="text-sm font-semibold text-[var(--text-primary)]">数据源状态</div>
          <p className="mt-2 text-sm leading-6 text-[var(--text-muted)]">{syncStatus || '等待同步状态'}</p>
          <div className="mt-3 space-y-1 text-xs text-[var(--text-muted)]">
            <div>Matchup：{matchupCache ? `${matchupSourceLabel} ${matchupCache.rankBracket ?? ''} ${matchupCache.weekKey ?? matchupCache.date}` : '本地表'}</div>
            <div>位置热门：{positionMetaSource}</div>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <div className="rounded-[var(--radius-md)] bg-[var(--surface-2)] p-3">
              <div className="number text-lg font-semibold text-[var(--text-primary)]">{ranked.length}</div>
              <div className="text-xs text-[var(--text-muted)]">候选英雄</div>
            </div>
            <div className="rounded-[var(--radius-md)] bg-[var(--surface-2)] p-3">
              <div className="number text-lg font-semibold text-[var(--text-primary)]">{activeCandidateCount}</div>
              <div className="text-xs text-[var(--text-muted)]">该位置英雄池内</div>
            </div>
          </div>
        </Card>
      </section>

      {riskItems.length > 0 && (
        <Banner tone="danger">
          已知克制风险警告：{riskItems.map(item => `${item.hero} -${item.knownRiskScore.toFixed(1)}`).join('，')}
        </Banner>
      )}

      <section className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-[var(--text-primary)]">推荐列表</h2>
              <p className="mt-1 text-sm text-[var(--text-muted)]">当前只推荐可出 {POSITION_LABELS[targetPosition]} 的英雄，并排除对方已选英雄；再综合已知对手、未知位置热门预期和自身熟练度排序。</p>
            </div>
          </div>
          <div className="grid gap-3">
            {ranked.map((item, index) => (
              <DraftHeroCard
                key={item.hero}
                item={item}
                index={index}
                selected={selected?.hero === item.hero}
                isInPool={activePool.includes(item.hero)}
                tier={item.poolTier}
                onClick={() => setSelectedHero(item.hero)}
              />
            ))}
          </div>
        </div>

        <div className="lg:sticky lg:top-6 lg:self-start">
          {selected ? (
            <Card tone="raised" className="p-5 md:p-6">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <Badge tone={recommendationTone(selected, ranked.findIndex(item => item.hero === selected.hero))}>{recommendationLabel(selected, ranked.findIndex(item => item.hero === selected.hero))}</Badge>
                  <h2 className="mt-3 text-2xl font-bold tracking-tight text-[var(--text-primary)]">{selected.hero}</h2>
                  <p className="number mt-1 text-sm text-[var(--text-muted)]">{scoreFormula(selected)}</p>
                  <div className="mt-2 flex flex-wrap gap-1">
                    <Badge tone={selected.knownScore >= 0 ? 'success' : 'danger'}>已知 {signed(selected.knownScore)}</Badge>
                    <Badge tone={selected.unknownScore >= 0 ? 'accent' : 'warning'}>未知 {signed(selected.unknownScore)}</Badge>
                    <Badge tone={selected.proficiencyScore >= 0 ? 'accent' : 'warning'}>熟练度 {signed(selected.proficiencyScore)}</Badge>
                  </div>
                </div>
                <Badge tone={activePool.includes(selected.hero) ? 'neutral' : 'warning'}>{tierLabel(selected.poolTier, activePool.includes(selected.hero))}</Badge>
              </div>

              <div className="mt-5 space-y-4">
                <div>
                  <div className="mb-2 text-sm font-semibold text-[var(--text-primary)]">已知对手 matchup</div>
                  {knownReasons.length > 0 ? (
                    <div className="space-y-1 rounded-[var(--radius-sm)] bg-[var(--surface-2)] p-2 text-xs leading-5">
                      {knownReasons.map(reason => <div key={reason.label} className={reasonClass(reason.score, reason.type)}>{reason.label}</div>)}
                    </div>
                  ) : (
                    <p className="text-sm text-[var(--text-muted)]">还没有足够已知对手数据。</p>
                  )}
                </div>

                <div>
                  <div className="mb-2 text-sm font-semibold text-[var(--text-primary)]">未知位置预期</div>
                  {unknownReasons.length > 0 ? (
                    <div className="space-y-1 rounded-[var(--radius-sm)] bg-[var(--surface-2)] p-2 text-xs leading-5">
                      {unknownReasons.map(reason => <div key={reason.label} className={reasonClass(reason.score, reason.type)}>{reason.label}</div>)}
                    </div>
                  ) : (
                    <p className="text-sm text-[var(--text-muted)]">敌方 5 个位置已完整，或缺少热门英雄 matchup 数据。</p>
                  )}
                </div>

                <div>
                  <div className="mb-2 text-sm font-semibold text-[var(--text-primary)]">熟练度</div>
                  <div className="space-y-1 rounded-[var(--radius-sm)] bg-[var(--surface-2)] p-2 text-xs leading-5">
                    {proficiencyReasons.map(reason => <div key={reason.label} className={reasonClass(reason.score, reason.type)}>{reason.label}</div>)}
                  </div>
                </div>

                <div>
                  <div className="mb-2 text-sm font-semibold text-[var(--text-primary)]">需要注意</div>
                  <p className="text-sm leading-6 text-[var(--text-secondary)]">{buildRisk(selected)}</p>
                </div>

                <Button variant="primary" size="lg" fullWidth onClick={() => handleSelectHero(selected.hero)}>锁定并进入赛前</Button>
              </div>

              <div className="mt-6 grid gap-4 md:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
                <DetailList title={`克制对手 · ${counterSource}`} data={selectedCounters} tone="success" />
                <DetailList title={`注意被克 · ${counteredSource}`} data={selectedCountered} tone="danger" />
              </div>
            </Card>
          ) : (
            <Card className="p-6 text-sm text-[var(--text-muted)]">暂无推荐结果。</Card>
          )}
        </div>
      </section>
    </div>
  )
}
