import React from 'react'

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'
type ButtonSize = 'sm' | 'md' | 'lg'

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  fullWidth?: boolean
}

const variantClass: Record<ButtonVariant, string> = {
  primary: 'border-[var(--accent-border)] bg-[var(--accent)] text-[var(--text-primary)] hover:bg-[var(--accent-strong)] shadow-[0_10px_30px_rgba(185,52,39,0.18)]',
  secondary: 'border-[var(--border-strong)] bg-[var(--surface-2)] text-[var(--text-primary)] hover:border-[var(--accent-border)] hover:bg-[var(--surface-3)]',
  ghost: 'border-transparent bg-transparent text-[var(--text-secondary)] hover:bg-[var(--surface-2)] hover:text-[var(--text-primary)]',
  danger: 'border-[var(--border-danger)] bg-[var(--bg-danger)] text-[var(--text-danger)] hover:bg-[var(--accent-muted)]',
}

const sizeClass: Record<ButtonSize, string> = {
  sm: 'px-3 py-1.5 text-xs',
  md: 'px-4 py-2 text-sm',
  lg: 'px-5 py-3 text-sm',
}

export default function Button({
  variant = 'secondary',
  size = 'md',
  fullWidth = false,
  className = '',
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      type={props.type ?? 'button'}
      className={`inline-flex items-center justify-center gap-2 rounded-[var(--radius-md)] border font-semibold transition-all duration-200 active:translate-y-px disabled:cursor-not-allowed disabled:opacity-45 ${variantClass[variant]} ${sizeClass[size]} ${fullWidth ? 'w-full' : ''} ${className}`}
      {...props}
    >
      {children}
    </button>
  )
}
