import React, { useEffect, useMemo, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useAppState, useCycles, useHeroNotes, usePreGameSetups } from '../store/useStore.ts'
import Card from '../components/ui/Card.tsx'
import Badge from '../components/ui/Badge.tsx'
import Button from '../components/ui/Button.tsx'
import Banner from '../components/ui/Banner.tsx'
import { getCounters, getCountered } from '../utils/heroes.ts'
import { getCurrentWeek } from '../utils/cycle.ts'
import { getDisplayHeroName, sameHeroReference } from '../utils/heroIdentity.ts'
import { createTranslator, useLanguage, useT } from '../i18n/index.ts'
import type { Language, Translate } from '../i18n/index.ts'

const defaultT = createTranslator('zh')
import type { DotaPosition, EnemyByPosition, HeroMatchupCache, HeroNote, PreGameSetup } from '../types'

const POSITIONS: DotaPosition[] = ['1', '2', '3', '4', '5']
const STATIC_COUNTERS = getCounters()
const STATIC_COUNTERED = getCountered()

function splitNoteLines(value?: string): string[] {
  return (value ?? '')
    .split(/[\n；;]+/)
    .map(item => item.trim())
    .filter(Boolean)
}

function FieldList({ title, items, empty }: { title: string; items: string[]; empty: string }) {
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-1)] p-4">
      <div className="text-sm font-semibold text-[var(--text-primary)]">{title}</div>
      {items.length > 0 ? (
        <ul className="mt-2 space-y-1 text-sm leading-6 text-[var(--text-secondary)]">
          {items.map(item => <li key={item}>• {item}</li>)}
        </ul>
      ) : (
        <div className="mt-2 text-sm text-[var(--text-muted)]">{empty}</div>
      )}
    </div>
  )
}

export function buildHeroNoteItems(note?: Partial<HeroNote>, t: Translate = defaultT): string[] {
  if (!note) return []
  const reviewRules = Array.isArray(note.reviewRules) ? note.reviewRules : []
  return [
    note.laneGoal && t('preGame.laneGoalLabel', { value: note.laneGoal }),
    note.firstKeyItem && t('preGame.firstKeyItemLabel', { value: note.firstKeyItem }),
    note.strongPeriod && t('preGame.strongPeriodLabel', { value: note.strongPeriod }),
    note.weakPeriod && t('preGame.weakPeriodLabel', { value: note.weakPeriod }),
    note.commonDeaths && t('preGame.commonDeathsLabel', { value: note.commonDeaths }),
    note.whenToFight && t('preGame.whenToFightLabel', { value: note.whenToFight }),
    note.whenToFarm && t('preGame.whenToFarmLabel', { value: note.whenToFarm }),
    ...splitNoteLines(reviewRules.join('\n')).map(rule => t('preGame.reviewRuleLabel', { value: rule })),
  ].filter((value): value is string => Boolean(value && value.trim()))
}

function relevantLines(value: string | undefined, enemies: string[]): string[] {
  const lines = splitNoteLines(value)
  const matched = lines.filter(line => enemies.some(enemy => line.includes(enemy)))
  return matched.length > 0 ? matched : []
}

export function buildUserMatchupNotes(note: Partial<HeroNote> | undefined, enemies: string[], t: Translate = defaultT, language: Language = 'zh'): string[] {
  if (!note) return []
  const reviewRules = Array.isArray(note.reviewRules) ? note.reviewRules : []
  const structured = enemies.flatMap(enemy => {
    const item = note.matchupNotes?.[enemy]
    if (!item?.note?.trim()) return []
    const label = item.stance === 'counteredBy' ? t('preGame.stanceCounteredBy') : item.stance === 'counters' ? t('preGame.stanceCounters') : t('preGame.stanceNote')
    return [t('preGame.matchupNoteLine', { label, enemy: getDisplayHeroName(enemy, language), note: item.note })]
  })

  return [
    ...structured,
    ...relevantLines(note.counteredBy, enemies).map(line => t('preGame.counteredByNoteLabel', { value: line })),
    ...relevantLines(note.counters, enemies).map(line => t('preGame.countersNoteLabel', { value: line })),
    ...relevantLines(reviewRules.join('\n'), enemies).map(line => t('preGame.reviewRuleLabel', { value: line })),
  ]
}

