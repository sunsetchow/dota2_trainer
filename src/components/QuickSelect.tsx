import React, { useState } from 'react'

interface QuickSelectProps {
  label: string
  options: string[]
  value: string
  onChange: (v: string) => void
  placeholder?: string
  allowCustom?: boolean
}

export default function QuickSelect({
  label,
  options,
  value,
  onChange,
  placeholder = '或自定义输入…',
  allowCustom = true,
}: QuickSelectProps) {
  const [customMode, setCustomMode] = useState(false)

  return (
    <div className="space-y-2">
      <label className="block text-xs font-medium text-[var(--text-muted)] uppercase tracking-wider">{label}</label>
      <div className="flex flex-wrap gap-2">
        {options.map(opt => (
          <button
            key={opt}
            type="button"
            onClick={() => { onChange(opt); setCustomMode(false) }}
            className={`px-3 py-1.5 rounded-lg text-sm border transition-all ${
              value === opt && !customMode
                ? 'border-[var(--accent-border)] bg-[var(--accent-muted)] text-[var(--accent-strong)]'
                : 'border-[var(--border)] bg-[var(--surface-1)] text-[var(--text-secondary)] hover:border-[var(--accent-border)]'
            }`}
          >
            {opt}
          </button>
        ))}
        {allowCustom && (
          <button
            type="button"
            onClick={() => setCustomMode(true)}
            className={`px-3 py-1.5 rounded-lg text-sm border transition-all ${
              customMode
                ? 'border-[var(--accent-border)] bg-[var(--accent-muted)] text-[var(--accent-strong)]'
                : 'border-[var(--border)] bg-[var(--surface-1)] text-[var(--text-muted)] hover:border-[var(--accent-border)]'
            }`}
          >
            自定义
          </button>
        )}
      </div>
      {allowCustom && customMode && (
        <input
          autoFocus
          type="text"
          value={options.includes(value) ? '' : value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--surface-1)] text-[var(--text-primary)] text-sm focus:outline-none focus:border-[var(--accent-border)]"
        />
      )}
    </div>
  )
}
