import React, { useEffect, useMemo, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useAppState, useCycles, useHeroNotes, usePreGameSetups } from '../store/useStore.ts'
import Card from '../components/ui/Card.tsx'
import Badge from '../components/ui/Badge.tsx'
import Button from '../components/ui/Button.tsx'
import Banner from '../components/ui/Banner.tsx'
import { getCounters, getCountered } from '../utils/heroes.ts'
import { getCurrentWeek } from '../utils/cycle.ts'
import type { DotaPosition, EnemyByPosition, HeroMatchupCache, HeroNote, PreGameSetup } from '../types'

const POSITION_LABELS: Record<DotaPosition, string> = {
  '1': '1号位',
  '2': '2号位',
  '3': '3号位',
  '4': '4号位',
  '5': '5号位',
}

const POSITIONS: DotaPosition[] = ['1', '2', '3', '4', '5']
const STATIC_COUNTERS = getCounters()
const STATIC_COUNTERED = getCountered()

function splitNoteLines(value?: string): string[] {
  return (value ?? '')
    .split(/[\n；;]+/)
    .map(item => item.trim())
    .filter(Boolean)
}

function FieldList({ title, items, empty }: { title: string; items: string[]; empty?: string }) {
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-1)] p-4">
      <div className="text-sm font-semibold text-[var(--text-primary)]">{title}</div>
      {items.length > 0 ? (
        <ul className="mt-2 space-y-1 text-sm leading-6 text-[var(--text-secondary)]">
          {items.map(item => <li key={item}>• {item}</li>)}
        </ul>
      ) : (
        <div className="mt-2 text-sm text-[var(--text-muted)]">{empty ?? '暂无内容'}</div>
      )}
    </div>
  )
}

function buildHeroNoteItems(note?: HeroNote): string[] {
  if (!note) return []
  return [
    note.laneGoal && `对线目标：${note.laneGoal}`,
    note.firstKeyItem && `第一件关键装：${note.firstKeyItem}`,
    note.strongPeriod && `强势期：${note.strongPeriod}`,
    note.weakPeriod && `弱势期：${note.weakPeriod}`,
    note.commonDeaths && `常见死亡：${note.commonDeaths}`,
    note.whenToFight && `何时打架：${note.whenToFight}`,
    note.whenToFarm && `何时刷钱：${note.whenToFarm}`,
    ...splitNoteLines(note.reviewRules).map(rule => `复盘规则：${rule}`),
  ].filter((value): value is string => Boolean(value && value.trim()))
}

function relevantLines(value: string | undefined, enemies: string[]): string[] {
  const lines = splitNoteLines(value)
  const matched = lines.filter(line => enemies.some(enemy => line.includes(enemy)))
  return matched.length > 0 ? matched : []
}

function buildUserMatchupNotes(note: HeroNote | undefined, enemies: string[]): string[] {
  if (!note) return []
  return [
    ...relevantLines(note.counteredBy, enemies).map(line => `被克制笔记：${line}`),
    ...relevantLines(note.counters, enemies).map(line => `克制笔记：${line}`),
    ...relevantLines(note.reviewRules.join('\n'), enemies).map(line => `复盘规则：${line}`),
  ]
}

function buildDataMatchupNotes(hero: string, enemies: string[], cache: HeroMatchupCache | null): string[] {
  const dynamic = enemies
    .map(enemy => ({ enemy, stats: cache?.matchups[hero]?.[enemy] }))
    .filter((item): item is { enemy: string; stats: NonNullable<HeroMatchupCache['matchups'][string][string]> } => Boolean(item.stats))
    .sort((a, b) => a.stats.advantage - b.stats.advantage)
    .map(({ enemy, stats }) => {
      const sign = stats.advantage >= 0 ? '+' : ''
      const source = cache?.source === 'stratz' ? 'Stratz' : 'OpenDota'
      const tone = stats.advantage < -2 ? '劣势' : stats.advantage > 2 ? '优势' : '接近五五开'
      return `vs ${enemy}：${source} ${stats.gamesPlayed} 局，${tone} ${sign}${stats.advantage.toFixed(1)}%。`
    })

  if (dynamic.length > 0) return dynamic

  return enemies.flatMap(enemy => {
    const good = STATIC_COUNTERS[hero]?.[enemy]
    const bad = STATIC_COUNTERED[hero]?.[enemy]
    return [
      good !== undefined && `vs ${enemy}：本地表显示你对其有优势 +${good.toFixed(1)}。`,
      bad !== undefined && `vs ${enemy}：本地表显示这是风险对位 -${bad.toFixed(1)}。`,
    ].filter((value): value is string => Boolean(value))
  })
}

