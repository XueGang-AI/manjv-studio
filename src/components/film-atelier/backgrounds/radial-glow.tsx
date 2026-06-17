'use client'

import * as React from 'react'
import { cn } from '@/lib/utils'

export type RadialGlowProps = Omit<React.HTMLAttributes<HTMLDivElement>, 'children'>

const RadialGlow = React.forwardRef<HTMLDivElement, RadialGlowProps>(
  ({ className, style, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        'pointer-events-none absolute inset-0',
        className
      )}
      aria-hidden="true"
      style={{
        background: 'var(--bg-radial)',
        ...style,
      }}
      {...props}
    />
  )
)

RadialGlow.displayName = 'RadialGlow'

export { RadialGlow }
