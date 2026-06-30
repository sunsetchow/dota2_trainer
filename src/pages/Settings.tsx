import React, { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAppState, useCycles } from '../store/useStore.ts'
import { getPool } from '../utils/heroes.ts'
import type { HeroConfig, HeroMatchupCache, TrainingCycle } from '../types'
import { nanoid } from 'nanoid'

const ALL_POOL = getPool()

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
  const [statusMsg, setStatusMsg] = useState('')
  const [syncingMatchups, setSyncingMatchups] = useState(false)
  const [matchupCache, setMatchupCache] = useState<HeroMatchupCache | null>(null)

  const heroPool: HeroConfig[] = appState?.heroPool ?? []

  useEffect(() => {
    setOpenDotaAccountId(appState?.openDota?.accountId ?? '')
    setOpenDotaApiKey(appState?.openDota?.apiKey ?? '')
  }, [appState?.openDota?.accountId, appState?.openDota?.apiKey])

  useEffect(() => {
    window.electronStore.getHeroMatchupCache()
      .then(setMatchupCache)
      .catch(() => undefined)
  }, [])

  const isActive = (name: string) => heroPool.some(h => h.name === name && h.active)

  const toggleHero = async (name: string) => {
    if (!appState) return
    const existing = heroPool.find(h => h.name === name)
    let newPool: HeroConfig[]
    if (existing) {
      newPool = heroPool.map(h => h.name === name ? { ...h, active: !h.active } : h)
    } else {
      newPool = [...heroPool, { name, active: true }]
    }
    await updateAppState({ heroPool: newPool })
  }

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
      },
    })
    setStatusMsg('OpenDota 设置已保存。')
    setTimeout(() => setStatusMsg(''), 3000)
  }

  const handleSyncMatchups = async () => {
    setSyncingMatchups(true)
    setStatusMsg('正在同步英雄克制数据，首次同步可能需要 1-3 分钟。')
    try {
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

      {/* 英雄池配置 */}
      <div className="space-y-3">
        <h2 className="text-sm font-semibold text-[var(--text-secondary)] uppercase tracking-wider">英雄池配置</h2>
        <p className="text-xs text-[var(--text-muted)]">勾选后，Draft 助手将优先显示池中英雄，HeroSelector 也仅列出已激活英雄。</p>
        <div className="grid grid-cols-3 gap-2">
          {ALL_POOL.map(hero => (
            <label
              key={hero}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer transition-all ${
                isActive(hero)
                  ? 'border-blue-500 bg-blue-500/10'
                  : 'border-[var(--border)] bg-[var(--surface-1)] hover:border-blue-400/50'
              }`}
            >
              <input
                type="checkbox"
                checked={isActive(hero)}
                onChange={() => toggleHero(hero)}
                className="w-3.5 h-3.5 accent-blue-500"
              />
              <span className="text-xs text-[var(--text-primary)] leading-tight">{hero}</span>
            </label>
          ))}
        </div>
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
              className="flex-1 px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--surface-1)] text-[var(--text-primary)] text-sm focus:outline-none focus:border-blue-500"
            />
            <button
              type="button"
              onClick={handleNewCycle}
              disabled={!newStartDate}
              className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
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
                    ? 'border-blue-500 bg-blue-500/10 text-blue-300'
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
                    className="text-xs text-blue-400 hover:text-blue-300"
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
            className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--surface-1)] text-[var(--text-primary)] text-sm focus:outline-none focus:border-blue-500"
          />
        </div>
        <div className="space-y-2">
          <label className="block text-xs text-[var(--text-muted)]">API Key（可选）</label>
          <input
            type="password"
            value={openDotaApiKey}
            onChange={e => setOpenDotaApiKey(e.target.value)}
            placeholder="留空也可以使用公开限额"
            className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--surface-1)] text-[var(--text-primary)] text-sm focus:outline-none focus:border-blue-500"
          />
        </div>
        <button
          type="button"
          onClick={handleSaveOpenDota}
          className="w-full py-2.5 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-500 transition-colors"
        >
          保存 OpenDota 设置
        </button>
        <div className="pt-2 space-y-2">
          <p className="text-xs text-[var(--text-muted)]">
            英雄克制缓存：{matchupCache
              ? `${matchupCache.date} · ${matchupCache.heroCount} 个英雄 · ${matchupCache.matchupCount} 条对位`
              : '尚未同步'}
          </p>
          <button
            type="button"
            onClick={handleSyncMatchups}
            disabled={syncingMatchups}
            className="w-full py-2.5 rounded-lg border border-[var(--border)] text-sm font-medium text-[var(--text-secondary)] hover:border-blue-400 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {syncingMatchups ? '同步中…' : '立即同步英雄克制数据'}
          </button>
        </div>
      </div>

      {/* 数据备份 */}
      <div className="space-y-3">
        <h2 className="text-sm font-semibold text-[var(--text-secondary)] uppercase tracking-wider">数据备份</h2>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={handleExport}
            disabled={exporting}
            className="flex-1 py-2.5 rounded-lg border border-[var(--border)] text-sm font-medium text-[var(--text-secondary)] hover:border-blue-400 disabled:opacity-40 transition-colors"
          >
            {exporting ? '导出中…' : '导出 JSON'}
          </button>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={importing}
            className="flex-1 py-2.5 rounded-lg border border-[var(--border)] text-sm font-medium text-[var(--text-secondary)] hover:border-blue-400 disabled:opacity-40 transition-colors"
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
