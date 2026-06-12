'use client'

import * as React from 'react'
import { cn } from '@/lib/utils'

type ButtonVariant = 'default' | 'aurora' | 'outline' | 'ghost' | 'destructive' | 'cyan'
type ButtonSize = 'sm' | 'md' | 'lg'

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  icon?: React.ReactNode
}

const VARIANT_STYLES: Record<ButtonVariant, string> = {
  default: 'bg-[var(--color-primary)] text-white hover:bg-[var(--color-primary-hover)] shadow-[var(--glow-primary)]',
  aurora: 'text-white shadow-[var(--glow-aurora)]',
  outline: 'bg-[var(--color-surface)] text-[var(--color-text-primary)] border border-[var(--color-border-default)] hover:border-[var(--color-border-bright)] hover:bg-[var(--color-elevated)]',
  ghost: 'bg-transparent text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-surface)]',
  destructive: 'bg-[var(--color-danger-muted)] text-[var(--color-danger)] hover:bg-[var(--color-danger)] hover:text-white',
  cyan: 'bg-[var(--color-accent-cyan-muted)] text-[var(--color-accent-cyan)] hover:bg-[var(--color-accent-cyan)] hover:text-[var(--bg-base)]',
}

const SIZE_STYLES: Record<ButtonSize, string> = {
  sm: 'h-8 px-3 text-xs gap-1.5',
  md: 'h-10 px-4 text-sm gap-2',
  lg: 'h-12 px-6 text-base gap-2.5',
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'default', size = 'md', icon, children, ...props }, ref) => {
    const auroraStyle = variant === 'aurora' ? { background: 'var(--gradient-aurora)' } : undefined
    return (
      <button
        className={cn(
          'inline-flex items-center justify-center rounded-[var(--radius-md)] font-medium transition-all duration-200',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]/50 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg-base)]',
          'disabled:pointer-events-none disabled:opacity-40 disabled:shadow-none',
          'active:scale-[0.97] cursor-pointer',
          VARIANT_STYLES[variant],
          SIZE_STYLES[size],
          className
        )}
        style={auroraStyle}
        ref={ref}
        {...props}
      >
        {icon}
        {children}
      </button>
    )
  }
)
Button.displayName = 'Button'

export { Button }