function buildDataMatchupNotes(hero: string, enemies: string[], cache: Partial<HeroMatchupCache> | null, t: Translate, language: Language): string[] {
  const heroMatchups = cache?.matchups?.[hero] ?? {}
  const dynamic = enemies
    .map(enemy => ({ enemy, stats: heroMatchups[enemy] }))
    .filter((item): item is { enemy: string; stats: NonNullable<HeroMatchupCache['matchups'][string][string]> } => Boolean(item.stats))
    .sort((a, b) => a.stats.advantage - b.stats.advantage)
    .map(({ enemy, stats }) => {
      const sign = stats.advantage >= 0 ? '+' : ''
      const source = cache?.source === 'stratz' ? 'Stratz' : 'OpenDota'
      const tone = stats.advantage < -2 ? t('preGame.dataToneBad') : stats.advantage > 2 ? t('preGame.dataToneGood') : t('preGame.dataToneEven')
      return t('preGame.dataMatchupLine', { enemy: getDisplayHeroName(enemy, language), source, games: stats.gamesPlayed, tone, sign, value: stats.advantage.toFixed(1) })
    })

  if (dynamic.length > 0) return dynamic

  return enemies.flatMap(enemy => {
    const good = STATIC_COUNTERS[hero]?.[enemy]
    const bad = STATIC_COUNTERED[hero]?.[enemy]
    return [
      good !== undefined && t('preGame.staticAdvantageLine', { enemy: getDisplayHeroName(enemy, language), value: good.toFixed(1) }),
      bad !== undefined && t('preGame.staticRiskLine', { enemy: getDisplayHeroName(enemy, language), value: bad.toFixed(1) }),
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
  const t = useT()
  const language = useLanguage()

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
  const heroNote = setup ? heroNotes.find(note => sameHeroReference(note, setup)) : undefined
  const enemyByPosition: EnemyByPosition = setup?.enemyByPosition ?? {
    ...(setup?.enemyCarry && { '1': setup.enemyCarry }),
    ...(setup?.enemySupports?.[0] && { '4': setup.enemySupports[0] }),
    ...(setup?.enemySupports?.[1] && { '5': setup.enemySupports[1] }),
  }
  const enemies = POSITIONS.map(position => enemyByPosition[position]).filter((value): value is string => Boolean(value))
  const heroNoteItems = useMemo(() => buildHeroNoteItems(heroNote, t), [heroNote, t])
  const userMatchupNotes = useMemo(() => buildUserMatchupNotes(heroNote, enemies, t, language), [heroNote, enemies, t, language])
  const dataMatchupNotes = hero ? buildDataMatchupNotes(hero, enemies, matchupCache, t, language) : []

  const counteredByFallback = heroNote?.counteredBy?.trim()
    ? [t('preGame.fullCounteredByLabel', { value: heroNote.counteredBy.trim() })]
    : []

  if (!setup) {
    return (
      <div className="mx-auto max-w-3xl space-y-4 p-6">
        <button type="button" onClick={() => navigate(-1)} className="mb-3 text-xs text-[var(--text-muted)] hover:text-[var(--text-secondary)]">{t('common.back')}</button>
        <Banner tone="warning">
          {t('preGame.noSetupWarning')}
        </Banner>
        <Button variant="primary" onClick={() => navigate('/draft')}>{t('appShell.enterDraft')}</Button>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      <div>
        <button type="button" onClick={() => navigate('/draft')} className="mb-3 text-xs text-[var(--text-muted)] hover:text-[var(--text-secondary)]">{t('preGame.backToDraft')}</button>
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <div className="mb-2 flex flex-wrap gap-2">
              <Badge tone="success">{t('preGame.lockedInBadge', { hero: getDisplayHeroName(hero, language) })}</Badge>
              {setup.targetPosition && <Badge tone="accent">{t('draft.positionLabel', { n: setup.targetPosition })}</Badge>}
              {weekTheme && <Badge tone="neutral">{t('preGame.weekBadge', { week: currentWeek, theme: weekTheme.theme })}</Badge>}
            </div>
            <h1 className="text-2xl font-bold text-[var(--text-primary)]">{t('preGame.title')}</h1>
            <p className="mt-1 text-sm text-[var(--text-muted)]">{t('preGame.subtitle')}</p>
          </div>
          <Button variant="secondary" onClick={() => navigate('/post-game')}>{t('preGame.logPostGameLater')}</Button>
        </div>
      </div>

      <Card className="p-5">
        <div className="mb-3 text-sm font-semibold text-[var(--text-primary)]">{t('preGame.enemyLineupTitle')}</div>
        <div className="grid gap-2 sm:grid-cols-5">
          {POSITIONS.map(position => (
            <div key={position} className="rounded-lg border border-[var(--border)] bg-[var(--surface-1)] p-3">
              <div className="text-xs text-[var(--text-muted)]">{t('draft.positionLabel', { n: position })}</div>
              <div className="mt-1 text-sm font-semibold text-[var(--text-primary)]">{enemyByPosition[position] ? getDisplayHeroName(enemyByPosition[position], language) : t('preGame.unknownEnemy')}</div>
            </div>
          ))}
        </div>
      </Card>

      <section className="grid gap-4 lg:grid-cols-2">
        <FieldList title={t('preGame.heroNoteRemindersTitle')} items={heroNoteItems} empty={t('preGame.heroNoteRemindersEmpty')} />
        <FieldList
          title={t('preGame.userMatchupNotesTitle')}
          items={userMatchupNotes.length > 0 ? userMatchupNotes : counteredByFallback}
          empty={t('preGame.userMatchupNotesEmpty')}
        />
      </section>

      <FieldList
        title={t('preGame.dataMatchupHintsTitle')}
        items={dataMatchupNotes}
        empty={t('preGame.dataMatchupHintsEmpty')}
      />

      <Banner tone="info">
        {t('preGame.footerBanner')}
      </Banner>
    </div>
  )
}
