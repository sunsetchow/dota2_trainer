import React from 'react'

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  tone?: 'default' | 'raised' | 'accent' | 'danger' | 'warning'
}

const toneClass = {
  default: 'border-[var(--border)] bg-[var(--surface-1)]',
  raised: 'border-[var(--border-strong)] bg-[var(--surface-2)] shadow-[0_18px_60px_rgba(0,0,0,0.18)]',
  accent: 'border-[var(--accent-border)] bg-[var(--accent-muted)]',
  danger: 'border-[var(--border-danger)] bg-[var(--bg-danger)]',
  warning: 'border-[var(--border-warning)] bg-[var(--bg-warning)]',
}

export default function Card({ tone = 'default', className = '', children, ...props }: CardProps) {
  return (
    <div
      className={`rounded-[var(--radius-lg)] border ${toneClass[tone]} ${className}`}
      {...props}
    >
      {children}
    </div>
  )
}
