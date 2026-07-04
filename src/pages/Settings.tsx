import React, { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAppState, useCycles } from '../store/useStore.ts'
import positionMetaJson from '../data/positionMetaHeroes.json'
import type { HeroMatchupCache, HeroTimingCache, PositionMetaSnapshot, StratzRankBracket, TrainingCycle } from '../types'

const STRATZ_RANK_BRACKETS: Array<{ value: StratzRankBracket; label: string }> = [
  { value: 'ALL', label: '全部分段' },
  { value: 'HERALD_GUARDIAN', label: '先锋-卫士' },
  { value: 'CRUSADER_ARCHON', label: '中军-统帅' },
  { value: 'LEGEND_ANCIENT', label: '传奇-万古' },
  { value: 'DIVINE_IMMORTAL', label: '神话-冠绝' },
]
import { nanoid } from 'nanoid'

const POSITION_META = positionMetaJson as PositionMetaSnapshot

export default function Settings() {
  const navigate = useNavigate()
  const { appState, update: updateAppState } = useAppState()
  const { cycles, add: addCycle } = useCycles()
  const fileInputRef = useRef<HTMLInputElement>(null)

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
  }, [])

  const formatCacheTime = (ts?: number) => ts
    ? new Date(ts).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
    : '未知'

  const handleExport = async () => {
    setExporting(true)
    try {
      const result = await window.electronStore.exportAll()
      setStatusMsg(result.success ? '导出成功！' : '导出已取消。')
    } catch (e) {
      setStatusMsg('导出失败：' + String(e))
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
        setStatusMsg('导入成功！请重启应用以刷新所有数据。')
      } catch (err) {
        setStatusMsg('导入失败：' + String(err))
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
    setStatusMsg(`已创建新周期，起始日：${newStartDate}`)
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
    setStatusMsg('OpenDota 设置已保存。')
    setTimeout(() => setStatusMsg(''), 3000)
  }

  const handleSaveStratz = async () => {
    await updateAppState({
      stratz: {
        apiKey: stratzApiKey.trim(),
        rankBracket: stratzRankBracket,
      },
    })
    setStatusMsg('Stratz 设置已保存。填了 Key 之后，「同步本周 matchup 矩阵」会优先用 Stratz 的天梯分段数据。')
    setTimeout(() => setStatusMsg(''), 4000)
  }

  const handleSyncMatchups = async () => {
    setSyncingMatchups(true)
    const trimmedStratzApiKey = stratzApiKey.trim()
    setStatusMsg(trimmedStratzApiKey
      ? '正在通过 Stratz 同步本周 matchup 矩阵…'
      : '请先填写 Stratz API Key；matchup 数据源已固定为 Stratz。')
    try {
      if (!trimmedStratzApiKey) throw new Error('matchup 数据源已固定为 Stratz，请先填写 Stratz API Key。')
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
    setStatusMsg(usingStratz ? '正在通过 Stratz 同步英雄 Timing 数据…' : '正在通过 OpenDota durations 同步英雄 Timing 数据…')
    const progressTimer = setInterval(() => {
      window.electronStore.getHeroTimingSyncProgress().then(progress => {
        if (progress) setStatusMsg(`正在通过 OpenDota durations 同步英雄 Timing 数据…（${progress.completed}/${progress.total}，无 API Key 时每个英雄约需数秒，请耐心等待）`)
      })
    }, 1000)
    try {
      const result = await window.electronStore.syncHeroTimings(true)
      const cache = await window.electronStore.getHeroTimingCache()
      setTimingCache(cache)
      setStatusMsg(`已同步 Timing 数据：${result.heroCount} 个英雄${result.errors.length ? `，${result.errors.length} 个失败` : ''}（数据源 ${cache?.source === 'stratz' ? 'Stratz' : 'OpenDota'}）。`)
    } catch (error) {
      setStatusMsg(error instanceof Error ? error.message : String(error))
    } finally {
      clearInterval(progressTimer)
      setSyncingTimings(false)
      setTimeout(() => setStatusMsg(''), 6000)
    }
  }

  return (
    <div className="p-6 space-y-6 max-w-lg mx-auto">
      <div>
        <button type="button" onClick={() => navigate('/')} className="text-xs text-[var(--text-muted)] hover:text-[var(--text-secondary)] mb-3">← 返回</button>
        <h1 className="text-xl font-bold text-[var(--text-primary)]">设置</h1>
      </div>

      {statusMsg && (
        <div className="px-4 py-3 rounded-lg border border-[var(--border-info)] bg-[var(--bg-info)] text-[var(--text-info)] text-sm">
          {statusMsg}
        </div>
      )}

      <div className="space-y-3 rounded-lg border border-[var(--border-info)] bg-[var(--bg-info)] p-4">
        <h2 className="text-sm font-semibold text-[var(--text-info)]">英雄池已移到英雄中心</h2>
        <p className="text-xs leading-5 text-[var(--text-info)]">个人英雄池、熟练度和可用位置现在统一在「英雄中心」管理；设置页只保留 API、数据同步、训练周期和备份。</p>
        <button
          type="button"
          onClick={() => navigate('/hero-notes')}
          className="rounded-lg border border-[var(--border-info)] px-3 py-2 text-xs font-semibold text-[var(--text-info)] transition-colors hover:bg-[var(--surface-1)]"
        >
          打开英雄中心
        </button>
      </div>

      {/* 训练周期 */}
      <div className="space-y-3">
        <h2 className="text-sm font-semibold text-[var(--text-secondary)] uppercase tracking-wider">训练周期</h2>
        <p className="text-xs text-[var(--text-muted)]">
          当前周期：{cycles.find(c => c.cycleId === appState?.activeCycleId)?.startDate ?? '未设置'}
        </p>
        <div className="space-y-2">
          <label className="block text-xs text-[var(--text-muted)]">创建新周期（起始日）</label>
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
              创建
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
                  <span className="text-xs">当前</span>
                ) : (
                  <button
                    type="button"
                    onClick={() => updateAppState({ activeCycleId: c.cycleId })}
                    className="text-xs text-[var(--accent-strong)] hover:text-[var(--text-primary)]"
                  >
                    切换
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* OpenDota */}
      <div className="space-y-3">
        <h2 className="text-sm font-semibold text-[var(--text-secondary)] uppercase tracking-wider">OpenDota</h2>
        <p className="text-xs text-[var(--text-muted)]">填写 Account ID 后，可在赛后记录页用 Match ID 自动填充英雄、胜负、时长、KDA、GPM/XPM 和补刀。</p>
        <div className="space-y-2">
          <label className="block text-xs text-[var(--text-muted)]">Account ID</label>
          <input
            type="text"
            inputMode="numeric"
            value={openDotaAccountId}
            onChange={e => setOpenDotaAccountId(e.target.value)}
            placeholder="如：123456789"
            className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--surface-1)] text-[var(--text-primary)] text-sm focus:outline-none focus:border-[var(--accent-border)]"
          />
        </div>
        <div className="space-y-2">
          <label className="block text-xs text-[var(--text-muted)]">API Key（可选）</label>
          <input
            type="password"
            value={openDotaApiKey}
            onChange={e => setOpenDotaApiKey(e.target.value)}
            placeholder="留空也可以使用公开限额"
            className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--surface-1)] text-[var(--text-primary)] text-sm focus:outline-none focus:border-[var(--accent-border)]"
          />
        </div>
        <div className="space-y-2">
          <label className="block text-xs text-[var(--text-muted)]">Draft matchup 最小样本量</label>
          <input
            type="number"
            min="1"
            value={matchupMinGames}
            onChange={e => setMatchupMinGames(e.target.value)}
            placeholder="默认 50"
            className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--surface-1)] text-[var(--text-primary)] text-sm focus:outline-none focus:border-[var(--accent-border)]"
          />
        </div>
        <button
          type="button"
          onClick={handleSaveOpenDota}
          className="w-full py-2.5 rounded-lg bg-[var(--accent)] text-[var(--text-primary)] text-sm font-semibold hover:bg-[var(--accent-strong)] transition-colors"
        >
          保存 OpenDota 设置
        </button>
      </div>

      {/* Stratz */}
      <div className="space-y-3">
        <h2 className="text-sm font-semibold text-[var(--text-secondary)] uppercase tracking-wider">Stratz（可选，英雄克制矩阵数据源）</h2>
        <p className="text-xs text-[var(--text-muted)]">
          Stratz 按天梯分段统计，单个对位常有几百到几千局。matchup 数据源固定为 Stratz；OpenDota 仅用于 Match ID 导入、benchmarks 和 durations/timing。Key 在 stratz.com 登录后自己的账号页里生成。
        </p>
        <div className="space-y-2">
          <label className="block text-xs text-[var(--text-muted)]">API Key</label>
          <input
            type="password"
            value={stratzApiKey}
            onChange={e => setStratzApiKey(e.target.value)}
            placeholder="用于同步 Stratz matchup 矩阵"
            className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--surface-1)] text-[var(--text-primary)] text-sm focus:outline-none focus:border-[var(--accent-border)]"
          />
        </div>
        <div className="space-y-2">
          <label className="block text-xs text-[var(--text-muted)]">天梯分段</label>
          <select
            value={stratzRankBracket}
            onChange={e => setStratzRankBracket(e.target.value as StratzRankBracket)}
            className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--surface-1)] text-[var(--text-primary)] text-sm focus:outline-none focus:border-[var(--accent-border)]"
          >
            {STRATZ_RANK_BRACKETS.map(item => (
              <option key={item.value} value={item.value}>{item.label}</option>
            ))}
          </select>
        </div>
        <button
          type="button"
          onClick={handleSaveStratz}
          className="w-full py-2.5 rounded-lg bg-[var(--accent)] text-[var(--text-primary)] text-sm font-semibold hover:bg-[var(--accent-strong)] transition-colors"
        >
          保存 Stratz 设置
        </button>
      </div>

      {/* 英雄克制矩阵同步（共用：优先 Stratz，未配置时用 OpenDota） */}
      <div className="space-y-3">
        <h2 className="text-sm font-semibold text-[var(--text-secondary)] uppercase tracking-wider">英雄克制矩阵</h2>
        <div className="pt-1 space-y-2">
          <p className="text-xs text-[var(--text-muted)]">
            本周 matchup 矩阵：{matchupCache
              ? `${matchupCache.weekKey ?? matchupCache.date} · ${matchupCache.heroCount} 个英雄 · ${matchupCache.matchupCount} 条对位 · 数据源 Stratz · 有效期至 ${formatCacheTime(matchupCache.expiresAt)}`
              : '尚未同步'}
          </p>
          <button
            type="button"
            onClick={handleSyncMatchups}
            disabled={syncingMatchups}
            className="w-full py-2.5 rounded-lg border border-[var(--border)] text-sm font-medium text-[var(--text-secondary)] hover:border-[var(--accent-border)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {syncingMatchups ? '同步中…' : '同步本周 matchup 矩阵'}
          </button>
        </div>
      </div>

      {/* 英雄 Timing 同步（OpenDota durations） */}
      <div className="space-y-3">
        <h2 className="text-sm font-semibold text-[var(--text-secondary)] uppercase tracking-wider">英雄 Timing 数据</h2>
        <div className="pt-1 space-y-2">
          <p className="text-xs text-[var(--text-muted)]">
            {timingCache
              ? `${timingCache.date} · ${timingCache.heroCount} 个英雄 · ${timingCache.errors?.length ? `${timingCache.errors.length} 个失败` : '完整缓存'} · 数据源 ${timingCache.source === 'stratz' ? 'Stratz' : 'OpenDota'}`
              : '尚未同步'}
          </p>
          <p className="text-xs leading-5 text-[var(--text-muted)]">Timing 只用于 Draft 的强势期标签和“我的英雄 vs 敌方阵容时间线”，不会参与 Stratz matchup 分数。</p>
          <button
            type="button"
            onClick={handleSyncTimings}
            disabled={syncingTimings}
            className="w-full py-2.5 rounded-lg border border-[var(--border)] text-sm font-medium text-[var(--text-secondary)] hover:border-[var(--accent-border)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {syncingTimings ? '同步中…' : '同步英雄 Timing 数据'}
          </button>
        </div>
      </div>

      {/* 位置热门英雄 */}
      <div className="space-y-3">
        <h2 className="text-sm font-semibold text-[var(--text-secondary)] uppercase tracking-wider">位置热门英雄</h2>
        <p className="text-xs leading-5 text-[var(--text-muted)]">
          Draft 未知位置预期使用 {POSITION_META.source === 'stratz' ? 'Stratz' : '本地默认'} · {POSITION_META.rankBracket ?? 'ALL'} · {POSITION_META.weekKey}；
          每位置数量：{(['1', '2', '3', '4', '5'] as const).map(position => `${position}号位 ${POSITION_META.positions[position]?.length ?? 0}`).join(' / ')}。
        </p>
        <p className="text-xs leading-5 text-[var(--text-muted)]">
          维护方式：Stratz 负责位置热门度，英雄池 matchup 关系负责判断这些热门英雄对你的候选三号位是机会还是风险。
        </p>
      </div>

      {/* 数据备份 */}
      <div className="space-y-3">
        <h2 className="text-sm font-semibold text-[var(--text-secondary)] uppercase tracking-wider">数据备份</h2>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={handleExport}
            disabled={exporting}
            className="flex-1 py-2.5 rounded-lg border border-[var(--border)] text-sm font-medium text-[var(--text-secondary)] hover:border-[var(--accent-border)] disabled:opacity-40 transition-colors"
          >
            {exporting ? '导出中…' : '导出 JSON'}
          </button>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={importing}
            className="flex-1 py-2.5 rounded-lg border border-[var(--border)] text-sm font-medium text-[var(--text-secondary)] hover:border-[var(--accent-border)] disabled:opacity-40 transition-colors"
          >
            {importing ? '导入中…' : '导入 JSON'}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json"
            onChange={handleImport}
            className="hidden"
          />
        </div>
        <p className="text-xs text-[var(--text-muted)]">导入后建议重启应用以确保数据完整加载。</p>
      </div>
    </div>
  )
}
