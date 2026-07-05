import React, { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAppState, useCycles } from '../store/useStore.ts'
import positionMetaJson from '../data/positionMetaHeroes.json'
import type { HeroMatchupCache, HeroTimingCache, PositionMetaSnapshot, StratzRankBracket, TrainingCycle } from '../types'
import { useLanguage, useSetLanguage, useT } from '../i18n/index.ts'

const STRATZ_RANK_BRACKETS: Array<{ value: StratzRankBracket; labelKey: string }> = [
  { value: 'ALL', labelKey: 'settings.rankAll' },
  { value: 'HERALD_GUARDIAN', labelKey: 'settings.rankHeraldGuardian' },
  { value: 'CRUSADER_ARCHON', labelKey: 'settings.rankCrusaderArchon' },
  { value: 'LEGEND_ANCIENT', labelKey: 'settings.rankLegendAncient' },
  { value: 'DIVINE_IMMORTAL', labelKey: 'settings.rankDivineImmortal' },
]
import { nanoid } from 'nanoid'

const POSITION_META = positionMetaJson as PositionMetaSnapshot

export default function Settings() {
  const navigate = useNavigate()
  const { appState, update: updateAppState } = useAppState()
  const { cycles, add: addCycle } = useCycles()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const t = useT()
  const language = useLanguage()
  const setLanguage = useSetLanguage()

  const [exporting, setExporting] = useState(false)
  const [importing, setImporting] = useState(false)
  const [newStartDate, setNewStartDate] = useState('')
  const [openDotaAccountId, setOpenDotaAccountId] = useState('')
  const [openDotaApiKey, setOpenDotaApiKey] = useState('')
  const [matchupMinGames, setMatchupMinGames] = useState('50')
  const [stratzApiKey, setStratzApiKey] = useState('')
  const [stratzRankBracket, setStratzRankBracket] = useState<StratzRankBracket>('ALL')
  const [statusMsg, setStatusMsg] = useState('')
  const [syncingMatchups, setSyncingMatchups] = useState(false)
  const [syncingTimings, setSyncingTimings] = useState(false)
  const [matchupCache, setMatchupCache] = useState<HeroMatchupCache | null>(null)
  const [timingCache, setTimingCache] = useState<HeroTimingCache | null>(null)
  const [positionMeta, setPositionMeta] = useState<PositionMetaSnapshot>(POSITION_META)
  const [syncingPositionMeta, setSyncingPositionMeta] = useState(false)

  useEffect(() => {
    setOpenDotaAccountId(appState?.openDota?.accountId ?? '')
    setOpenDotaApiKey(appState?.openDota?.apiKey ?? '')
    setMatchupMinGames(String(appState?.openDota?.matchupMinGames ?? 50))
  }, [appState?.openDota?.accountId, appState?.openDota?.apiKey, appState?.openDota?.matchupMinGames])

  useEffect(() => {
    setStratzApiKey(appState?.stratz?.apiKey ?? '')
    setStratzRankBracket(appState?.stratz?.rankBracket ?? 'ALL')
  }, [appState?.stratz?.apiKey, appState?.stratz?.rankBracket])

  useEffect(() => {
    window.electronStore.getHeroMatchupCache()
      .then(setMatchupCache)
      .catch(() => undefined)
    window.electronStore.getHeroTimingCache()
      .then(setTimingCache)
      .catch(() => undefined)
    window.electronStore.getPositionMetaCache()
      .then(setPositionMeta)
      .catch(() => undefined)
  }, [])

  const formatCacheTime = (ts?: number) => ts
    ? new Date(ts).toLocaleString(language === 'zh' ? 'zh-CN' : 'en-US', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
    : t('common.unknown')

  const handleExport = async () => {
    setExporting(true)
    try {
      const result = await window.electronStore.exportAll()
      setStatusMsg(result.success ? t('settings.exportSuccess') : t('settings.exportCancelled'))
    } catch (e) {
      setStatusMsg(t('settings.exportFailed', { error: String(e) }))
    } finally {
      setExporting(false)
      setTimeout(() => setStatusMsg(''), 3000)
    }
  }

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setImporting(true)
    const reader = new FileReader()
    reader.onload = async ev => {
      try {
        const json = ev.target?.result as string
        await window.electronStore.importAll(json)
        setStatusMsg(t('settings.importSuccess'))
      } catch (err) {
        setStatusMsg(t('settings.importFailed', { error: String(err) }))
      } finally {
        setImporting(false)
        setTimeout(() => setStatusMsg(''), 5000)
        if (fileInputRef.current) fileInputRef.current.value = ''
      }
    }
    reader.readAsText(file)
  }

  const handleNewCycle = async () => {
    if (!newStartDate) return
    const cycle: TrainingCycle = {
      cycleId: nanoid(),
      startDate: newStartDate,
      weekThemes: cycles[0]?.weekThemes ?? [],
    }
    await addCycle(cycle)
    await updateAppState({ activeCycleId: cycle.cycleId })
    setNewStartDate('')
    setStatusMsg(t('settings.cycleCreated', { date: newStartDate }))
    setTimeout(() => setStatusMsg(''), 3000)
  }

  const handleSaveOpenDota = async () => {
    await updateAppState({
      openDota: {
        accountId: openDotaAccountId.trim(),
        apiKey: openDotaApiKey.trim(),
        matchupMinGames: Math.max(1, parseInt(matchupMinGames, 10) || 50),
      },
    })
    setStatusMsg(t('settings.openDotaSaved'))
    setTimeout(() => setStatusMsg(''), 3000)
  }

  const handleSaveStratz = async () => {
    await updateAppState({
      stratz: {
        apiKey: stratzApiKey.trim(),
        rankBracket: stratzRankBracket,
      },
    })
    setStatusMsg(t('settings.stratzSaved'))
    setTimeout(() => setStatusMsg(''), 4000)
  }

  const handleSyncMatchups = async () => {
    setSyncingMatchups(true)
    const trimmedStratzApiKey = stratzApiKey.trim()
    setStatusMsg(trimmedStratzApiKey
      ? t('settings.syncingMatchupsStratz')
      : t('settings.syncMatchupsNeedsKey'))
    try {
      if (!trimmedStratzApiKey) throw new Error(t('settings.syncMatchupsNeedsKeyError'))
      if (trimmedStratzApiKey !== (appState?.stratz?.apiKey ?? '') || stratzRankBracket !== (appState?.stratz?.rankBracket ?? 'ALL')) {
        await updateAppState({ stratz: { apiKey: trimmedStratzApiKey, rankBracket: stratzRankBracket } })
      }
      const result = await window.electronStore.syncOpenDotaHeroMatchups(true)
      setMatchupCache(result.cache)
      setStatusMsg(result.message)
    } catch (error) {
      setStatusMsg(error instanceof Error ? error.message : String(error))
    } finally {
      setSyncingMatchups(false)
      setTimeout(() => setStatusMsg(''), 6000)
    }
  }

  const handleSyncTimings = async () => {
    setSyncingTimings(true)
    const usingStratz = Boolean(stratzApiKey.trim())
    setStatusMsg(usingStratz ? t('settings.syncingTimingStratz') : t('settings.syncingTimingOpenDota'))
    const progressTimer = setInterval(() => {
      window.electronStore.getHeroTimingSyncProgress().then(progress => {
        if (progress) setStatusMsg(t('settings.syncingTimingProgress', { completed: progress.completed, total: progress.total }))
      })
    }, 1000)
    try {
      const result = await window.electronStore.syncHeroTimings(true)
      const cache = await window.electronStore.getHeroTimingCache()
      setTimingCache(cache)
      setStatusMsg(t('settings.timingSynced', {
        count: result.heroCount,
        errors: result.errors.length ? t('settings.timingSyncedErrorsSuffix', { n: result.errors.length }) : '',
        source: cache?.source === 'stratz' ? 'Stratz' : 'OpenDota',
      }))
    } catch (error) {
      setStatusMsg(error instanceof Error ? error.message : String(error))
    } finally {
      clearInterval(progressTimer)
      setSyncingTimings(false)
      setTimeout(() => setStatusMsg(''), 6000)
    }
  }

  const handleSyncPositionMeta = async () => {
    setSyncingPositionMeta(true)
    setStatusMsg(t('settings.syncingPositionMeta'))
    try {
      const result = await window.electronStore.syncPositionMeta(true)
      setPositionMeta(result.cache)
      setStatusMsg(result.message)
    } catch (error) {
      setStatusMsg(error instanceof Error ? error.message : String(error))
    } finally {
      setSyncingPositionMeta(false)
      setTimeout(() => setStatusMsg(''), 6000)
    }
  }

  return (
    <div className="p-6 space-y-6 max-w-lg mx-auto">
      <div>
        <button type="button" onClick={() => navigate('/')} className="text-xs text-[var(--text-muted)] hover:text-[var(--text-secondary)] mb-3">{t('common.back')}</button>
        <h1 className="text-xl font-bold text-[var(--text-primary)]">{t('settings.title')}</h1>
      </div>

      {statusMsg && (
        <div className="px-4 py-3 rounded-lg border border-[var(--border-info)] bg-[var(--bg-info)] text-[var(--text-info)] text-sm">
          {statusMsg}
        </div>
      )}

      <div className="space-y-3 rounded-lg border border-[var(--border-info)] bg-[var(--bg-info)] p-4">
        <h2 className="text-sm font-semibold text-[var(--text-info)]">{t('settings.heroPoolMovedTitle')}</h2>
        <p className="text-xs leading-5 text-[var(--text-info)]">{t('settings.heroPoolMovedBody')}</p>
        <button
          type="button"
          onClick={() => navigate('/hero-notes')}
          className="rounded-lg border border-[var(--border-info)] px-3 py-2 text-xs font-semibold text-[var(--text-info)] transition-colors hover:bg-[var(--surface-1)]"
        >
          {t('settings.openHeroHub')}
        </button>
      </div>

      {/* 语言 / Language */}
      <div className="space-y-3">
        <h2 className="text-sm font-semibold text-[var(--text-secondary)] uppercase tracking-wider">{t('settings.languageSection')}</h2>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setLanguage('zh')}
            className={`flex-1 py-2 rounded-lg border text-sm font-medium transition-colors ${
              language === 'zh' ? 'border-[var(--accent-border)] bg-[var(--accent-muted)] text-[var(--accent-strong)]' : 'border-[var(--border)] text-[var(--text-secondary)]'
            }`}
          >
            中文
          </button>
          <button
            type="button"
            onClick={() => setLanguage('en')}
            className={`flex-1 py-2 rounded-lg border text-sm font-medium transition-colors ${
              language === 'en' ? 'border-[var(--accent-border)] bg-[var(--accent-muted)] text-[var(--accent-strong)]' : 'border-[var(--border)] text-[var(--text-secondary)]'
            }`}
          >
            English
          </button>
        </div>
      </div>

      {/* 训练周期 */}
      <div className="space-y-3">
        <h2 className="text-sm font-semibold text-[var(--text-secondary)] uppercase tracking-wider">{t('settings.trainingCycle')}</h2>
        <p className="text-xs text-[var(--text-muted)]">
          {t('settings.currentCycle', { date: cycles.find(c => c.cycleId === appState?.activeCycleId)?.startDate ?? t('settings.notSet') })}
        </p>
        <div className="space-y-2">
          <label className="block text-xs text-[var(--text-muted)]">{t('settings.newCycleLabel')}</label>
          <div className="flex gap-2">
            <input
              type="date"
              value={newStartDate}
              onChange={e => setNewStartDate(e.target.value)}
              className="flex-1 px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--surface-1)] text-[var(--text-primary)] text-sm focus:outline-none focus:border-[var(--accent-border)]"
            />
            <button
              type="button"
              onClick={handleNewCycle}
              disabled={!newStartDate}
              className="px-4 py-2 rounded-lg bg-[var(--accent)] text-[var(--text-primary)] text-sm font-semibold hover:bg-[var(--accent-strong)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {t('settings.create')}
            </button>
          </div>
        </div>
        {cycles.length > 0 && (
          <div className="space-y-1">
            {cycles.map(c => (
              <div
                key={c.cycleId}
                className={`flex items-center justify-between px-3 py-2 rounded-lg border text-sm ${
                  c.cycleId === appState?.activeCycleId
                    ? 'border-[var(--accent-border)] bg-[var(--accent-muted)] text-[var(--accent-strong)]'
                    : 'border-[var(--border)] text-[var(--text-muted)]'
                }`}
              >
                <span>{c.startDate}</span>
                {c.cycleId === appState?.activeCycleId ? (
                  <span className="text-xs">{t('settings.current')}</span>
                ) : (
                  <button
                    type="button"
                    onClick={() => updateAppState({ activeCycleId: c.cycleId })}
                    className="text-xs text-[var(--accent-strong)] hover:text-[var(--text-primary)]"
                  >
                    {t('settings.switch')}
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* OpenDota */}
      <div className="space-y-3">
        <h2 className="text-sm font-semibold text-[var(--text-secondary)] uppercase tracking-wider">{t('settings.openDotaTitle')}</h2>
        <p className="text-xs text-[var(--text-muted)]">{t('settings.openDotaDesc')}</p>
        <div className="space-y-2">
          <label className="block text-xs text-[var(--text-muted)]">{t('settings.accountIdLabel')}</label>
          <input
            type="text"
            inputMode="numeric"
            value={openDotaAccountId}
            onChange={e => setOpenDotaAccountId(e.target.value)}
            placeholder={t('settings.accountIdPlaceholder')}
            className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--surface-1)] text-[var(--text-primary)] text-sm focus:outline-none focus:border-[var(--accent-border)]"
          />
        </div>
        <div className="space-y-2">
          <label className="block text-xs text-[var(--text-muted)]">{t('settings.apiKeyOptionalLabel')}</label>
          <input
            type="password"
            value={openDotaApiKey}
            onChange={e => setOpenDotaApiKey(e.target.value)}
            placeholder={t('settings.apiKeyOptionalPlaceholder')}
            className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--surface-1)] text-[var(--text-primary)] text-sm focus:outline-none focus:border-[var(--accent-border)]"
          />
        </div>
        <div className="space-y-2">
          <label className="block text-xs text-[var(--text-muted)]">{t('settings.matchupMinGamesLabel')}</label>
          <input
            type="number"
            min="1"
            value={matchupMinGames}
            onChange={e => setMatchupMinGames(e.target.value)}
            placeholder={t('settings.matchupMinGamesPlaceholder')}
            className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--surface-1)] text-[var(--text-primary)] text-sm focus:outline-none focus:border-[var(--accent-border)]"
          />
        </div>
        <button
          type="button"
          onClick={handleSaveOpenDota}
          className="w-full py-2.5 rounded-lg bg-[var(--accent)] text-[var(--text-primary)] text-sm font-semibold hover:bg-[var(--accent-strong)] transition-colors"
        >
          {t('settings.saveOpenDota')}
        </button>
      </div>

      {/* Stratz */}
      <div className="space-y-3">
        <h2 className="text-sm font-semibold text-[var(--text-secondary)] uppercase tracking-wider">{t('settings.stratzTitle')}</h2>
        <p className="text-xs text-[var(--text-muted)]">
          {t('settings.stratzDesc')}
        </p>
        <div className="space-y-2">
          <label className="block text-xs text-[var(--text-muted)]">{t('settings.apiKeyLabel')}</label>
          <input
            type="password"
            value={stratzApiKey}
            onChange={e => setStratzApiKey(e.target.value)}
            placeholder={t('settings.stratzApiKeyPlaceholder')}
            className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--surface-1)] text-[var(--text-primary)] text-sm focus:outline-none focus:border-[var(--accent-border)]"
          />
        </div>
        <div className="space-y-2">
          <label className="block text-xs text-[var(--text-muted)]">{t('settings.rankBracketLabel')}</label>
          <select
            value={stratzRankBracket}
            onChange={e => setStratzRankBracket(e.target.value as StratzRankBracket)}
            className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--surface-1)] text-[var(--text-primary)] text-sm focus:outline-none focus:border-[var(--accent-border)]"
          >
            {STRATZ_RANK_BRACKETS.map(item => (
              <option key={item.value} value={item.value}>{t(item.labelKey)}</option>
            ))}
          </select>
        </div>
        <button
          type="button"
          onClick={handleSaveStratz}
          className="w-full py-2.5 rounded-lg bg-[var(--accent)] text-[var(--text-primary)] text-sm font-semibold hover:bg-[var(--accent-strong)] transition-colors"
        >
          {t('settings.saveStratz')}
        </button>
      </div>

      {/* 英雄克制矩阵同步（共用：优先 Stratz，未配置时用 OpenDota） */}
      <div className="space-y-3">
        <h2 className="text-sm font-semibold text-[var(--text-secondary)] uppercase tracking-wider">{t('settings.matchupMatrixTitle')}</h2>
        <div className="pt-1 space-y-2">
          <p className="text-xs text-[var(--text-muted)]">
            {matchupCache
              ? t('settings.matchupSummary', {
                  weekKey: matchupCache.weekKey ?? matchupCache.date,
                  heroCount: matchupCache.heroCount,
                  matchupCount: matchupCache.matchupCount,
                  expiresAt: formatCacheTime(matchupCache.expiresAt),
                })
              : t('common.notSynced')}
          </p>
          <button
            type="button"
            onClick={handleSyncMatchups}
            disabled={syncingMatchups}
            className="w-full py-2.5 rounded-lg border border-[var(--border)] text-sm font-medium text-[var(--text-secondary)] hover:border-[var(--accent-border)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {syncingMatchups ? t('common.syncing') : t('settings.syncMatchups')}
          </button>
        </div>
      </div>

      {/* 英雄 Timing 同步（OpenDota durations） */}
      <div className="space-y-3">
        <h2 className="text-sm font-semibold text-[var(--text-secondary)] uppercase tracking-wider">{t('settings.timingTitle')}</h2>
        <div className="pt-1 space-y-2">
          <p className="text-xs text-[var(--text-muted)]">
            {timingCache
              ? t('settings.timingSummary', {
                  date: timingCache.date,
                  heroCount: timingCache.heroCount,
                  status: timingCache.errors?.length ? t('settings.timingFailedCount', { n: timingCache.errors.length }) : t('settings.timingFullCache'),
                  source: timingCache.source === 'stratz' ? 'Stratz' : 'OpenDota',
                })
              : t('common.notSynced')}
          </p>
          <p className="text-xs leading-5 text-[var(--text-muted)]">{t('settings.timingDesc')}</p>
          <button
            type="button"
            onClick={handleSyncTimings}
            disabled={syncingTimings}
            className="w-full py-2.5 rounded-lg border border-[var(--border)] text-sm font-medium text-[var(--text-secondary)] hover:border-[var(--accent-border)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {syncingTimings ? t('common.syncing') : t('settings.syncTiming')}
          </button>
        </div>
      </div>

      {/* 位置热门英雄 */}
      <div className="space-y-3">
        <h2 className="text-sm font-semibold text-[var(--text-secondary)] uppercase tracking-wider">{t('settings.positionMetaTitle')}</h2>
        <p className="text-xs leading-5 text-[var(--text-muted)]">
          {t('settings.positionMetaSummary', {
            source: positionMeta.source === 'stratz' ? 'Stratz' : t('settings.positionMetaLocal'),
            rankBracket: positionMeta.rankBracket ?? 'ALL',
            weekKey: positionMeta.weekKey,
            counts: (['1', '2', '3', '4', '5'] as const).map(position => t('settings.positionCount', { position, count: positionMeta.positions[position]?.length ?? 0 })).join(' / '),
          })}
        </p>
        <p className="text-xs leading-5 text-[var(--text-muted)]">
          {t('settings.positionMetaDesc')}
        </p>
        <button
          type="button"
          onClick={handleSyncPositionMeta}
          disabled={syncingPositionMeta}
          className="w-full py-2.5 rounded-lg border border-[var(--border)] text-sm font-medium text-[var(--text-secondary)] hover:border-[var(--accent-border)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          {syncingPositionMeta ? t('common.syncing') : t('settings.syncPositionMeta')}
        </button>
      </div>

      {/* 数据备份 */}
      <div className="space-y-3">
        <h2 className="text-sm font-semibold text-[var(--text-secondary)] uppercase tracking-wider">{t('settings.backupTitle')}</h2>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={handleExport}
            disabled={exporting}
            className="flex-1 py-2.5 rounded-lg border border-[var(--border)] text-sm font-medium text-[var(--text-secondary)] hover:border-[var(--accent-border)] disabled:opacity-40 transition-colors"
          >
            {exporting ? t('settings.exporting') : t('settings.exportJson')}
          </button>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={importing}
            className="flex-1 py-2.5 rounded-lg border border-[var(--border)] text-sm font-medium text-[var(--text-secondary)] hover:border-[var(--accent-border)] disabled:opacity-40 transition-colors"
          >
            {importing ? t('settings.importing') : t('settings.importJson')}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json"
            onChange={handleImport}
            className="hidden"
          />
        </div>
        <p className="text-xs text-[var(--text-muted)]">{t('settings.importHint')}</p>
      </div>
    </div>
  )
}
