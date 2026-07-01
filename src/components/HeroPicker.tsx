import React, { useMemo, useState } from 'react'
import { getSugg } from '../utils/heroes.ts'
import { getConfiguredHeroPositions, isHeroPlayableAtPosition } from '../utils/heroPool.ts'
import type { DotaPosition, HeroConfig } from '../types'

interface HeroPickerProps {
  mode?: 'simple' | 'position'
  value: string
  onChange: (hero: string) => void
  targetPosition?: DotaPosition
  heroPool?: HeroConfig[]
  excludeHeroes?: string[]
  label?: string
  placeholder?: string
  showAllWhenEmpty?: boolean
}

export default function HeroPicker({
  mode = 'simple',
  value,
  onChange,
  targetPosition,
  heroPool = [],
  excludeHeroes = [],
  label = '英雄',
  placeholder = '搜索英雄（支持别名）…',
  showAllWhenEmpty = true,
}: HeroPickerProps) {
  const [focused, setFocused] = useState(false)
  const excluded = useMemo(() => new Set(excludeHeroes), [excludeHeroes])
  const configByHero = useMemo(() => new Map(heroPool.map(config => [config.name, config])), [heroPool])

  const suggestions = useMemo(() => {
    if (!focused && !value) return []
    const raw = value || showAllWhenEmpty ? getSugg(value, 200) : []
    return raw.filter(hero => {
      if (excluded.has(hero)) return false
      if (mode === 'position' && targetPosition) {
        return isHeroPlayableAtPosition(hero, targetPosition, configByHero.get(hero))
      }
      return true
    })
  }, [configByHero, excluded, focused, mode, showAllWhenEmpty, targetPosition, value])

  return (
    <div className="relative">
      {label && <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-[var(--text-muted)]">{label}</label>}
      <input
        value={value}
        onChange={event => onChange(event.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setTimeout(() => setFocused(false), 150)}
        placeholder={placeholder}
        className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface-1)] px-3 py-2 text-sm text-[var(--text-primary)] focus:border-[var(--accent-border)] focus:outline-none"
      />
      {focused && suggestions.length > 0 && (
        <div className="absolute left-0 right-0 top-full z-50 mt-1 max-h-56 overflow-y-auto rounded-lg border border-[var(--border)] bg-[var(--surface-2)] shadow-lg">
          {suggestions.map(hero => {
            const positions = getConfiguredHeroPositions(hero, configByHero.get(hero))
            return (
              <button
                key={hero}
                type="button"
                onMouseDown={() => onChange(hero)}
                className="block w-full px-3 py-2 text-left text-sm text-[var(--text-primary)] transition-colors hover:bg-[var(--surface-1)]"
              >
                <span>{hero}</span>
                {positions.length > 0 && <span className="ml-2 text-[10px] text-[var(--text-muted)]">{positions.join('/')}</span>}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
