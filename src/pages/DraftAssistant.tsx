import React, { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAppState } from '../store/useStore.ts'
import { resolve, getSugg, getPool, getSupMap, getCounters, getCountered } from '../utils/heroes.ts'
import type { HeroConfig, HeroMatchupCache } from '../types'
import Button from '../components/ui/Button.tsx'
import Card from '../components/ui/Card.tsx'
import Badge from '../components/ui/Badge.tsx'
import Banner from '../components/ui/Banner.tsx'

const POOL = getPool()
const SUP_MAP = getSupMap()
const COUNTERS = getCounters()
const COUNTERED = getCountered()

// 样本量低于这个数就完全不采信（噪声太大）；介于此值和 minGames 之间时按比例打折
// 而不是硬阈值直接归零——具体某个英雄对某个英雄的样本量大多数达不到 minGames（默认 50），
// 硬阈值会导致换敌方英雄时分数几乎不变。
const MIN_SAMPLE_FLOOR = 10

interface MatchupNote {
  enemy: string
  advantage: number
  gamesPlayed?: number
  source: 'dynamic' | 'static'
  kind: 'counter' | 'risk'
}

interface RankedHero {
  hero: string
  threat: number
  cScore: number
  totalScore: number
  matchupNotes: MatchupNote[]
  poolTier?: HeroConfig['tier']
  poolWeight: number
}

function tierLabel(tier?: HeroConfig['tier']): string {
  if (tier === 'main') return '主力'
  if (tier === 'practice') return '练习'
  if (tier === 'backup') return '备用'
  return '池外'
}

function getPoolWeight(tier?: HeroConfig['tier'], active = false): number {
  if (!active) return -12
  if (tier === 'main') return 8
  if (tier === 'practice' || !tier) return 3
  if (tier === 'backup') return -4
  return 0
}

function PercentBadge({ value, tone }: { value: number; tone: 'success' | 'danger' }) {
  return <Badge tone={tone} className="number">{value > 0 ? '+' : ''}{value.toFixed(1)}%</Badge>
}

function scoreFormula(item: RankedHero): string {
  const cScoreText = item.cScore.toFixed(1)
  const riskText = (item.threat * 2).toFixed(1)
  const poolText = item.poolWeight === 0 ? '0' : `${item.poolWeight > 0 ? '+' : ''}${item.poolWeight}`
  // 用这里实际展示的三个数字（都已 toFixed(1)）重新算"综合"，而不是直接四舍五入
  // 未截断的 item.totalScore——否则两边精度不一致，手动验算会对不上。
  const displayedTotal = Number(cScoreText) - Number(riskText) + item.poolWeight
  return `综合 ${Math.round(displayedTotal)} = 反制 ${cScoreText} - 风险 ${riskText} + 英雄池 ${poolText}`
}

function formatMatchupNote(note: MatchupNote): string {
  const sign = note.advantage > 0 ? '+' : ''
  const games = note.gamesPlayed ? `（${note.gamesPlayed}局）` : ''
  return `对 ${note.enemy} 胜率 ${sign}${note.advantage.toFixed(1)}%${games}`
}

function getRecommendationTone(item: RankedHero, index: number): 'success' | 'accent' | 'warning' {
  if (index <= 2 && item.threat <= 0) return 'success'
  if (item.threat > 0) return 'warning'
  return 'accent'
}

function getRecommendationLabel(item: RankedHero, index: number): string {
  if (index <= 2 && item.threat <= 0) return '推荐'
  if (item.threat > 0) return '谨慎'
  return '可选'
}

function buildReason(item: RankedHero, enemyCount: number, hasCarry: boolean): string[] {
  const reasons: string[] = []
  if (item.poolTier === 'main') reasons.push('主力英雄，适合冲分优先考虑')
  if (item.poolTier === 'backup') reasons.push('备用英雄，仅在阵容特别适合时选择')
  if (item.threat <= 0 && enemyCount > 0) reasons.push(hasCarry ? '当前核心/辅助没有形成明显克制压力' : '当前输入的辅助没有形成明显克制压力')
  if (item.cScore > 0) reasons.push('对常见核心有可用的 counter 价值')
  if (item.threat > 0) reasons.push('这局存在被辅助针对的风险，需要更稳的对线计划')
  if (reasons.length === 0) reasons.push('数据不足，优先按英雄熟练度和本周训练目标判断')
  return reasons.slice(0, 2)
}

