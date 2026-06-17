'use client'

import * as React from 'react'
import { cn } from '@/lib/utils'

export interface GridPatternProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Grid cell width in pixels (default: 40) */
  width?: number
  /** Grid cell height in pixels (default: 40) */
  height?: number
}

const GridPattern = React.memo(
  React.forwardRef<HTMLDivElement, GridPatternProps>(
    ({ width = 40, height = 40, className, ...props }, ref) => {
      const uid = React.useId()

      return (
        <div
          ref={ref}
          className={cn(
            'pointer-events-none absolute inset-0 overflow-hidden',
            className
          )}
          aria-hidden="true"
          {...props}
        >
          <svg
            className="absolute inset-0 h-full w-full"
            xmlns="http://www.w3.org/2000/svg"
          >
            <defs>
              <pattern
                id={`${uid}-grid`}
                x="0"
                y="0"
                width={width}
                height={height}
                patternUnits="userSpaceOnUse"
              >
                <path
                  d={`M ${width} 0 L 0 0 0 ${height}`}
                  fill="none"
                  stroke="var(--grid-color, rgba(255,255,255,0.025))"
                  strokeWidth="0.5"
                />
              </pattern>
              <radialGradient id={`${uid}-mask`} cx="50%" cy="50%" r="70%">
                <stop offset="0%" stopColor="white" stopOpacity="1" />
                <stop offset="60%" stopColor="white" stopOpacity="0.8" />
                <stop offset="100%" stopColor="white" stopOpacity="0" />
              </radialGradient>
              <mask id={`${uid}-fade`}>
                <rect width="100%" height="100%" fill={`url(#${uid}-mask)`} />
              </mask>
            </defs>
            <rect
              width="100%"
              height="100%"
              fill={`url(#${uid}-grid)`}
              mask={`url(#${uid}-fade)`}
            />
          </svg>
        </div>
      )
    }
  )
)

GridPattern.displayName = 'GridPattern'

export { GridPattern }
