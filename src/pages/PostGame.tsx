import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { nanoid } from 'nanoid'
import { useAppState, useHeroNotes, useMatchLogs, useCycles } from '../store/useStore.ts'
import HeroSelector from '../components/HeroSelector.tsx'
import QuickSelect from '../components/QuickSelect.tsx'
import { REVIEW_DIMENSIONS } from '../data/reviewDimensions.ts'
import type { HeroMatchupNote, HeroNote, MatchLog, PreGameSetup, OpenDotaImportedMatch, OpenDotaRecentMatch, TrainingDimension } from '../types'
import { FOCUS_OPTIONS_BY_DIMENSION, FOCUS_OPTIONS_BY_LANE_RESULT, FOCUS_OPTIONS_BY_WEEK, compactMistake, compactPreviousFocus, getHeroFocusOptions, getHeroNoteFocusOptions, uniqueOptions, type LaneResult } from '../features/postgame/focusSuggestions.ts'
import { buildPostGameMatchLog } from '../features/postgame/matchLogBuilder.ts'
import SrsReviewPrompt from '../features/postgame/SrsReviewPrompt.tsx'
import OpenDotaImportPanel from '../features/postgame/OpenDotaImportPanel.tsx'
import { getCurrentWeek, todayStr } from '../utils/cycle.ts'
import { getOpenDotaHeroName } from '../utils/opendotaHeroes.ts'
import { isDueForReview } from '../utils/srs.ts'

const OPEN_DOTA_ANALYZE_POLL_ATTEMPTS = 18
const OPEN_DOTA_ANALYZE_POLL_INTERVAL_MS = 10_000

function wait(ms: number): Promise<void> {
  return new Promise(resolve => window.setTimeout(resolve, ms))
}

export function isOpenDotaParsePendingMessage(message: string): boolean {
  return message.includes('解析') || message.includes('HTTP 500') || message.includes('HTTP 404') || message.includes('没有返回玩家明细')
}

