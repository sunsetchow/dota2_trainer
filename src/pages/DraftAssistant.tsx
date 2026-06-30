import React, { useEffect, useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAppState } from '../store/useStore.ts'
import { resolve, getSugg, getPool, getSupMap, getCounters, getCountered } from '../utils/heroes.ts'
import type { HeroMatchupCache } from '../types'

const POOL = getPool()
const SUP_MAP = getSupMap()
const COUNTERS = getCounters()
const COUNTERED = getCountered()

const Badge = ({ val, type }: { val: number; type: 'good' | 'bad' }) => {
  const s = type === 'good'
    ? { bg: 'var(--bg-success)', color: 'var(--text-success)' }
    : { bg: 'var(--bg-danger)', color: 'var(--text-danger)' }
  return (
    <span style={{ fontSize: 11, padding: '1px 6px', borderRadius: 4, background: s.bg, color: s.color, fontWeight: 500 }}>
      {val > 0 ? '+' : ''}{val.toFixed(1)}%
    </span>
  )
}

interface HeroCardProps {
  hero: string
  threat: number
  cScore: number
  counters: Record<string, number>
  threats: Record<string, number>
  topIdx: number
  onSelect: (hero: string) => void
  isInPool: boolean
}

const HeroCard = ({ hero, threat, cScore, counters, threats, topIdx, onSelect, isInPool }: HeroCardProps) => {
  const [open, setOpen] = useState(false)
  const cList = Object.entries(counters).sort((a, b) => b[1] - a[1]).slice(0, 6)
  const tList = Object.entries(threats).sort((a, b) => b[1] - a[1]).slice(0, 5)
  const isTop = topIdx === 0 && !threat
  const isTh = threat > 0
  const bc = isTop ? 'var(--border-success)' : isTh ? 'var(--border-danger)' : 'var(--border)'
  const bg = isTop ? 'var(--bg-success)' : isTh ? 'var(--bg-danger)' : 'var(--surface-1)'

  return (
    <div
      style={{ cursor: 'pointer', border: `0.5px solid ${bc}`, borderRadius: 10, padding: '12px 14px', marginBottom: 8, background: bg }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }} onClick={() => setOpen(o => !o)}>
          <span style={{ width: 30, height: 30, borderRadius: 6, background: 'var(--surface-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 500, color: 'var(--text-secondary)' }}>
            {hero.slice(0, 1)}
          </span>
          <span style={{ fontWeight: 500, fontSize: 15, color: 'var(--text-primary)' }}>{hero}</span>
          {isTh && <Badge val={-threat} type="bad" />}
          {isTop && (
            <span style={{ fontSize: 11, padding: '1px 6px', borderRadius: 4, background: 'var(--bg-success)', color: 'var(--text-success)', fontWeight: 500 }}>推荐</span>
          )}
          {!isInPool && (
            <span style={{ fontSize: 11, padding: '1px 6px', borderRadius: 4, background: 'var(--bg-warning)', color: 'var(--text-warning)', fontWeight: 500 }}>不在池中</span>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>counter强度</span>
          <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-success)' }}>{cScore.toFixed(1)}%</span>
          <button
            type="button"
            onClick={() => onSelect(hero)}
            style={{ fontSize: 11, padding: '2px 10px', borderRadius: 6, background: 'var(--border)', color: 'var(--text-primary)', border: '0.5px solid var(--border)', cursor: 'pointer' }}
          >
            选择 →
          </button>
          <span style={{ color: 'var(--text-muted)', fontSize: 11 }} onClick={() => setOpen(o => !o)}>{open ? '▲' : '▼'}</span>
        </div>
      </div>
      {open && (
        <div style={{ marginTop: 12, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, borderTop: '0.5px solid var(--border)', paddingTop: 12 }}>
          <div>
            <div style={{ fontSize: 11, color: 'var(--text-success)', fontWeight: 500, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 1 }}>克制对手</div>
            {cList.map(([h, v]) => (
              <div key={h} style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0', borderBottom: '0.5px solid var(--border)' }}>
                <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{h}</span>
                <Badge val={v} type="good" />
              </div>
            ))}
          </div>
          <div>
            <div style={{ fontSize: 11, color: 'var(--text-danger)', fontWeight: 500, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 1 }}>注意被克</div>
            {tList.map(([h, v]) => (
              <div key={h} style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0', borderBottom: '0.5px solid var(--border)' }}>
                <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{h}</span>
                <Badge val={-v} type="bad" />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export default function DraftAssistant() {
  const navigate = useNavigate()
  const { appState } = useAppState()
  const [s1, setS1] = useState('')
  const [s2, setS2] = useState('')
  const [f1, setF1] = useState(false)
  const [f2, setF2] = useState(false)
  const [matchupCache, setMatchupCache] = useState<HeroMatchupCache | null>(null)
  const [syncStatus, setSyncStatus] = useState('')

  // 当前英雄池（只显示已激活的英雄）
  const activePool = appState?.heroPool.filter(h => h.active).map(h => h.name) ?? POOL

  const sg1 = s1 ? getSugg(s1) : []
  const sg2 = s2 ? getSugg(s2) : []

  useEffect(() => {
    let cancelled = false

    window.electronStore.getHeroMatchupCache()
      .then(cache => {
        if (!cancelled && cache) setMatchupCache(cache)
      })
      .catch(() => undefined)

    setSyncStatus('正在检查今日英雄克制数据…')
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

    return () => {
      cancelled = true
    }
  }, [])

  const getDynamicAdvantage = (hero: string, enemy: string): number | null => {
    const stats = matchupCache?.matchups[hero]?.[enemy]
    if (!stats || stats.gamesPlayed < 50) return null
    return stats.advantage
  }

  const getDynamicCounterScore = (hero: string): number => {
    const matchups = matchupCache?.matchups[hero]
    if (!matchups) return 0
    const topAdvantages = Object.values(matchups)
      .filter(stats => stats.gamesPlayed >= 50 && stats.advantage > 0)
      .sort((a, b) => b.advantage - a.advantage)
      .slice(0, 10)
      .map(stats => stats.advantage)
    if (topAdvantages.length === 0) return 0
    return topAdvantages.reduce((sum, value) => sum + value, 0) / topAdvantages.length
  }

  const threatMap = useMemo(() => {
    const c1 = resolve(s1), c2 = resolve(s2)
    const enemies = [c1, c2].filter((item): item is string => Boolean(item))
    const m1 = c1 ? (SUP_MAP[c1] || {}) : {}
    const m2 = c2 ? (SUP_MAP[c2] || {}) : {}
    const out: Record<string, number> = {}
    for (const h of POOL) {
      const dynamicThreat = enemies.reduce((sum, enemy) => {
        const advantage = getDynamicAdvantage(h, enemy)
        return sum + (advantage === null ? 0 : Math.max(0, -advantage))
      }, 0)
      const staticThreat = (m1[h] || 0) + (m2[h] || 0)
      const sc = dynamicThreat > 0 ? dynamicThreat : staticThreat
      if (sc > 0) out[h] = sc
    }
    return out
  }, [s1, s2, matchupCache])

  const ranked = useMemo(() =>
    POOL.map(h => ({
      hero: h,
      threat: threatMap[h] || 0,
      cScore: getDynamicCounterScore(h) || Object.values(COUNTERS[h] || {}).reduce((a: number, b: number) => a + b, 0),
    })).sort((a, b) => (b.cScore - b.threat * 2) - (a.cScore - a.threat * 2)),
    [threatMap, matchupCache]
  )

  const handleSelectHero = (hero: string) => {
    const enemySupports = [resolve(s1), resolve(s2)].filter(Boolean) as string[]
    navigate('/pre-game', { state: { hero, enemySupports } })
  }

  const inp = {
    width: '100%', boxSizing: 'border-box' as const, padding: '9px 12px',
    border: '0.5px solid var(--border)', borderRadius: 'var(--radius)',
    background: 'var(--surface-1)', color: 'var(--text-primary)', fontSize: 14,
  }

  const SuggBox = ({ items, onSelect }: { items: string[]; onSelect: (h: string) => void }) =>
    !items.length ? null : (
      <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 100, background: 'var(--surface-2)', border: '0.5px solid var(--border)', borderRadius: 'var(--radius)', marginTop: 2, maxHeight: 180, overflowY: 'auto' }}>
        {items.map(h => (
          <div
            key={h}
            onMouseDown={() => onSelect(h)}
            style={{ padding: '8px 12px', cursor: 'pointer', fontSize: 13, color: 'var(--text-primary)' }}
            onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-1)')}
            onMouseLeave={e => (e.currentTarget.style.background = '')}
          >{h}</div>
        ))}
      </div>
    )

  return (
    <div style={{ padding: '0 0 24px', maxWidth: 700, margin: '0 auto' }}>
      <div style={{ padding: '24px 24px 0' }}>
        <div style={{ marginBottom: 18 }}>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 500, letterSpacing: '1.5px', textTransform: 'uppercase', marginBottom: 4 }}>
            {matchupCache ? `OpenDota · ${matchupCache.date}` : '本地克制数据'}
          </div>
          <div style={{ fontSize: 20, fontWeight: 500, color: 'var(--text-primary)', marginBottom: 2 }}>三号位 Draft 助手</div>
          <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>输入对方两个辅助（支持昵称：屠夫/先知/奶骑/冰女/AA/CM…）</div>
          {syncStatus && (
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6 }}>{syncStatus}</div>
          )}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
          {([[s1, setS1, sg1, f1, setF1], [s2, setS2, sg2, f2, setF2]] as const).map(([val, setVal, sg, focus, setFocus], i) => (
            <div key={i} style={{ position: 'relative' }}>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 500, marginBottom: 5 }}>对方辅助 {i + 1}</div>
              <input
                value={val}
                onChange={e => setVal(e.target.value)}
                onFocus={() => setFocus(true)}
                onBlur={() => setTimeout(() => setFocus(false), 150)}
                placeholder={i === 0 ? '如：屠夫、先知、奶骑…' : '如：AA、大树、CM…'}
                style={inp}
              />
              {focus && <SuggBox items={sg} onSelect={h => { setVal(h); setFocus(false) }} />}
            </div>
          ))}
        </div>

        {Object.keys(threatMap).length > 0 && (
          <div style={{ background: 'var(--bg-danger)', border: '0.5px solid var(--border-danger)', borderRadius: 'var(--radius)', padding: '10px 14px', marginBottom: 14, fontSize: 13, color: 'var(--text-danger)' }}>
            <strong>辅助克制警告：</strong>
            {Object.entries(threatMap).sort((a, b) => b[1] - a[1]).map(([h, v]) => (
              <span key={h} style={{ marginRight: 10 }}><b>{h}</b> <span style={{ color: 'var(--text-danger)' }}>-{v.toFixed(1)}%</span></span>
            ))}
          </div>
        )}

        <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 500, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 }}>
          推荐选人（点击展开 · 点"选择"跳转赛前设定）
        </div>
      </div>

      <div style={{ padding: '0 24px' }}>
        {ranked.map((r, i) => (
          <HeroCard
            key={r.hero}
            {...r}
            counters={COUNTERS[r.hero] || {}}
            threats={COUNTERED[r.hero] || {}}
            topIdx={i}
            onSelect={handleSelectHero}
            isInPool={activePool.includes(r.hero)}
          />
        ))}
      </div>

      <div style={{ marginTop: 16, fontSize: 11, color: 'var(--text-muted)', textAlign: 'center' }}>
        数据来源：{matchupCache ? `OpenDota 英雄对位缓存 · ${new Date(matchupCache.syncedAt).toLocaleString('zh-CN')}` : '本地手工克制表'}
      </div>
    </div>
  )
}
