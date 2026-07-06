import React, { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { nanoid } from 'nanoid'
import { useAppState, useHeroNotes, useMatchLogs, useCycles } from '../store/useStore.ts'
import HeroSelector from '../components/HeroSelector.tsx'
import QuickSelect from '../components/QuickSelect.tsx'
import { getReviewDimensions } from '../data/reviewDimensions.ts'
import type { HeroMatchupNote, HeroNote, MatchLog, PreGameSetup, OpenDotaImportedMatch, OpenDotaRecentMatch, TrainingDimension } from '../types'
import { FOCUS_OPTIONS_BY_DIMENSION, FOCUS_OPTIONS_BY_LANE_RESULT, FOCUS_OPTIONS_BY_WEEK, compactMistake, compactPreviousFocus, getHeroFocusOptions, getHeroNoteFocusOptions, uniqueOptions, type LaneResult } from '../features/postgame/focusSuggestions.ts'
import { buildPostGameMatchLog } from '../features/postgame/matchLogBuilder.ts'
import SrsReviewPrompt from '../features/postgame/SrsReviewPrompt.tsx'
import OpenDotaImportPanel from '../features/postgame/OpenDotaImportPanel.tsx'
import { getCurrentWeek, todayStr } from '../utils/cycle.ts'
import { getOpenDotaHeroName } from '../utils/opendotaHeroes.ts'
import { getDisplayHeroName, getHeroIdByName, sameHeroReference } from '../utils/heroIdentity.ts'
import { isDueForReview } from '../utils/srs.ts'
import { formatOpenDotaErrorMessage, isOpenDotaParseRequestCandidate, normalizeOpenDotaError, createOpenDotaError } from '../utils/openDotaErrors.ts'
import { useLanguage, useT } from '../i18n/index.ts'

const OPEN_DOTA_ANALYZE_INITIAL_WAIT_MS = 120_000
const OPEN_DOTA_ANALYZE_POLL_INTERVAL_MS = 30_000
const OPEN_DOTA_ANALYZE_MAX_WAIT_MS = 300_000
const OPEN_DOTA_ANALYZE_POLL_ATTEMPTS = Math.floor((OPEN_DOTA_ANALYZE_MAX_WAIT_MS - OPEN_DOTA_ANALYZE_INITIAL_WAIT_MS) / OPEN_DOTA_ANALYZE_POLL_INTERVAL_MS) + 1

function wait(ms: number): Promise<void> {
  return new Promise(resolve => window.setTimeout(resolve, ms))
}

export function isOpenDotaParsePendingError(error: unknown): boolean {
  return isOpenDotaParseRequestCandidate(error)
}

export function buildMatchupTargets(selectedHero: string, pendingSetup: PreGameSetup | null, importedMatch: OpenDotaImportedMatch | null): string[] {
  const rawTargets = [
    ...(pendingSetup ? Object.values(pendingSetup.enemyByPosition ?? {}) : []),
    pendingSetup?.enemyCarry,
    ...(pendingSetup?.enemySupports ?? []),
    ...(importedMatch?.enemyHeroes ?? []),
  ]

  return rawTargets
    .filter((value): value is string => Boolean(value && value !== selectedHero))
    .filter((value, index, array) => array.indexOf(value) === index)
}

export default function PostGame() {
  const navigate = useNavigate()
  const { appState } = useAppState()
  const { matchLogs, add: addMatchLogEntry } = useMatchLogs()
  const { heroNotes, upsert: upsertHeroNote } = useHeroNotes()
  const { cycles } = useCycles()
  const t = useT()
  const language = useLanguage()
  const REVIEW_DIMENSIONS = getReviewDimensions(language)

  // 必填字段
  const [hero, setHero] = useState('')
  const [result, setResult] = useState<'win' | 'loss' | ''>('')
  const [durationMin, setDurationMin] = useState('')
  const [trainingGoalMet, setTrainingGoalMet] = useState<'yes' | 'partial' | 'no' | ''>('')
  const [biggestMistake, setBiggestMistake] = useState('')
  const [reviewDimension, setReviewDimension] = useState<TrainingDimension | ''>('')
  const [reviewTopic, setReviewTopic] = useState('')
  const [nextGameFocus, setNextGameFocus] = useState('')

  // 选填字段
  const [showOptional, setShowOptional] = useState(false)
  const [worstDeathZone, setWorstDeathZone] = useState<'green' | 'orange' | 'red' | ''>('')
  const [laneResult, setLaneResult] = useState<'dominated' | 'even' | 'lost' | ''>('')
  const [firstKeyItemMin, setFirstKeyItemMin] = useState('')
  const [goodInitiations, setGoodInitiations] = useState('')
  const [draftScore, setDraftScore] = useState<1 | 2 | 3 | 4 | 5 | 0>(0)
  const [csAt10, setCsAt10] = useState('')
  const [matchId, setMatchId] = useState('')
  const [notes, setNotes] = useState('')
  const [reviewClipDeath, setReviewClipDeath] = useState('')
  const [reviewClipFight, setReviewClipFight] = useState('')
  const [reviewClipObjective, setReviewClipObjective] = useState('')

  const [pendingSetup, setPendingSetup] = useState<PreGameSetup | null>(null)
  const [saving, setSaving] = useState(false)
  const [importingOpenDota, setImportingOpenDota] = useState(false)
  const [autoImportingOpenDota, setAutoImportingOpenDota] = useState(false)
  const [analyzingOpenDota, setAnalyzingOpenDota] = useState(false)
  const [openDotaStatus, setOpenDotaStatus] = useState('')
  const [canRequestParse, setCanRequestParse] = useState(false)
  const [importedMatch, setImportedMatch] = useState<OpenDotaImportedMatch | null>(null)
  const [recentMatches, setRecentMatches] = useState<OpenDotaRecentMatch[]>([])
  const [loadingRecentMatches, setLoadingRecentMatches] = useState(false)
  const [autoImportAttempted, setAutoImportAttempted] = useState(false)
  const [srsPromptNotes, setSrsPromptNotes] = useState<HeroNote[]>([])
  const [saveStatus, setSaveStatus] = useState('')
  const [matchupNoteDrafts, setMatchupNoteDrafts] = useState<Record<string, string>>({})
  const [matchupNoteStances, setMatchupNoteStances] = useState<Record<string, HeroMatchupNote['stance']>>({})
  const openDotaAnalysisRunRef = useRef(0)

  useEffect(() => {
    return () => {
      openDotaAnalysisRunRef.current += 1
    }
  }, [])

  // 加载 pending 赛前设定
  useEffect(() => {
    if (!appState?.pendingPreGameSetupId) return
    window.electronStore.getPreGameSetups().then(setups => {
      const s = setups.find(s => s.id === appState.pendingPreGameSetupId)
      if (s) {
        setPendingSetup(s)
        if (!hero) setHero(s.hero)
      }
    })
  }, [appState?.pendingPreGameSetupId])

  // 取消关联：这局记录的是别的对局，不想让赛前设定继续绑在这次赛后记录上
  const handleUnlinkPreGameSetup = async () => {
    setPendingSetup(null)
    await window.electronStore.setAppState({ pendingPreGameSetupId: undefined })
  }

  // 快速选项
  const activeCycle = cycles.find(c => c.cycleId === appState?.activeCycleId)
  const currentWeek = activeCycle ? getCurrentWeek(activeCycle) : 0
  const lastMatch = [...matchLogs].sort((a, b) => b.timestamp - a.timestamp)[0]
  const selectedHero = hero.trim()
  const lastSameHeroMatch = selectedHero
    ? [...matchLogs]
      .filter(log => sameHeroReference(log, { hero: selectedHero }) && Boolean(log.nextGameFocus?.trim()))
      .sort((a, b) => b.timestamp - a.timestamp)[0]
    : undefined

  const heroPool = appState?.heroPool.filter(h => h.active).map(h => h.name) ?? []
  const selectedReviewDimension = REVIEW_DIMENSIONS.find(item => item.id === reviewDimension)
  const selectedHeroNote = selectedHero ? heroNotes.find(note => sameHeroReference(note, { hero: selectedHero })) : undefined
  const matchupTargets = buildMatchupTargets(selectedHero, pendingSetup, importedMatch)
  const previousHeroFocus = compactPreviousFocus(lastSameHeroMatch?.nextGameFocus)
  const quickFocusOptions = uniqueOptions([
    previousHeroFocus,
    ...getHeroNoteFocusOptions(selectedHeroNote),
    ...getHeroFocusOptions(hero, importedMatch?.firstKeyItemName),
    ...(reviewDimension ? FOCUS_OPTIONS_BY_DIMENSION[reviewDimension] : []),
    ...(laneResult ? FOCUS_OPTIONS_BY_LANE_RESULT[laneResult as LaneResult] : []),
    ...(FOCUS_OPTIONS_BY_WEEK[currentWeek] ?? []),
    compactMistake(biggestMistake),
    compactMistake(lastMatch?.biggestMistake),
    t('postGame.lastFocusPractice'),
  ])

  const canSave =
    hero.trim() &&
    result &&
    durationMin &&
    !isNaN(parseInt(durationMin, 10)) &&
    trainingGoalMet &&
    biggestMistake.trim() &&
    nextGameFocus.trim()

  const shouldOfferParseRequest = (error: unknown): boolean => isOpenDotaParsePendingError(error)

  const handleMatchIdChange = (value: string) => {
    setMatchId(value)
    setCanRequestParse(false)
    if (importedMatch?.matchId !== value.trim()) setImportedMatch(null)
  }

  const appendMatchupLine = (value: string, opponent: string, note: string): string => {
    const line = `${opponent}：${note}`
    const lines = value.split('\n').map(item => item.trim()).filter(Boolean)
    const withoutOld = lines.filter(item => !item.startsWith(`${opponent}：`) && !item.startsWith(`${opponent}:`))
    return [...withoutOld, line].join('\n')
  }

  const saveMatchupNotesToHeroProfile = async (logId: string) => {
    const cleanHero = hero.trim()
    if (!cleanHero) return
    const entries = Object.entries(matchupNoteDrafts)
      .map(([opponentHero, value]) => ({ opponentHero, note: value.trim(), stance: matchupNoteStances[opponentHero] ?? 'general' as const }))
      .filter(item => item.note)
    if (entries.length === 0) return

    const existing = heroNotes.find(note => sameHeroReference(note, { hero: cleanHero }))
    const now = Date.now()
    const nextNote: HeroNote = {
      hero: cleanHero,
      ...(getHeroIdByName(cleanHero) !== undefined && { heroId: getHeroIdByName(cleanHero) }),
      position: existing?.position ?? '',
      strongPeriod: existing?.strongPeriod ?? '',
      weakPeriod: existing?.weakPeriod ?? '',
      laneGoal: existing?.laneGoal ?? '',
      firstKeyItem: existing?.firstKeyItem ?? '',
      counters: existing?.counters ?? '',
      counteredBy: existing?.counteredBy ?? '',
      whenToFight: existing?.whenToFight ?? '',
      whenToFarm: existing?.whenToFarm ?? '',
      commonDeaths: existing?.commonDeaths ?? '',
      reviewRules: existing?.reviewRules ?? [],
      matchupNotes: { ...(existing?.matchupNotes ?? {}) },
      srsEase: existing?.srsEase,
      srsIntervalDays: existing?.srsIntervalDays,
      srsNextReviewDate: existing?.srsNextReviewDate,
      srsLastRating: existing?.srsLastRating,
      updatedAt: now,
    }

    for (const entry of entries) {
      nextNote.matchupNotes![entry.opponentHero] = {
        opponentHero: entry.opponentHero,
        ...(getHeroIdByName(entry.opponentHero) !== undefined && { opponentHeroId: getHeroIdByName(entry.opponentHero) }),
        note: entry.note,
        stance: entry.stance,
        updatedAt: now,
        source: 'postgame',
        lastMatchId: logId,
      }
      if (entry.stance === 'counteredBy') {
        nextNote.counteredBy = appendMatchupLine(nextNote.counteredBy, entry.opponentHero, entry.note)
      } else if (entry.stance === 'counters') {
        nextNote.counters = appendMatchupLine(nextNote.counters, entry.opponentHero, entry.note)
      }
    }

    await upsertHeroNote(nextNote)
  }

  const handleSave = async () => {
    if (!canSave || saving) return
    setSaving(true)
    try {
      const currentAppState = await window.electronStore.getAppState()
      const cleanMatchId = matchId.trim()
      if (cleanMatchId && matchLogs.some(l => l.matchId === cleanMatchId)) {
        window.alert(t('postGame.duplicateMatchIdAlert'))
        return
      }
      const logId = nanoid() // ✅ 先生成 id，在对象创建前

      const log: MatchLog = buildPostGameMatchLog({
        id: logId,
        activeCycleId: currentAppState.activeCycleId,
        hero,
        result: result as 'win' | 'loss',
        durationMin,
        trainingGoalMet: trainingGoalMet as 'yes' | 'partial' | 'no',
        biggestMistake,
        nextGameFocus,
        reviewDimension,
        reviewTopic,
        worstDeathZone,
        laneResult,
        firstKeyItemMin,
        goodInitiations,
        draftScore,
        csAt10,
        cleanMatchId,
        importedMatch,
        pendingSetup,
        notes,
        reviewClipDeath,
        reviewClipFight,
        reviewClipObjective,
      })

      // 关联赛前设定
      if (currentAppState.pendingPreGameSetupId) {
        log.preGameSetupId = currentAppState.pendingPreGameSetupId
        await window.electronStore.updatePreGameSetup(
          currentAppState.pendingPreGameSetupId,
          { linkedMatchId: logId } // ✅ logId 此时已有正确值
        )
        await window.electronStore.setAppState({ pendingPreGameSetupId: undefined })
      }

      const { added } = await addMatchLogEntry(log)
      if (!added) {
        window.alert(t('postGame.duplicateMatchIdAlert'))
        return
      }
      await saveMatchupNotesToHeroProfile(logId)
      const relatedHeroNames = new Set([log.hero, ...(log.enemyHeroes ?? []), ...(log.enemySupports ?? []), log.enemyCarry].filter((value): value is string => Boolean(value)))
      const relatedHeroIds = new Set([log.heroId, ...(log.enemyHeroIds ?? []), ...(log.enemySupportHeroIds ?? []), log.enemyCarryHeroId].filter((value): value is number => value !== undefined))
      const dueNotes = heroNotes.filter(note => (relatedHeroIds.has(note.heroId ?? -1) || relatedHeroNames.has(note.hero)) && isDueForReview(note, todayStr()))
      if (dueNotes.length > 0) {
        setSrsPromptNotes(dueNotes)
        setSaveStatus(t('postGame.savedWithDueNotes'))
      } else {
        navigate('/')
      }
    } finally {
      setSaving(false)
    }
  }

  const handleImportOpenDota = async () => {
    const cleanMatchId = matchId.trim()
    if (!cleanMatchId) {
      setOpenDotaStatus(t('postGame.matchIdRequired'))
      return
    }
    if (matchLogs.some(l => l.matchId === cleanMatchId)) {
      setOpenDotaStatus(t('postGame.matchIdAlreadyRecorded'))
      return
    }

    setImportingOpenDota(true)
    setOpenDotaStatus('')
    setCanRequestParse(false)
    try {
      const data = await window.electronStore.importOpenDotaMatch(cleanMatchId)
      applyImportedOpenDota(data)
    } catch (e) {
      setImportedMatch(null)
      setCanRequestParse(shouldOfferParseRequest(e))
      setOpenDotaStatus(formatOpenDotaErrorMessage(e))
    } finally {
      setImportingOpenDota(false)
    }
  }

  const handleAutoImportOpenDota = async (silent = false) => {
    if (autoImportingOpenDota || importingOpenDota || analyzingOpenDota || importedMatch) return
    if (!appState?.openDota?.accountId?.trim()) {
      if (!silent) setOpenDotaStatus(t('postGame.accountIdRequired'))
      return
    }

    setAutoImportingOpenDota(true)
    setCanRequestParse(false)
    if (!silent) setOpenDotaStatus(t('postGame.autoSyncing'))
    try {
      const existingMatchIds = matchLogs.map(log => log.matchId).filter((id): id is string => Boolean(id))
      const data = await window.electronStore.autoImportLatestOpenDotaMatch(existingMatchIds)
      applyImportedOpenDota(data)
    } catch (e) {
      const normalized = normalizeOpenDotaError(e)
      setImportedMatch(null)
      if (!silent || normalized.code !== 'ACCOUNT_REQUIRED') setOpenDotaStatus(normalized.message)
    } finally {
      setAutoImportingOpenDota(false)
    }
  }

  const handleLoadRecentOpenDotaMatches = async () => {
    if (!appState?.openDota?.accountId?.trim()) {
      setOpenDotaStatus(t('postGame.accountIdRequired'))
      return
    }
    setLoadingRecentMatches(true)
    setOpenDotaStatus(t('postGame.fetchingRecent'))
    try {
      const existingMatchIds = matchLogs.map(log => log.matchId).filter((id): id is string => Boolean(id))
      const rows = await window.electronStore.getRecentOpenDotaMatches(existingMatchIds)
      setRecentMatches(rows)
      setOpenDotaStatus(rows.length ? t('postGame.fetchedRecent') : t('postGame.noRecentMatches'))
    } catch (e) {
      setRecentMatches([])
      setOpenDotaStatus(e instanceof Error ? e.message : String(e))
    } finally {
      setLoadingRecentMatches(false)
    }
  }

  const handleImportRecentMatch = async (row: OpenDotaRecentMatch) => {
    if (row.recorded || matchLogs.some(l => l.matchId === row.matchId)) {
      setOpenDotaStatus(t('postGame.matchAlreadyRecorded'))
      return
    }
    setMatchId(row.matchId)
    setImportingOpenDota(true)
    setCanRequestParse(false)
    setOpenDotaStatus(t('postGame.importingRow', { name: row.heroName ? getDisplayHeroName(row.heroName, language) : t('postGame.importingRowFallback') }))
    try {
      const data = await window.electronStore.importOpenDotaMatch(row.matchId)
      applyImportedOpenDota(data)
    } catch (e) {
      setImportedMatch(null)
      setCanRequestParse(shouldOfferParseRequest(e))
      setOpenDotaStatus(formatOpenDotaErrorMessage(e))
    } finally {
      setImportingOpenDota(false)
    }
  }

  const applyImportedOpenDota = (data: OpenDotaImportedMatch) => {
    setImportedMatch(data)
    setMatchId(data.matchId)
    setHero(getOpenDotaHeroName(data.heroId))
    setResult(data.result)
    setDurationMin(String(data.durationMin))
    if (data.csAt10 !== undefined) setCsAt10(String(data.csAt10))
    if (data.firstKeyItemMin !== undefined) setFirstKeyItemMin(String(data.firstKeyItemMin))
    if (data.laneResult) setLaneResult(data.laneResult)
    setShowOptional(true)

    const kda = [data.kills, data.deaths, data.assists]
      .map(v => v ?? '-')
      .join('/')
    const keyItem = data.firstKeyItemName && data.firstKeyItemMin
      ? t('postGame.keyItemSuffix', { item: data.firstKeyItemName, min: data.firstKeyItemMin })
      : ''
    const laneText = data.laneResult
      ? t('postGame.laneTextSuffix', { result: data.laneResult === 'dominated' ? t('common.laneDominated') : data.laneResult === 'even' ? t('common.laneEven') : t('common.laneLost') })
      : ''
    setOpenDotaStatus(t('postGame.importedStatus', {
      hero: getDisplayHeroName(getOpenDotaHeroName(data.heroId), language),
      result: data.result === 'win' ? t('postGame.win') : t('postGame.loss'),
      kda,
      lane: laneText,
      item: keyItem,
    }))
  }

  useEffect(() => {
    if (autoImportAttempted || importedMatch || matchId.trim()) return
    if (!appState?.openDota?.accountId?.trim()) return
    setAutoImportAttempted(true)
    handleAutoImportOpenDota(true)
  }, [autoImportAttempted, importedMatch, matchId, appState?.openDota?.accountId, matchLogs])

  const handleAnalyzeAndImportOpenDota = async () => {
    const cleanMatchId = matchId.trim()
    if (!cleanMatchId) {
      setOpenDotaStatus(t('postGame.matchIdRequired'))
      return
    }
    if (matchLogs.some(l => l.matchId === cleanMatchId)) {
      setOpenDotaStatus(t('postGame.matchIdAlreadyRecorded'))
      return
    }

    const runId = openDotaAnalysisRunRef.current + 1
    openDotaAnalysisRunRef.current = runId
    const isCurrentRun = () => openDotaAnalysisRunRef.current === runId

    setAnalyzingOpenDota(true)
    setOpenDotaStatus(t('postGame.analyzeSubmitting'))
    setCanRequestParse(false)
    try {
      await window.electronStore.requestOpenDotaParse(cleanMatchId)
      if (!isCurrentRun()) return
      setOpenDotaStatus(t('postGame.analyzeSubmitted'))
      await wait(OPEN_DOTA_ANALYZE_INITIAL_WAIT_MS)
      if (!isCurrentRun()) return

      let lastError: Error | null = null
      for (let attempt = 1; attempt <= OPEN_DOTA_ANALYZE_POLL_ATTEMPTS; attempt += 1) {
        if (!isCurrentRun()) return
        setOpenDotaStatus(t('postGame.analyzePolling', { attempt, total: OPEN_DOTA_ANALYZE_POLL_ATTEMPTS }))
        try {
          const data = await window.electronStore.importOpenDotaMatch(cleanMatchId)
          if (!isCurrentRun()) return
          applyImportedOpenDota(data)
          return
        } catch (error) {
          lastError = error instanceof Error ? error : new Error(String(error))
          if (!isOpenDotaParsePendingError(error)) throw lastError
          if (attempt < OPEN_DOTA_ANALYZE_POLL_ATTEMPTS) await wait(OPEN_DOTA_ANALYZE_POLL_INTERVAL_MS)
        }
      }

      throw lastError ?? createOpenDotaError('PARSE_PENDING', t('postGame.analyzeTimedOut'))
    } catch (e) {
      if (!isCurrentRun()) return
      setImportedMatch(null)
      setCanRequestParse(shouldOfferParseRequest(e))
      setOpenDotaStatus(formatOpenDotaErrorMessage(e))
    } finally {
      if (isCurrentRun()) setAnalyzingOpenDota(false)
    }
  }

  const inputCls = "w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--surface-1)] text-[var(--text-primary)] text-sm focus:outline-none focus:border-[var(--accent-border)]"
  const btnBase = "px-4 py-2 rounded-lg text-sm font-medium border transition-all"
  const btnActive = "border-[var(--accent-border)] bg-[var(--accent-muted)] text-[var(--accent-strong)]"
  const btnInactive = "border-[var(--border)] bg-[var(--surface-1)] text-[var(--text-secondary)] hover:border-[var(--accent-border)]"

  return (
    <div className="p-6 space-y-6 max-w-lg mx-auto pb-24">
      {saveStatus && (
        <div className="rounded-xl border border-[var(--border-info)] bg-[var(--bg-info)] p-4 text-sm text-[var(--text-info)]">
          {saveStatus}
        </div>
      )}

      <SrsReviewPrompt
        notes={srsPromptNotes}
        onSkip={() => navigate('/')}
        onOpenNote={heroName => navigate(`/hero-notes?hero=${encodeURIComponent(heroName)}&filter=due`)}
        onReviewed={heroName => setSrsPromptNotes(prev => prev.filter(item => item.hero !== heroName))}
        upsertHeroNote={upsertHeroNote}
      />
      <div>
        <button type="button" onClick={() => navigate(-1)} className="text-xs text-[var(--text-muted)] hover:text-[var(--text-secondary)] mb-3 flex items-center gap-1">
          {t('common.back')}
        </button>
        <h1 className="text-xl font-bold text-[var(--text-primary)]">{t('postGame.title')}</h1>
        {pendingSetup && (
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <p className="text-sm text-[var(--accent-strong)]">
              {t('postGame.linkedSetup', { hero: getDisplayHeroName(pendingSetup.hero, language) })}
              {pendingSetup.targetPosition ? t('postGame.positionSuffix', { position: pendingSetup.targetPosition }) : ''}
              {pendingSetup.trainingGoal ? t('postGame.goalSuffix', { goal: pendingSetup.trainingGoal }) : ''}
              {pendingSetup.enemyCarry ? t('postGame.enemyCarrySuffix', { enemy: getDisplayHeroName(pendingSetup.enemyCarry, language) }) : ''}
            </p>
            <button
              type="button"
              onClick={handleUnlinkPreGameSetup}
              className="text-xs text-[var(--text-muted)] underline hover:text-[var(--text-secondary)]"
            >
              {t('postGame.unlinkSetup')}
            </button>
          </div>
        )}
      </div>

      <OpenDotaImportPanel
        dataSourceLabel={appState?.stratz?.apiKey?.trim() ? 'Stratz' : 'OpenDota'}
        matchId={matchId}
        importedMatch={importedMatch}
        recentMatches={recentMatches}
        openDotaStatus={openDotaStatus}
        canRequestParse={canRequestParse}
        importingOpenDota={importingOpenDota}
        autoImportingOpenDota={autoImportingOpenDota}
        analyzingOpenDota={analyzingOpenDota}
        loadingRecentMatches={loadingRecentMatches}
        inputCls={inputCls}
        onMatchIdChange={handleMatchIdChange}
        onImportOpenDota={handleImportOpenDota}
        onAutoImportOpenDota={() => handleAutoImportOpenDota(false)}
        onLoadRecentOpenDotaMatches={handleLoadRecentOpenDotaMatches}
        onImportRecentMatch={handleImportRecentMatch}
        onAnalyzeAndImportOpenDota={handleAnalyzeAndImportOpenDota}
      />

      {/* 必填：英雄 */}
      <HeroSelector
        label={t('postGame.heroFieldLabel')}
        value={hero}
        onChange={setHero}
        heroPool={heroPool.length > 0 ? heroPool : undefined}
      />

      {/* 必填：胜负 */}
      <div className="space-y-2">
        <label className="block text-xs font-medium text-[var(--text-muted)] uppercase tracking-wider">{t('postGame.resultLabel')}</label>
        <div className="flex gap-2">
          <button type="button" onClick={() => setResult('win')} className={`${btnBase} flex-1 ${result === 'win' ? 'border-green-500 bg-[var(--bg-success)] text-[var(--text-success)]' : btnInactive}`}>{t('postGame.win')}</button>
          <button type="button" onClick={() => setResult('loss')} className={`${btnBase} flex-1 ${result === 'loss' ? 'border-red-500 bg-[var(--bg-danger)] text-[var(--text-danger)]' : btnInactive}`}>{t('postGame.loss')}</button>
        </div>
      </div>

      {/* 必填：时长 */}
      <div className="space-y-2">
        <label className="block text-xs font-medium text-[var(--text-muted)] uppercase tracking-wider">{t('postGame.durationLabel')}</label>
        <input type="number" value={durationMin} onChange={e => setDurationMin(e.target.value)} placeholder={t('postGame.durationPlaceholder')} className={inputCls} />
      </div>

      {/* 必填：训练目标完成了吗 */}
      <div className="space-y-2">
        <label className="block text-xs font-medium text-[var(--text-muted)] uppercase tracking-wider">
          {t('postGame.goalMetLabel')}
          {pendingSetup && (
            <span className="ml-2 text-[var(--accent-strong)] font-normal normal-case">
              {t('postGame.goalMetPreGameHint', { hero: getDisplayHeroName(pendingSetup.hero, language) })}
              {pendingSetup.targetPosition ? t('postGame.positionSuffix', { position: pendingSetup.targetPosition }) : ''}
            </span>
          )}
        </label>
        <div className="flex gap-2">
          {(['yes', 'partial', 'no'] as const).map(v => (
            <button
              key={v}
              type="button"
              onClick={() => setTrainingGoalMet(v)}
              className={`${btnBase} flex-1 ${trainingGoalMet === v ? btnActive : btnInactive}`}
            >
              {v === 'yes' ? t('postGame.goalYes') : v === 'partial' ? t('postGame.goalPartial') : t('postGame.goalNo')}
            </button>
          ))}
        </div>
      </div>

      {/* 必填：最大错误 */}
      <div className="space-y-2">
        <label className="block text-xs font-medium text-[var(--text-muted)] uppercase tracking-wider">{t('postGame.mistakeLabel')}</label>
        <textarea
          value={biggestMistake}
          onChange={e => setBiggestMistake(e.target.value)}
          placeholder={t('postGame.mistakePlaceholder')}
          rows={2}
          className={`${inputCls} resize-none`}
        />
      </div>

      {/* 复盘归因 */}
      <div className="space-y-3">
        <label className="block text-xs font-medium text-[var(--text-muted)] uppercase tracking-wider">{t('postGame.reviewDimensionQuestion')}</label>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {REVIEW_DIMENSIONS.map(item => (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                setReviewDimension(item.id === reviewDimension ? '' : item.id)
                setReviewTopic('')
              }}
              className={`text-left px-3 py-2 rounded-lg border transition-all ${
                reviewDimension === item.id ? btnActive : btnInactive
              }`}
            >
              <span className="block text-sm font-medium">{item.label}</span>
              <span className="block text-xs opacity-80 mt-0.5">{item.description}</span>
            </button>
          ))}
        </div>
        {selectedReviewDimension && (
          <QuickSelect
            label={t('postGame.reviewTopicLabel')}
            options={selectedReviewDimension.topics}
            value={reviewTopic}
            onChange={setReviewTopic}
            placeholder={t('postGame.reviewTopicPlaceholder')}
          />
        )}
      </div>

      {/* 必填：下局改进点 */}
      <QuickSelect
        label={t('postGame.nextFocusLabel')}
        options={quickFocusOptions}
        value={nextGameFocus}
        onChange={setNextGameFocus}
        placeholder="自定义改进点…"
      />
      {lastSameHeroMatch && previousHeroFocus && (
        <p className="text-xs text-[var(--text-muted)] -mt-4">
          {t('postGame.previousFocusHint', { hero: getDisplayHeroName(selectedHero, language), focus: previousHeroFocus })}
          <span className="ml-1">（{new Date(lastSameHeroMatch.timestamp).toLocaleDateString(language === 'zh' ? 'zh-CN' : 'en-US')}）</span>
        </p>
      )}

      {/* P1：3 片段复盘 */}
      <div className="space-y-3 rounded-xl border border-[var(--border)] bg-[var(--surface-1)] p-4">
        <div>
          <h2 className="text-sm font-semibold text-[var(--text-primary)]">{t('postGame.clipSection')}</h2>
          <p className="mt-1 text-xs text-[var(--text-muted)]">{t('postGame.clipSectionDesc')}</p>
        </div>
        <label className="block space-y-1">
          <span className="block text-xs font-medium text-[var(--text-muted)]">{t('postGame.clipDeathLabel')}</span>
          <textarea value={reviewClipDeath} onChange={e => setReviewClipDeath(e.target.value)} placeholder={t('postGame.clipDeathPlaceholder')} rows={2} className={`${inputCls} resize-none`} />
        </label>
        <label className="block space-y-1">
          <span className="block text-xs font-medium text-[var(--text-muted)]">{t('postGame.clipFightLabel')}</span>
          <textarea value={reviewClipFight} onChange={e => setReviewClipFight(e.target.value)} placeholder={t('postGame.clipFightPlaceholder')} rows={2} className={`${inputCls} resize-none`} />
        </label>
        <label className="block space-y-1">
          <span className="block text-xs font-medium text-[var(--text-muted)]">{t('postGame.clipObjectiveLabel')}</span>
          <textarea value={reviewClipObjective} onChange={e => setReviewClipObjective(e.target.value)} placeholder={t('postGame.clipObjectivePlaceholder')} rows={2} className={`${inputCls} resize-none`} />
        </label>
      </div>

      {matchupTargets.length > 0 && (
        <div className="space-y-3 rounded-xl border border-[var(--border)] bg-[var(--surface-1)] p-4">
          <div>
            <h2 className="text-sm font-semibold text-[var(--text-primary)]">{t('postGame.matchupNotesSection')}</h2>
            <p className="mt-1 text-xs text-[var(--text-muted)]">{t('postGame.matchupNotesDesc')}</p>
          </div>
          <div className="space-y-3">
            {matchupTargets.map(opponent => (
              <div key={opponent} className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-3">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <div className="text-sm font-semibold text-[var(--text-primary)]">{t('postGame.matchupVsLine', { hero: selectedHero ? getDisplayHeroName(selectedHero, language) : t('postGame.currentHeroFallback'), opponent: getDisplayHeroName(opponent, language) })}</div>
                  <div className="flex gap-1">
                    {([
                      ['counteredBy', t('postGame.stanceCounteredBy')],
                      ['counters', t('postGame.stanceCounters')],
                      ['general', t('postGame.stanceGeneral')],
                    ] as Array<[NonNullable<HeroMatchupNote['stance']>, string]>).map(([stance, label]) => (
                      <button
                        key={stance}
                        type="button"
                        onClick={() => setMatchupNoteStances(prev => ({ ...prev, [opponent]: stance }))}
                        className={`rounded border px-2 py-1 text-xs ${
                          (matchupNoteStances[opponent] ?? 'general') === stance ? btnActive : btnInactive
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
                <textarea
                  value={matchupNoteDrafts[opponent] ?? ''}
                  onChange={e => setMatchupNoteDrafts(prev => ({ ...prev, [opponent]: e.target.value }))}
                  placeholder={t('postGame.matchupNotePlaceholder', { opponent: getDisplayHeroName(opponent, language) })}
                  rows={2}
                  className={`${inputCls} resize-none`}
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 选填折叠 */}
      <div>
        <button
          type="button"
          onClick={() => setShowOptional(o => !o)}
          className="w-full flex items-center justify-between px-4 py-2.5 rounded-lg border border-dashed border-[var(--border)] text-sm text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition-colors"
        >
          <span>{t('postGame.optionalToggleLabel')}</span>
          <span>{showOptional ? t('postGame.collapse') : t('postGame.expand')}</span>
        </button>

        {showOptional && (
          <div className="mt-3 space-y-4 px-1">
            {/* 死亡区域 */}
            <div className="space-y-2">
              <label className="block text-xs font-medium text-[var(--text-muted)] uppercase tracking-wider">{t('postGame.deathZoneLabel')}</label>
              <div className="flex gap-2">
                {(['green', 'orange', 'red'] as const).map(z => (
                  <button
                    key={z}
                    type="button"
                    onClick={() => setWorstDeathZone(z === worstDeathZone ? '' : z)}
                    className={`${btnBase} flex-1 ${worstDeathZone === z ? btnActive : btnInactive}`}
                  >
                    {z === 'green' ? t('common.zoneGreen') : z === 'orange' ? t('common.zoneOrange') : t('common.zoneRed')}
                  </button>
                ))}
              </div>
            </div>

            {/* 对线结果 */}
            <div className="space-y-2">
              <label className="block text-xs font-medium text-[var(--text-muted)] uppercase tracking-wider">{t('postGame.laneResultLabel')}</label>
              <div className="flex gap-2">
                {(['dominated', 'even', 'lost'] as const).map(lr => (
                  <button
                    key={lr}
                    type="button"
                    onClick={() => setLaneResult(lr === laneResult ? '' : lr)}
                    className={`${btnBase} flex-1 ${laneResult === lr ? btnActive : btnInactive}`}
                  >
                    {lr === 'dominated' ? t('common.laneDominated') : lr === 'even' ? t('common.laneEven') : t('common.laneLost')}
                  </button>
                ))}
              </div>
            </div>

            {/* 首件时间 */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="block text-xs font-medium text-[var(--text-muted)]">{t('postGame.firstKeyItemLabel')}</label>
                <input type="number" value={firstKeyItemMin} onChange={e => setFirstKeyItemMin(e.target.value)} placeholder={t('postGame.firstKeyItemPlaceholder')} className={inputCls} />
              </div>
              <div className="space-y-1">
                <label className="block text-xs font-medium text-[var(--text-muted)]">{t('postGame.csAt10Label')}</label>
                <input type="number" value={csAt10} onChange={e => setCsAt10(e.target.value)} placeholder={t('postGame.csAt10Placeholder')} className={inputCls} />
              </div>
            </div>

            {/* 开团次数 + Draft 评分 */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="block text-xs font-medium text-[var(--text-muted)]">{t('postGame.goodInitiationsLabel')}</label>
                <input type="number" value={goodInitiations} onChange={e => setGoodInitiations(e.target.value)} placeholder={t('postGame.goodInitiationsPlaceholder')} className={inputCls} />
              </div>
              <div className="space-y-1">
                <label className="block text-xs font-medium text-[var(--text-muted)]">{t('postGame.draftScoreLabel')}</label>
                <div className="flex gap-1">
                  {([1, 2, 3, 4, 5] as const).map(n => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => setDraftScore(draftScore === n ? 0 : n)}
                      className={`w-8 h-8 rounded text-sm font-medium border transition-all ${draftScore === n ? btnActive : btnInactive}`}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Match ID */}
            <div className="space-y-1">
              <label className="block text-xs font-medium text-[var(--text-muted)]">{t('postGame.matchIdLabel')}</label>
              <input
                type="text"
                inputMode="numeric"
                value={matchId}
                onChange={e => handleMatchIdChange(e.target.value)}
                placeholder={t('postGame.matchIdPlaceholder')}
                className={inputCls}
              />
            </div>

            {/* 备注 */}
            <div className="space-y-1">
              <label className="block text-xs font-medium text-[var(--text-muted)]">{t('postGame.notesLabel')}</label>
              <textarea
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder={t('postGame.notesPlaceholder')}
                rows={2}
                className={`${inputCls} resize-none`}
              />
            </div>
          </div>
        )}
      </div>

      {/* 保存按钮 */}
      <div className="fixed bottom-0 left-0 right-0 p-4 bg-[var(--bg)] border-t border-[var(--border)]">
        <button
          type="button"
          onClick={handleSave}
          disabled={!canSave || saving || srsPromptNotes.length > 0}
          className="w-full py-3 rounded-xl font-semibold text-sm bg-[var(--accent)] text-[var(--text-primary)] hover:bg-[var(--accent-strong)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          {saving ? t('postGame.saving') : t('postGame.saveButton')}
        </button>
      </div>
    </div>
  )
}
