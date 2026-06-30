import React from 'react'

interface AlertBannerProps {
  type: 'warning' | 'danger' | 'info'
  message: string
  onDismiss?: () => void
}

export default function AlertBanner({ type, message, onDismiss }: AlertBannerProps) {
  const styles = {
    warning: 'bg-[var(--bg-warning)] border-[var(--border-warning)] text-[var(--text-warning)]',
    danger:  'bg-[var(--bg-danger)]  border-[var(--border-danger)]  text-[var(--text-danger)]',
    info:    'bg-[var(--bg-info)]    border-[var(--border-info)]    text-[var(--text-info)]',
  }

  return (
    <div className={`flex items-center justify-between gap-3 px-4 py-3 rounded-lg border text-sm font-medium ${styles[type]}`}>
      <span>{message}</span>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          className="flex-shrink-0 opacity-70 hover:opacity-100 transition-opacity text-lg leading-none"
          aria-label="关闭"
        >
          ×
        </button>
      )}
    </div>
  )
}
