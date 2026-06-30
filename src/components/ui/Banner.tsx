import React from 'react'

interface BannerProps extends React.HTMLAttributes<HTMLDivElement> {
  tone?: 'info' | 'warning' | 'danger' | 'success'
  action?: React.ReactNode
}

const toneClass = {
  info: 'border-[var(--border-info)] bg-[var(--bg-info)] text-[var(--text-info)]',
  warning: 'border-[var(--border-warning)] bg-[var(--bg-warning)] text-[var(--text-warning)]',
  danger: 'border-[var(--border-danger)] bg-[var(--bg-danger)] text-[var(--text-danger)]',
  success: 'border-[var(--border-success)] bg-[var(--bg-success)] text-[var(--text-success)]',
}

export default function Banner({ tone = 'info', action, className = '', children, ...props }: BannerProps) {
  return (
    <div
      className={`flex items-center justify-between gap-3 rounded-[var(--radius-md)] border px-4 py-3 text-sm ${toneClass[tone]} ${className}`}
      {...props}
    >
      <div className="min-w-0 leading-relaxed">{children}</div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  )
}