export default function PostGame() {
  const navigate = useNavigate()
  const { appState } = useAppState()
  const { matchLogs, add: addMatchLog } = useMatchLogs()
  const { heroNotes, upsert: upsertHeroNote } = useHeroNotes()
  const { cycles } = useCycles()

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

  // 快速选项
  const activeCycle = cycles.find(c => c.cycleId === appState?.activeCycleId)
  const currentWeek = activeCycle ? getCurrentWeek(activeCycle) : 0
  const lastMatch = [...matchLogs].sort((a, b) => b.timestamp - a.timestamp)[0]
  const selectedHero = hero.trim()
  const lastSameHeroMatch = selectedHero
    ? [...matchLogs]
      .filter(log => log.hero === selectedHero && Boolean(log.nextGameFocus?.trim()))
      .sort((a, b) => b.timestamp - a.timestamp)[0]
    : undefined

  const heroPool = appState?.heroPool.filter(h => h.active).map(h => h.name) ?? []
  const selectedReviewDimension = REVIEW_DIMENSIONS.find(item => item.id === reviewDimension)
  const selectedHeroNote = selectedHero ? heroNotes.find(note => note.hero === selectedHero) : undefined
  const matchupTargets = pendingSetup
    ? [
      ...Object.values(pendingSetup.enemyByPosition ?? {}),
      pendingSetup.enemyCarry,
      ...(pendingSetup.enemySupports ?? []),
    ].filter((value): value is string => Boolean(value && value !== selectedHero))
      .filter((value, index, array) => array.indexOf(value) === index)
    : []
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
    '下一局只改这一个点，结束后只按这个点复盘',
  ])

  const canSave =
    hero.trim() &&
    result &&
    durationMin &&
    !isNaN(parseInt(durationMin, 10)) &&
    trainingGoalMet &&
    biggestMistake.trim() &&
    nextGameFocus.trim()

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

    const existing = heroNotes.find(note => note.hero === cleanHero)
    const now = Date.now()
    const nextNote: HeroNote = {
      hero: cleanHero,
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
        window.alert('这个 Match ID 已经记录过了。')
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

      await window.electronStore.addMatchLog(log)
      await saveMatchupNotesToHeroProfile(logId)
      const relatedHeroes = new Set([log.hero, ...(log.enemySupports ?? []), log.enemyCarry].filter((value): value is string => Boolean(value)))
      const dueNotes = heroNotes.filter(note => relatedHeroes.has(note.hero) && isDueForReview(note, todayStr()))
      if (dueNotes.length > 0) {
        setSrsPromptNotes(dueNotes)
        setSaveStatus('对局已保存。可以顺手给相关英雄笔记打个复习分，或直接跳过。')
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
      setOpenDotaStatus('请先输入 Match ID。')
      return
    }
    if (matchLogs.some(l => l.matchId === cleanMatchId)) {
      setOpenDotaStatus('这个 Match ID 已经记录过了。')
      return
    }

    setImportingOpenDota(true)
    setOpenDotaStatus('')
    setCanRequestParse(false)
    try {
      const data = await window.electronStore.importOpenDotaMatch(cleanMatchId)
      applyImportedOpenDota(data)
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      setImportedMatch(null)
      setCanRequestParse(message.includes('解析') || message.includes('HTTP 500') || message.includes('HTTP 404'))
      setOpenDotaStatus(message)
    } finally {
      setImportingOpenDota(false)
    }
  }

  const handleAutoImportOpenDota = async (silent = false) => {
    if (autoImportingOpenDota || importingOpenDota || analyzingOpenDota || importedMatch) return
    if (!appState?.openDota?.accountId?.trim()) {
      if (!silent) setOpenDotaStatus('请先在设置页填写 OpenDota Account ID。')
      return
    }

    setAutoImportingOpenDota(true)
    setCanRequestParse(false)
    if (!silent) setOpenDotaStatus('正在从 OpenDota 自动同步最近一局未记录比赛…')
    try {
      const existingMatchIds = matchLogs.map(log => log.matchId).filter((id): id is string => Boolean(id))
      const data = await window.electronStore.autoImportLatestOpenDotaMatch(existingMatchIds)
      applyImportedOpenDota(data)
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      setImportedMatch(null)
      if (!silent || !message.includes('请先在设置页填写')) setOpenDotaStatus(message)
    } finally {
      setAutoImportingOpenDota(false)
    }
  }

  const handleLoadRecentOpenDotaMatches = async () => {
    if (!appState?.openDota?.accountId?.trim()) {
      setOpenDotaStatus('请先在设置页填写 OpenDota Account ID。')
      return
    }
    setLoadingRecentMatches(true)
    setOpenDotaStatus('正在拉取 OpenDota 最近 10 场…')
    try {
      const existingMatchIds = matchLogs.map(log => log.matchId).filter((id): id is string => Boolean(id))
      const rows = await window.electronStore.getRecentOpenDotaMatches(existingMatchIds)
      setRecentMatches(rows)
      setOpenDotaStatus(rows.length ? '已拉取最近 10 场，可选择一场导入。' : 'OpenDota 没有返回最近对局。')
    } catch (e) {
      setRecentMatches([])
      setOpenDotaStatus(e instanceof Error ? e.message : String(e))
    } finally {
      setLoadingRecentMatches(false)
    }
  }

  const handleImportRecentMatch = async (row: OpenDotaRecentMatch) => {
    if (row.recorded || matchLogs.some(l => l.matchId === row.matchId)) {
      setOpenDotaStatus('这场比赛已经记录过了。')
      return
    }
    setMatchId(row.matchId)
    setImportingOpenDota(true)
    setCanRequestParse(false)
    setOpenDotaStatus(`正在导入 ${row.heroName ?? '这场比赛'}…`)
    try {
      const data = await window.electronStore.importOpenDotaMatch(row.matchId)
      applyImportedOpenDota(data)
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      setImportedMatch(null)
      setCanRequestParse(message.includes('解析') || message.includes('HTTP 500') || message.includes('HTTP 404'))
      setOpenDotaStatus(message)
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
      ? ` · ${data.firstKeyItemName} ${data.firstKeyItemMin}分`
      : ''
    const laneText = data.laneResult
      ? ` · 对线${data.laneResult === 'dominated' ? '压制' : data.laneResult === 'even' ? '持平' : '被压'}`
      : ''
    setOpenDotaStatus(`已导入：${getOpenDotaHeroName(data.heroId)} · ${data.result === 'win' ? '胜利' : '失败'} · KDA ${kda}${laneText}${keyItem}`)
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
      setOpenDotaStatus('请先输入 Match ID。')
      return
    }
    if (matchLogs.some(l => l.matchId === cleanMatchId)) {
      setOpenDotaStatus('这个 Match ID 已经记录过了。')
      return
    }

    setAnalyzingOpenDota(true)
    setOpenDotaStatus('正在向 OpenDota 提交解析请求…成功后会每 10 秒检查一次，拿到详细数据就填入赛后表单；仍需要你手动保存复盘。')
    setCanRequestParse(false)
    try {
      await window.electronStore.requestOpenDotaParse(cleanMatchId)

      let lastError: Error | null = null
      for (let attempt = 1; attempt <= OPEN_DOTA_ANALYZE_POLL_ATTEMPTS; attempt += 1) {
        setOpenDotaStatus(`已提交解析请求，正在等待 OpenDota 生成详细数据…第 ${attempt}/${OPEN_DOTA_ANALYZE_POLL_ATTEMPTS} 次检查。成功后会自动填入赛后表单。`)
        try {
          const data = await window.electronStore.importOpenDotaMatch(cleanMatchId)
          applyImportedOpenDota(data)
          return
        } catch (error) {
          lastError = error instanceof Error ? error : new Error(String(error))
          if (!isOpenDotaParsePendingMessage(lastError.message)) throw lastError
          if (attempt < OPEN_DOTA_ANALYZE_POLL_ATTEMPTS) await wait(OPEN_DOTA_ANALYZE_POLL_INTERVAL_MS)
        }
      }

      throw new Error(lastError?.message ?? 'OpenDota 已收到解析请求，但几分钟内还没有返回详细数据。请稍后再点“导入”。')
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      setImportedMatch(null)
      setCanRequestParse(message.includes('解析') || message.includes('HTTP 500') || message.includes('HTTP 404'))
      setOpenDotaStatus(message)
    } finally {
      setAnalyzingOpenDota(false)
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
          ← 返回
        </button>
        <h1 className="text-xl font-bold text-[var(--text-primary)]">赛后记录</h1>
        {pendingSetup && (
          <p className="text-sm text-[var(--accent-strong)] mt-1">
            关联赛前设定：{pendingSetup.hero}{pendingSetup.targetPosition ? ` · ${pendingSetup.targetPosition}号位` : ''}{pendingSetup.trainingGoal ? ` · ${pendingSetup.trainingGoal}` : ''}{pendingSetup.enemyCarry ? ` · 对方1号位 ${pendingSetup.enemyCarry}` : ''}
          </p>
        )}
      </div>

      <OpenDotaImportPanel
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
        onMatchIdChange={value => {
          setMatchId(value)
          if (importedMatch?.matchId !== value.trim()) setImportedMatch(null)
        }}
        onImportOpenDota={handleImportOpenDota}
        onAutoImportOpenDota={() => handleAutoImportOpenDota(false)}
        onLoadRecentOpenDotaMatches={handleLoadRecentOpenDotaMatches}
        onImportRecentMatch={handleImportRecentMatch}
        onAnalyzeAndImportOpenDota={handleAnalyzeAndImportOpenDota}
      />

      {/* 必填：英雄 */}
      <HeroSelector
        label="本局英雄 *"
        value={hero}
        onChange={setHero}
        heroPool={heroPool.length > 0 ? heroPool : undefined}
      />

      {/* 必填：胜负 */}
      <div className="space-y-2">
        <label className="block text-xs font-medium text-[var(--text-muted)] uppercase tracking-wider">胜负 *</label>
        <div className="flex gap-2">
          <button type="button" onClick={() => setResult('win')} className={`${btnBase} flex-1 ${result === 'win' ? 'border-green-500 bg-[var(--bg-success)] text-[var(--text-success)]' : btnInactive}`}>胜利</button>
          <button type="button" onClick={() => setResult('loss')} className={`${btnBase} flex-1 ${result === 'loss' ? 'border-red-500 bg-[var(--bg-danger)] text-[var(--text-danger)]' : btnInactive}`}>失败</button>
        </div>
      </div>

      {/* 必填：时长 */}
      <div className="space-y-2">
        <label className="block text-xs font-medium text-[var(--text-muted)] uppercase tracking-wider">时长（分钟）*</label>
        <input type="number" value={durationMin} onChange={e => setDurationMin(e.target.value)} placeholder="如：42" className={inputCls} />
      </div>

      {/* 必填：训练目标完成了吗 */}
      <div className="space-y-2">
        <label className="block text-xs font-medium text-[var(--text-muted)] uppercase tracking-wider">
          训练目标完成了吗？*
          {pendingSetup && <span className="ml-2 text-[var(--accent-strong)] font-normal normal-case">赛前：{pendingSetup.hero}{pendingSetup.targetPosition ? ` · ${pendingSetup.targetPosition}号位` : ''}</span>}
        </label>
        <div className="flex gap-2">
          {(['yes', 'partial', 'no'] as const).map(v => (
            <button
              key={v}
              type="button"
              onClick={() => setTrainingGoalMet(v)}
              className={`${btnBase} flex-1 ${trainingGoalMet === v ? btnActive : btnInactive}`}
            >
              {v === 'yes' ? '完成' : v === 'partial' ? '部分' : '未完成'}
            </button>
          ))}
        </div>
      </div>

      {/* 必填：最大错误 */}
      <div className="space-y-2">
        <label className="block text-xs font-medium text-[var(--text-muted)] uppercase tracking-wider">最大错误（一句话）*</label>
        <textarea
          value={biggestMistake}
          onChange={e => setBiggestMistake(e.target.value)}
          placeholder="这局最大的失误是什么？"
          rows={2}
          className={`${inputCls} resize-none`}
        />
      </div>

      {/* 复盘归因 */}
      <div className="space-y-3">
        <label className="block text-xs font-medium text-[var(--text-muted)] uppercase tracking-wider">这局主要问题属于哪个判断？</label>
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
            label="具体判断问题"
            options={selectedReviewDimension.topics}
            value={reviewTopic}
            onChange={setReviewTopic}
            placeholder="自定义判断问题…"
          />
        )}
      </div>

      {/* 必填：下局改进点 */}
      <QuickSelect
        label="下局唯一改进点 *"
        options={quickFocusOptions}
        value={nextGameFocus}
        onChange={setNextGameFocus}
        placeholder="自定义改进点…"
      />
      {lastSameHeroMatch && previousHeroFocus && (
        <p className="text-xs text-[var(--text-muted)] -mt-4">
          已提取上次使用 {selectedHero} 的改进点：{previousHeroFocus}
          <span className="ml-1">（{new Date(lastSameHeroMatch.timestamp).toLocaleDateString('zh-CN')}）</span>
        </p>
      )}

      {/* P1：3 片段复盘 */}
      <div className="space-y-3 rounded-xl border border-[var(--border)] bg-[var(--surface-1)] p-4">
        <div>
          <h2 className="text-sm font-semibold text-[var(--text-primary)]">3 片段复盘</h2>
          <p className="mt-1 text-xs text-[var(--text-muted)]">每个片段只写时间点和一句判断，下次复盘才有抓手。</p>
        </div>
        <label className="block space-y-1">
          <span className="block text-xs font-medium text-[var(--text-muted)]">关键死亡片段</span>
          <textarea value={reviewClipDeath} onChange={e => setReviewClipDeath(e.target.value)} placeholder="如：18:40 红区收线没看到双辅助，应该先等线进塔。" rows={2} className={`${inputCls} resize-none`} />
        </label>
        <label className="block space-y-1">
          <span className="block text-xs font-medium text-[var(--text-muted)]">关键团战片段</span>
          <textarea value={reviewClipFight} onChange={e => setReviewClipFight(e.target.value)} placeholder="如：26:10 先手目标错了，应该等对方核心露头。" rows={2} className={`${inputCls} resize-none`} />
        </label>
        <label className="block space-y-1">
          <span className="block text-xs font-medium text-[var(--text-muted)]">关键目标片段</span>
          <textarea value={reviewClipObjective} onChange={e => setReviewClipObjective(e.target.value)} placeholder="如：32:00 赢团后追人，没有转 Roshan 或推塔。" rows={2} className={`${inputCls} resize-none`} />
        </label>
      </div>

      {matchupTargets.length > 0 && (
        <div className="space-y-3 rounded-xl border border-[var(--border)] bg-[var(--surface-1)] p-4">
          <div>
            <h2 className="text-sm font-semibold text-[var(--text-primary)]">沉淀对位英雄笔记</h2>
            <p className="mt-1 text-xs text-[var(--text-muted)]">把这局对某个英雄的心得保存到当前英雄档案。选择“风险/被克制”会同步写入 counteredBy；选择“优势/克制”会同步写入 counters。</p>
          </div>
          <div className="space-y-3">
            {matchupTargets.map(opponent => (
              <div key={opponent} className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-3">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <div className="text-sm font-semibold text-[var(--text-primary)]">{selectedHero || '当前英雄'} vs {opponent}</div>
                  <div className="flex gap-1">
                    {([
                      ['counteredBy', '风险/被克制'],
                      ['counters', '优势/克制'],
                      ['general', '心得'],
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
                  placeholder={`例如：${opponent}：这局哪里难打/怎么处理，下次怎么调整…`}
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
          <span>选填项（对线结果、首件、补刀等）</span>
          <span>{showOptional ? '▲ 收起' : '▼ 展开'}</span>
        </button>

        {showOptional && (
          <div className="mt-3 space-y-4 px-1">
            {/* 死亡区域 */}
            <div className="space-y-2">
              <label className="block text-xs font-medium text-[var(--text-muted)] uppercase tracking-wider">最蠢死亡区域</label>
              <div className="flex gap-2">
                {(['green', 'orange', 'red'] as const).map(z => (
                  <button
                    key={z}
                    type="button"
                    onClick={() => setWorstDeathZone(z === worstDeathZone ? '' : z)}
                    className={`${btnBase} flex-1 ${worstDeathZone === z ? btnActive : btnInactive}`}
                  >
                    {z === 'green' ? '绿区' : z === 'orange' ? '橙区' : '红区'}
                  </button>
                ))}
              </div>
            </div>

            {/* 对线结果 */}
            <div className="space-y-2">
              <label className="block text-xs font-medium text-[var(--text-muted)] uppercase tracking-wider">对线结果</label>
              <div className="flex gap-2">
                {(['dominated', 'even', 'lost'] as const).map(lr => (
                  <button
                    key={lr}
                    type="button"
                    onClick={() => setLaneResult(lr === laneResult ? '' : lr)}
                    className={`${btnBase} flex-1 ${laneResult === lr ? btnActive : btnInactive}`}
                  >
                    {lr === 'dominated' ? '压制' : lr === 'even' ? '持平' : '被压'}
                  </button>
                ))}
              </div>
            </div>

            {/* 首件时间 */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="block text-xs font-medium text-[var(--text-muted)]">第一件关键装（分钟）</label>
                <input type="number" value={firstKeyItemMin} onChange={e => setFirstKeyItemMin(e.target.value)} placeholder="如：18" className={inputCls} />
              </div>
              <div className="space-y-1">
                <label className="block text-xs font-medium text-[var(--text-muted)]">10 分钟补刀</label>
                <input type="number" value={csAt10} onChange={e => setCsAt10(e.target.value)} placeholder="如：65" className={inputCls} />
              </div>
            </div>

            {/* 开团次数 + Draft 评分 */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="block text-xs font-medium text-[var(--text-muted)]">开团成功次数</label>
                <input type="number" value={goodInitiations} onChange={e => setGoodInitiations(e.target.value)} placeholder="如：3" className={inputCls} />
              </div>
              <div className="space-y-1">
                <label className="block text-xs font-medium text-[var(--text-muted)]">Draft 评分（1-5）</label>
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
              <label className="block text-xs font-medium text-[var(--text-muted)]">Match ID</label>
              <input
                type="text"
                inputMode="numeric"
                value={matchId}
                onChange={e => setMatchId(e.target.value)}
                placeholder="可手动填写或从 OpenDota 导入"
                className={inputCls}
              />
            </div>

            {/* 备注 */}
            <div className="space-y-1">
              <label className="block text-xs font-medium text-[var(--text-muted)]">备注</label>
              <textarea
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="自由文本备注…"
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
          disabled={!canSave || saving}
          className="w-full py-3 rounded-xl font-semibold text-sm bg-[var(--accent)] text-[var(--text-primary)] hover:bg-[var(--accent-strong)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          {saving ? '保存中…' : '保存对局记录'}
        </button>
      </div>
    </div>
  )
}
