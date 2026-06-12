'use client'

import * as React from 'react'
import { cn } from '@/lib/utils'

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  hover?: boolean
  auroraBorder?: boolean
}

const Card = React.forwardRef<HTMLDivElement, CardProps>(
  ({ className, hover, auroraBorder, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        'bg-[var(--bg-elevated)] border border-[var(--color-border-dim)] rounded-[var(--radius-lg)] shadow-[var(--shadow-card)]',
        auroraBorder && 'aurora-border',
        hover && 'transition-all duration-200 hover:border-[var(--color-border-bright)] hover:shadow-[var(--shadow-elevated)] hover:-translate-y-px',
        className
      )}
      {...props}
    />
  )
)
Card.displayName = 'Card'

const CardHeader = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('flex flex-col space-y-1.5 p-6', className)} {...props} />
  )
)
CardHeader.displayName = 'CardHeader'

const CardTitle = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLHeadingElement>>(
  ({ className, ...props }, ref) => (
    <h3 ref={ref} className={cn('text-lg font-semibold leading-none tracking-tight text-[var(--color-text-primary)]', className)} {...props} />
  )
)
CardTitle.displayName = 'CardTitle'

const CardContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('p-6 pt-0', className)} {...props} />
  )
)
CardContent.displayName = 'CardContent'

export { Card, CardHeader, CardTitle, CardContent }
