import React, { useState, useRef, useEffect } from 'react'
import { getSugg } from '../utils/heroes.ts'
import { getAllOpenDotaHeroNames, getOpenDotaHeroSuggestions } from '../utils/opendotaHeroes.ts'

interface HeroSelectorProps {
  label?: string
  value: string
  onChange: (v: string) => void
  heroPool?: string[]   // 若提供则只从池中选；否则全 supMap
  placeholder?: string
}

export default function HeroSelector({
  label = '英雄',
  value,
  onChange,
  heroPool,
  placeholder = '搜索英雄（支持别名）…',
}: HeroSelectorProps) {
  const [focused, setFocused] = useState(false)
  const [query, setQuery] = useState(value)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => { setQuery(value) }, [value])

  const suggestions = query
    ? getSugg(query).filter(h => !heroPool || heroPool.includes(h))
    : heroPool
      ? heroPool.slice(0, 8)
      : getAllOpenDotaHeroNames().slice(0, 8)

  const fullPoolSuggestions = query && !heroPool
    ? getOpenDotaHeroSuggestions(query)
    : suggestions

  const handleSelect = (h: string) => {
    onChange(h)
    setQuery(h)
    setFocused(false)
  }

  return (
    <div ref={containerRef} className="relative">
      {label && (
        <label className="block text-xs font-medium text-[var(--text-muted)] uppercase tracking-wider mb-1">
          {label}
        </label>
      )}
      <input
        type="text"
        value={query}
        onChange={e => {
          setQuery(e.target.value)
          onChange(e.target.value)
        }}
        onFocus={() => setFocused(true)}
        onBlur={() => setTimeout(() => setFocused(false), 150)}
        placeholder={placeholder}
        className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--surface-1)] text-[var(--text-primary)] text-sm focus:outline-none focus:border-blue-500"
      />
      {focused && fullPoolSuggestions.length > 0 && (
        <div className="absolute top-full left-0 right-0 z-50 mt-1 bg-[var(--surface-2)] border border-[var(--border)] rounded-lg shadow-lg max-h-48 overflow-y-auto">
          {fullPoolSuggestions.map(h => (
            <div
              key={h}
              onMouseDown={() => handleSelect(h)}
              className="px-3 py-2 text-sm text-[var(--text-primary)] cursor-pointer hover:bg-[var(--surface-1)]"
            >
              {h}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
