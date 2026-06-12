'use client'

import * as React from 'react'
import { cn } from '@/lib/utils'

type BadgeVariant = 'default' | 'primary' | 'success' | 'warning' | 'danger' | 'info' | 'cyan' | 'violet'

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant
  dot?: boolean
}

const VARIANT_STYLES: Record<BadgeVariant, string> = {
  default: 'bg-[var(--color-surface)] text-[var(--color-text-secondary)]',
  primary: 'bg-[var(--color-primary-muted)] text-[var(--color-primary-hover)]',
  success: 'bg-[var(--color-success-muted)] text-[var(--color-success)]',
  warning: 'bg-[var(--color-warning-muted)] text-[var(--color-warning)]',
  danger: 'bg-[var(--color-danger-muted)] text-[var(--color-danger)]',
  info: 'bg-[var(--color-info-muted)] text-[var(--color-info)]',
  cyan: 'bg-[var(--color-accent-cyan-muted)] text-[var(--color-accent-cyan)]',
  violet: 'bg-[var(--color-accent-violet-muted)] text-[var(--color-accent-violet)]',
}

const Badge = React.forwardRef<HTMLSpanElement, BadgeProps>(
  ({ className, variant = 'default', dot, children, ...props }, ref) => (
    <span
      ref={ref}
      className={cn(
        'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-[var(--radius-sm)] text-xs font-medium',
        VARIANT_STYLES[variant],
        className
      )}
      {...props}
    >
      {dot && <span className="w-1.5 h-1.5 rounded-full bg-current" />}
      {children}
    </span>
  )
)
Badge.displayName = 'Badge'

export { Badge }
