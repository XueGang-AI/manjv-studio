'use client'

import * as React from 'react'
import { cn } from '@/lib/utils'

type ProgressVariant = 'primary' | 'aurora' | 'cyan' | 'success' | 'warning'
type ProgressSize = 'sm' | 'md'

export interface ProgressBarProps extends React.HTMLAttributes<HTMLDivElement> {
  value: number
  variant?: ProgressVariant
  size?: ProgressSize
}

const VARIANT_COLORS: Record<Exclude<ProgressVariant, 'aurora'>, string> = {
  primary: 'bg-[var(--color-primary)]',
  cyan: 'bg-[var(--color-accent-cyan)]',
  success: 'bg-[var(--color-success)]',
  warning: 'bg-[var(--color-warning)]',
}

const ProgressBar = React.forwardRef<HTMLDivElement, ProgressBarProps>(
  ({ className, value, variant = 'primary', size = 'sm', ...props }, ref) => {
    const pct = Math.min(100, Math.max(0, value))
    const h = size === 'sm' ? 'h-1.5' : 'h-2.5'
    const isAurora = variant === 'aurora'

    return (
      <div
        ref={ref}
        className={cn('w-full rounded-full overflow-hidden bg-[var(--bg-panel)]', h, className)}
        {...props}
      >
        <div
          className={cn('rounded-full transition-all duration-500 ease-out', h, !isAurora && VARIANT_COLORS[variant as Exclude<ProgressVariant, 'aurora'>])}
          style={isAurora ? { width: `${pct}%`, background: 'var(--gradient-aurora)' } : { width: `${pct}%` }}
        />
      </div>
    )
  }
)
ProgressBar.displayName = 'ProgressBar'

export { ProgressBar }