export default function PreGame() {
  const navigate = useNavigate()
  const location = useLocation()
  const { appState } = useAppState()
  const { cycles } = useCycles()
  const { heroNotes } = useHeroNotes()
  const { setups } = usePreGameSetups()
  const [matchupCache, setMatchupCache] = useState<HeroMatchupCache | null>(null)

  const stateSetup = (location.state as { setup?: PreGameSetup } | null)?.setup
  const pendingSetup = setups.find(item => item.id === appState?.pendingPreGameSetupId)
  const setup = stateSetup ?? pendingSetup

  useEffect(() => {
    let cancelled = false
    window.electronStore.getHeroMatchupCache()
      .then(cache => {
        if (!cancelled) setMatchupCache(cache)
      })
      .catch(() => undefined)
    return () => { cancelled = true }
  }, [])

  const activeCycle = cycles.find(cycle => cycle.cycleId === appState?.activeCycleId)
  const currentWeek = activeCycle ? getCurrentWeek(activeCycle) : 0
  const weekTheme = activeCycle?.weekThemes.find(item => item.week === currentWeek)

  const hero = setup?.hero ?? ''
  const heroNote = heroNotes.find(note => note.hero === hero)
  const enemyByPosition: EnemyByPosition = setup?.enemyByPosition ?? {
    ...(setup?.enemyCarry && { '1': setup.enemyCarry }),
    ...(setup?.enemySupports?.[0] && { '4': setup.enemySupports[0] }),
    ...(setup?.enemySupports?.[1] && { '5': setup.enemySupports[1] }),
  }
  const enemies = POSITIONS.map(position => enemyByPosition[position]).filter((value): value is string => Boolean(value))
  const heroNoteItems = buildHeroNoteItems(heroNote)
  const userMatchupNotes = buildUserMatchupNotes(heroNote, enemies)
  const dataMatchupNotes = hero ? buildDataMatchupNotes(hero, enemies, matchupCache) : []

  const counteredByFallback = heroNote?.counteredBy?.trim()
    ? [`完整被克制笔记：${heroNote.counteredBy.trim()}`]
    : []

  if (!setup) {
    return (
      <div className="mx-auto max-w-3xl space-y-4 p-6">
        <button type="button" onClick={() => navigate(-1)} className="mb-3 text-xs text-[var(--text-muted)] hover:text-[var(--text-secondary)]">← 返回</button>
        <Banner tone="warning">
          赛前提醒需要先在 Draft 助手里锁定英雄和敌方阵容。这个页面不再手动开始游戏，也不再重复选择英雄/目标。
        </Banner>
        <Button variant="primary" onClick={() => navigate('/draft')}>进入 Draft</Button>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      <div>
        <button type="button" onClick={() => navigate('/draft')} className="mb-3 text-xs text-[var(--text-muted)] hover:text-[var(--text-secondary)]">← 返回 Draft</button>
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <div className="mb-2 flex flex-wrap gap-2">
              <Badge tone="success">已锁定：{hero}</Badge>
              {setup.targetPosition && <Badge tone="accent">{POSITION_LABELS[setup.targetPosition]}</Badge>}
              {weekTheme && <Badge tone="neutral">第 {currentWeek} 周：{weekTheme.theme}</Badge>}
            </div>
            <h1 className="text-2xl font-bold text-[var(--text-primary)]">赛前提醒</h1>
            <p className="mt-1 text-sm text-[var(--text-muted)]">这里不再选英雄或训练目标，只展示 Draft 锁定后的英雄笔记和对位注意事项。</p>
          </div>
          <Button variant="secondary" onClick={() => navigate('/post-game')}>稍后记录赛后</Button>
        </div>
      </div>

      <Card className="p-5">
        <div className="mb-3 text-sm font-semibold text-[var(--text-primary)]">敌方阵容</div>
        <div className="grid gap-2 sm:grid-cols-5">
          {POSITIONS.map(position => (
            <div key={position} className="rounded-lg border border-[var(--border)] bg-[var(--surface-1)] p-3">
              <div className="text-xs text-[var(--text-muted)]">{POSITION_LABELS[position]}</div>
              <div className="mt-1 text-sm font-semibold text-[var(--text-primary)]">{enemyByPosition[position] ?? '未知'}</div>
            </div>
          ))}
        </div>
      </Card>

      <section className="grid gap-4 lg:grid-cols-2">
        <FieldList title="英雄笔记提醒" items={heroNoteItems} empty="这个英雄还没有维护档案。建议赛后到英雄中心补一条。" />
        <FieldList
          title="用户维护的对位注意事项"
          items={userMatchupNotes.length > 0 ? userMatchupNotes : counteredByFallback}
          empty="没有匹配到敌方英雄的个人对位笔记。counteredBy / counters 字段是自由文本，可以写“英雄名：具体打法提醒”。"
        />
      </section>

      <FieldList
        title="数据对位提示"
        items={dataMatchupNotes}
        empty="当前阵容没有可用 matchup 数据；可以先依赖英雄笔记，赛后再补充具体对位经验。"
      />

      <Banner tone="info">
        counteredBy 不是只能填英雄名；当前 schema 里它是自由文本。推荐格式：每行一个英雄或场景，例如“帕克：跳前先确认相位/沉默状态”。这样赛前页可以按敌方阵容自动命中并展示。
      </Banner>
    </div>
  )
}