function buildRisk(item: RankedHero): string {
  if (item.threat > 0) return '开局先保经验和关键补刀，不要为了换血把线打崩。'
  if (item.cScore < 0) return '对当前这套敌方阵容数据上偏劣势，锁定前想清楚打法调整。'
  if (item.cScore === 0) return '缺少足够对位数据，锁定前先确认自己是否熟练。'
  return '如果对方后续补出高机动核心，第一件关键装前不要硬接无视野团。'
}

function SuggestionBox({ items, onSelect }: { items: string[]; onSelect: (hero: string) => void }) {
  if (!items.length) return null
  return (
    <div className="absolute left-0 right-0 top-full z-50 mt-1 max-h-48 overflow-y-auto rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface-2)] shadow-lg">
      {items.map(item => (
        <button
          key={item}
          type="button"
          onMouseDown={() => onSelect(item)}
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
  onChange,
}: {
  label: string
  value: string
  suggestions: string[]
  focused: boolean
  setFocused: (value: boolean) => void
  onChange: (value: string) => void
}) {
  return (
    <div className="relative">
      <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-[var(--text-muted)]">{label}</label>
      <input
        value={value}
        onChange={e => onChange(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setTimeout(() => setFocused(false), 150)}
        placeholder="如：屠夫、先知、AA、CM"
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
  enemyCount,
  hasCarry,
  onClick,
}: {
  item: RankedHero
  index: number
  selected: boolean
  isInPool: boolean
  tier?: HeroConfig['tier']
  enemyCount: number
  hasCarry: boolean
  onClick: () => void
}) {
  const tone = getRecommendationTone(item, index)
  const reasons = buildReason(item, enemyCount, hasCarry)

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
          <Badge tone={tone}>{getRecommendationLabel(item, index)}</Badge>
          <Badge tone={isInPool ? 'neutral' : 'warning'}>{tierLabel(tier)}</Badge>
        </div>
      </div>
      <div className="mt-3 space-y-1 text-xs leading-5 text-[var(--text-secondary)]">
        {reasons.map(reason => <div key={reason}>{reason}</div>)}
        {item.matchupNotes.slice(0, 3).map(note => (
          <div key={`${note.enemy}-${note.kind}`} className={note.kind === 'counter' ? 'text-[var(--text-success)]' : 'text-[var(--text-danger)]'}>
            {note.kind === 'counter' ? '反制' : '风险'}：{formatMatchupNote(note)}
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

export default function DraftAssistant() {
  const navigate = useNavigate()
  const { appState } = useAppState()
  const [carry, setCarry] = useState('')
  const [s1, setS1] = useState('')
  const [s2, setS2] = useState('')
  const [fCarry, setFCarry] = useState(false)
  const [f1, setF1] = useState(false)
  const [f2, setF2] = useState(false)
  const [matchupCache, setMatchupCache] = useState<HeroMatchupCache | null>(null)
  const [syncStatus, setSyncStatus] = useState('')
  const [selectedHero, setSelectedHero] = useState<string>('')

  const configuredPool = appState?.heroPool ?? []
  const activePool = configuredPool.filter(h => h.active).map(h => h.name)
  const poolByHero = new Map(configuredPool.map(item => [item.name, item]))
  const minGames = appState?.openDota?.matchupMinGames ?? 50
  const sgCarry = fCarry || carry ? getSugg(carry, 200) : []
  const sg1 = f1 || s1 ? getSugg(s1, 200) : []
  const sg2 = f2 || s2 ? getSugg(s2, 200) : []
  const enemyCarry = resolve(carry)
  const enemySupports = [resolve(s1), resolve(s2)].filter(Boolean) as string[]
  const enemyHeroes = [enemyCarry, ...enemySupports].filter(Boolean) as string[]

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

  const getDynamicAdvantage = (hero: string, enemy: string): number | null => {
    const stats = matchupCache?.matchups[hero]?.[enemy]
    if (!stats || stats.gamesPlayed < MIN_SAMPLE_FLOOR) return null
    const confidence = Math.min(1, stats.gamesPlayed / minGames)
    return stats.advantage * confidence
  }

  const getDynamicCounterScore = (hero: string): number | null => {
    const matchups = matchupCache?.matchups[hero]
    if (!matchups) return null
    const topAdvantages = Object.values(matchups)
      .filter(stats => stats.gamesPlayed >= minGames && stats.advantage > 0)
      .sort((a, b) => b.advantage - a.advantage)
      .slice(0, 10)
      .map(stats => stats.advantage)
    if (topAdvantages.length === 0) return 0
    return topAdvantages.reduce((sum, value) => sum + value, 0) / topAdvantages.length
  }

  const getMatchupNote = (hero: string, enemy: string): MatchupNote | null => {
    const stats = matchupCache?.matchups[hero]?.[enemy]
    if (stats && stats.gamesPlayed >= MIN_SAMPLE_FLOOR && stats.advantage !== 0) {
      return {
        enemy,
        advantage: stats.advantage,
        gamesPlayed: stats.gamesPlayed,
        source: 'dynamic',
        kind: stats.advantage > 0 ? 'counter' : 'risk',
      }
    }

    const staticCounter = COUNTERS[hero]?.[enemy]
    if (staticCounter) return { enemy, advantage: staticCounter, source: 'static', kind: 'counter' }

    const staticRisk = SUP_MAP[enemy]?.[hero]
    if (staticRisk) return { enemy, advantage: -staticRisk, source: 'static', kind: 'risk' }

    return null
  }

  const getMatchupNotes = (hero: string): MatchupNote[] => enemyHeroes
    .map(enemy => getMatchupNote(hero, enemy))
    .filter((note): note is MatchupNote => Boolean(note))
    .sort((a, b) => Math.abs(b.advantage) - Math.abs(a.advantage))

  const threatMap = useMemo(() => {
    const c1 = resolve(s1), c2 = resolve(s2)
    const c0 = resolve(carry)
    const enemies = [c0, c1, c2].filter((item): item is string => Boolean(item))
    const m1 = c1 ? (SUP_MAP[c1] || {}) : {}
    const m2 = c2 ? (SUP_MAP[c2] || {}) : {}
    const out: Record<string, number> = {}
    for (const hero of POOL) {
      const dynamicThreat = enemies.reduce((sum, enemy) => {
        const advantage = getDynamicAdvantage(hero, enemy)
        return sum + (advantage === null ? 0 : Math.max(0, -advantage))
      }, 0)
      const staticThreat = (m1[hero] || 0) + (m2[hero] || 0)
      const score = dynamicThreat > 0 ? dynamicThreat : staticThreat
      if (score > 0) out[hero] = score
    }
    return out
  }, [carry, s1, s2, matchupCache, minGames])

  const ranked = useMemo<RankedHero[]>(() =>
    POOL.map(hero => {
      const config = poolByHero.get(hero)
      const carryAdvantage = enemyCarry ? getDynamicAdvantage(hero, enemyCarry) ?? 0 : 0
      const staticScore = Object.values(COUNTERS[hero] || {}).reduce((a: number, b: number) => a + b, 0)
      const dynamicScore = getDynamicCounterScore(hero)
      // 不再 clamp 到 >= 0：被当前敌方 1 号位克制应该实打实地拉低分数，
      // 否则换一个敌方核心时分数只会涨不会跌，观感上"分数没反应"。
      // dynamicScore === 0 是有效动态结果，不能用 || 回退到本地静态表。
      const cScore = (dynamicScore ?? staticScore) + carryAdvantage * 1.4
      const threat = threatMap[hero] || 0
      const poolWeight = getPoolWeight(config?.tier, Boolean(config?.active))
      return {
        hero,
        threat,
        cScore,
        totalScore: cScore - threat * 2 + poolWeight,
        matchupNotes: getMatchupNotes(hero),
        poolTier: config?.tier,
        poolWeight,
      }
    }).sort((a, b) => b.totalScore - a.totalScore),
    [threatMap, matchupCache, configuredPool, enemyCarry, enemyHeroes.join('|'), minGames]
  )

  useEffect(() => {
    if (!selectedHero && ranked.length > 0) setSelectedHero(ranked[0].hero)
  }, [ranked, selectedHero])

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
  // 两个列表各自独立判断数据来源，不能共用一个标签——否则其中一个列表回退到本地表时，
  // 仍会被贴上动态数据标签，误导数据可信度。
  const matchupSourceLabel = matchupCache?.source === 'stratz' ? 'Stratz' : 'OpenDota'
  const counterSource = hasDynamicCounters ? `${matchupSourceLabel} ≥${minGames} 局` : '本地表'
  const counteredSource = hasDynamicCountered ? `${matchupSourceLabel} ≥${minGames} 局` : '本地表'

  const handleSelectHero = (hero: string) => {
    navigate('/pre-game', { state: { hero, enemySupports, enemyCarry } })
  }

  return (
    <div className="mx-auto max-w-[1280px] space-y-6 px-4 py-6 md:px-6">
      <section className="grid gap-4 lg:grid-cols-[1.35fr_0.95fr]">
        <Card className="p-5 md:p-6">
          <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div>
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <Badge tone={matchupCache ? 'info' : 'neutral'}>{matchupCache ? `矩阵 ${matchupCache.weekKey ?? matchupCache.date}` : '本地克制表'}</Badge>
                {enemyHeroes.length > 0 && <Badge tone="accent">已识别 {enemyHeroes.length} 个敌方英雄</Badge>}
              </div>
              <h1 className="text-2xl font-bold tracking-tight text-[var(--text-primary)] md:text-3xl">三号位 Draft 助手</h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--text-secondary)]">输入对方 1 号位和辅助，先看推荐理由，再锁定本局英雄和训练目标。</p>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            <EnemyInput label="对方 1 号位（可选）" value={carry} suggestions={sgCarry} focused={fCarry} setFocused={setFCarry} onChange={setCarry} />
            <EnemyInput label="对方辅助 1" value={s1} suggestions={sg1} focused={f1} setFocused={setF1} onChange={setS1} />
            <EnemyInput label="对方辅助 2" value={s2} suggestions={sg2} focused={f2} setFocused={setF2} onChange={setS2} />
          </div>
        </Card>

        <Card className="p-5 md:p-6">
          <div className="text-sm font-semibold text-[var(--text-primary)]">数据源状态</div>
          <p className="mt-2 text-sm leading-6 text-[var(--text-muted)]">{syncStatus || '等待同步状态'}</p>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <div className="rounded-[var(--radius-md)] bg-[var(--surface-2)] p-3">
              <div className="number text-lg font-semibold text-[var(--text-primary)]">{ranked.length}</div>
              <div className="text-xs text-[var(--text-muted)]">候选英雄</div>
            </div>
            <div className="rounded-[var(--radius-md)] bg-[var(--surface-2)] p-3">
              <div className="number text-lg font-semibold text-[var(--text-primary)]">{activePool.length}</div>
              <div className="text-xs text-[var(--text-muted)]">英雄池内</div>
            </div>
          </div>
        </Card>
      </section>

      {Object.keys(threatMap).length > 0 && (
        <Banner tone="danger">
          克制风险警告：{Object.entries(threatMap).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([hero, value]) => `${hero} -${value.toFixed(1)}%`).join('，')}
        </Banner>
      )}

      <section className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-[var(--text-primary)]">推荐列表</h2>
              <p className="mt-1 text-sm text-[var(--text-muted)]">先读原因，再看数字。池外英雄会保留但降权处理。</p>
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
                enemyCount={enemyHeroes.length}
                hasCarry={Boolean(enemyCarry)}
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
                  <Badge tone={getRecommendationTone(selected, ranked.findIndex(item => item.hero === selected.hero))}>{getRecommendationLabel(selected, ranked.findIndex(item => item.hero === selected.hero))}</Badge>
                  <h2 className="mt-3 text-2xl font-bold tracking-tight text-[var(--text-primary)]">{selected.hero}</h2>
                  <p className="number mt-1 text-sm text-[var(--text-muted)]">{scoreFormula(selected)}</p>
                  <div className="mt-2 flex flex-wrap gap-1">
                    <Badge tone={selected.cScore >= 0 ? 'success' : 'danger'}>反制 {selected.cScore >= 0 ? '+' : ''}{selected.cScore.toFixed(1)}</Badge>
                    <Badge tone={selected.threat > 0 ? 'danger' : 'neutral'}>风险 -{(selected.threat * 2).toFixed(1)}</Badge>
                    <Badge tone={selected.poolWeight >= 0 ? 'accent' : 'warning'}>英雄池 {selected.poolWeight > 0 ? '+' : ''}{selected.poolWeight}</Badge>
                  </div>
                </div>
                <Badge tone={activePool.includes(selected.hero) ? 'neutral' : 'warning'}>{tierLabel(selected.poolTier)}</Badge>
              </div>

              <div className="mt-5 space-y-4">
                <div>
                  <div className="mb-2 text-sm font-semibold text-[var(--text-primary)]">为什么适合这局</div>
                  <div className="space-y-2 text-sm leading-6 text-[var(--text-secondary)]">
                    {buildReason(selected, enemyHeroes.length, Boolean(enemyCarry)).map(reason => <div key={reason}>{reason}</div>)}
                    {selected.matchupNotes.length > 0 && (
                      <div className="space-y-1 rounded-[var(--radius-sm)] bg-[var(--surface-2)] p-2 text-xs leading-5">
                        {selected.matchupNotes.map(note => (
                          <div key={`${note.enemy}-${note.kind}`} className={note.kind === 'counter' ? 'text-[var(--text-success)]' : 'text-[var(--text-danger)]'}>
                            {note.kind === 'counter' ? '反制' : '风险'}：{formatMatchupNote(note)}
                          </div>
                        ))}
                      </div>
                    )}
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
