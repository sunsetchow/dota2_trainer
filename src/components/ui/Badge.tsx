import React from 'react'

type BadgeTone = 'neutral' | 'accent' | 'success' | 'danger' | 'warning' | 'info'

interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone
}

const toneClass: Record<BadgeTone, string> = {
  neutral: 'border-[var(--border)] bg-[var(--surface-2)] text-[var(--text-secondary)]',
  accent: 'border-[var(--accent-border)] bg-[var(--accent-muted)] text-[var(--accent-strong)]',
  success: 'border-[var(--border-success)] bg-[var(--bg-success)] text-[var(--text-success)]',
  danger: 'border-[var(--border-danger)] bg-[var(--bg-danger)] text-[var(--text-danger)]',
  warning: 'border-[var(--border-warning)] bg-[var(--bg-warning)] text-[var(--text-warning)]',
  info: 'border-[var(--border-info)] bg-[var(--bg-info)] text-[var(--text-info)]',
}

export default function Badge({ tone = 'neutral', className = '', children, ...props }: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center rounded-[var(--radius-sm)] border px-2 py-0.5 text-[11px] font-semibold leading-5 ${toneClass[tone]} ${className}`}
      {...props}
    >
      {children}
    </span>
  )
}
