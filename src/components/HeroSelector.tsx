import React, { useState, useRef, useEffect, useMemo } from 'react'
import { getSugg } from '../utils/heroes.ts'
import { getAllOpenDotaHeroNames, getOpenDotaHeroSuggestions } from '../utils/opendotaHeroes.ts'

interface HeroSelectorProps {
  label?: string
  value: string
  onChange: (v: string) => void
  heroPool?: string[]
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
  const [activeIndex, setActiveIndex] = useState(0)
  const inputId = useMemo(() => `hero-selector-${Math.random().toString(36).slice(2)}`, [])
  const listboxId = `${inputId}-listbox`

  useEffect(() => { setQuery(value) }, [value])
  useEffect(() => { setActiveIndex(0) }, [query, focused])

  const suggestions = query
    ? getSugg(query).filter(h => !heroPool || heroPool.includes(h))
    : heroPool
      ? heroPool.slice(0, 8)
      : getAllOpenDotaHeroNames().slice(0, 8)

  const fullPoolSuggestions = query && !heroPool
    ? getOpenDotaHeroSuggestions(query)
    : suggestions

  const isOpen = focused && fullPoolSuggestions.length > 0

  const handleSelect = (h: string) => {
    onChange(h)
    setQuery(h)
    setFocused(false)
  }

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (!isOpen && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
      setFocused(true)
      return
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setActiveIndex(index => Math.min(index + 1, fullPoolSuggestions.length - 1))
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActiveIndex(index => Math.max(index - 1, 0))
    } else if (event.key === 'Enter' && isOpen) {
      event.preventDefault()
      handleSelect(fullPoolSuggestions[activeIndex])
    } else if (event.key === 'Escape') {
      event.preventDefault()
      setFocused(false)
    }
  }

  return (
    <div className="relative">
      {label && (
        <label htmlFor={inputId} className="block text-xs font-medium text-[var(--text-muted)] uppercase tracking-wider mb-1">
          {label}
        </label>
      )}
      <input
        id={inputId}
        type="text"
        role="combobox"
        aria-expanded={isOpen}
        aria-controls={listboxId}
        aria-activedescendant={isOpen ? `${listboxId}-${activeIndex}` : undefined}
        aria-autocomplete="list"
        value={query}
        onChange={e => {
          setQuery(e.target.value)
          onChange(e.target.value)
        }}
        onFocus={() => setFocused(true)}
        onBlur={() => setTimeout(() => setFocused(false), 150)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--surface-1)] text-[var(--text-primary)] text-sm focus:outline-none focus:border-[var(--accent-border)]"
      />
      {isOpen && (
        <div
          id={listboxId}
          role="listbox"
          className="absolute top-full left-0 right-0 z-50 mt-1 max-h-48 overflow-y-auto rounded-lg border border-[var(--border)] bg-[var(--surface-2)] shadow-lg"
        >
          {fullPoolSuggestions.map((h, index) => (
            <div
              key={h}
              id={`${listboxId}-${index}`}
              role="option"
              aria-selected={activeIndex === index}
              onMouseEnter={() => setActiveIndex(index)}
              onMouseDown={() => handleSelect(h)}
              className={`cursor-pointer px-3 py-2 text-sm ${
                activeIndex === index
                  ? 'bg-[var(--accent-muted)] text-[var(--accent-strong)]'
                  : 'text-[var(--text-primary)] hover:bg-[var(--surface-1)]'
              }`}
            >
              {h}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
