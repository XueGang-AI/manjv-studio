'use client'

import * as React from 'react'
import { cn } from '@/lib/utils'
import { getPlaceholderImage } from '../mock-data'

export interface ImageComparisonProps extends React.HTMLAttributes<HTMLDivElement> {
  beforeUrl: string
  afterUrl: string
  beforeLabel: string
  afterLabel: string
  beforeVersion?: string
  afterVersion?: string
  beforeModel?: string
  afterModel?: string
}

/** Reduced motion detection via useSyncExternalStore */
function subscribeMediaQuery(query: string, callback: () => void) {
  const mql = window.matchMedia(query)
  mql.addEventListener('change', callback)
  return () => mql.removeEventListener('change', callback)
}

function useMediaQuery(query: string): boolean {
  const getSnapshot = React.useCallback(() => window.matchMedia(query).matches, [query])
  const getServerSnapshot = React.useCallback(() => false, [])
  const subscribe = React.useCallback(
    (callback: () => void) => subscribeMediaQuery(query, callback),
    [query]
  )
  return React.useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}

function usePrefersReducedMotion(): boolean {
  return useMediaQuery('(prefers-reduced-motion: reduce)')
}

/**
 * Film Atelier — Image Comparison
 * Before/After 图片版本对比滑块
 * 支持鼠标拖动、键盘箭头键、触摸操作
 */
const ImageComparison = React.forwardRef<HTMLDivElement, ImageComparisonProps>(
  (
    {
      beforeUrl,
      afterUrl,
      beforeLabel,
      afterLabel,
      beforeVersion,
      afterVersion,
      beforeModel,
      afterModel,
      className,
      ...props
    },
    forwardedRef,
  ) => {
    const containerRef = React.useRef<HTMLDivElement>(null)
    const prefersReduced = usePrefersReducedMotion()

    const [position, setPosition] = React.useState(50)
    const [isDragging, setIsDragging] = React.useState(false)
    const [beforeLoaded, setBeforeLoaded] = React.useState(false)
    const [afterLoaded, setAfterLoaded] = React.useState(false)
    const [beforeError, setBeforeError] = React.useState(false)
    const [afterError, setAfterError] = React.useState(false)

    const beforeSrc = beforeUrl || getPlaceholderImage(800, 600, beforeLabel)
    const afterSrc = afterUrl || getPlaceholderImage(800, 600, afterLabel)

    // Calculate position from client X
    const updatePosition = React.useCallback((clientX: number) => {
      const container = containerRef.current
      if (!container) return
      const rect = container.getBoundingClientRect()
      const x = clientX - rect.left
      const pct = Math.max(0, Math.min(100, (x / rect.width) * 100))
      setPosition(pct)
    }, [])

    // Mouse events
    const handleMouseDown = React.useCallback(
      (e: React.MouseEvent) => {
        e.preventDefault()
        setIsDragging(true)
        updatePosition(e.clientX)
      },
      [updatePosition],
    )

    React.useEffect(() => {
      if (!isDragging) return

      const handleMouseMove = (e: MouseEvent) => updatePosition(e.clientX)
      const handleMouseUp = () => setIsDragging(false)

      window.addEventListener('mousemove', handleMouseMove)
      window.addEventListener('mouseup', handleMouseUp)
      return () => {
        window.removeEventListener('mousemove', handleMouseMove)
        window.removeEventListener('mouseup', handleMouseUp)
      }
    }, [isDragging, updatePosition])

    // Touch events
    const handleTouchStart = React.useCallback(
      (e: React.TouchEvent) => {
        setIsDragging(true)
        updatePosition(e.touches[0].clientX)
      },
      [updatePosition],
    )

    React.useEffect(() => {
      if (!isDragging) return

      const handleTouchMove = (e: TouchEvent) => {
        if (e.touches.length > 0) {
          updatePosition(e.touches[0].clientX)
        }
      }
      const handleTouchEnd = () => setIsDragging(false)

      window.addEventListener('touchmove', handleTouchMove, { passive: true })
      window.addEventListener('touchend', handleTouchEnd)
      return () => {
        window.removeEventListener('touchmove', handleTouchMove)
        window.removeEventListener('touchend', handleTouchEnd)
      }
    }, [isDragging, updatePosition])

    // Keyboard navigation
    const handleKeyDown = React.useCallback((e: React.KeyboardEvent) => {
      const step = 2
      if (e.key === 'ArrowLeft') {
        e.preventDefault()
        setPosition((p) => Math.max(0, p - step))
      } else if (e.key === 'ArrowRight') {
        e.preventDefault()
        setPosition((p) => Math.min(100, p + step))
      } else if (e.key === 'Home') {
        e.preventDefault()
        setPosition(0)
      } else if (e.key === 'End') {
        e.preventDefault()
        setPosition(100)
      }
    }, [])

    const bothLoaded = beforeLoaded && afterLoaded
    const anyError = beforeError || afterError

    // Merge forwarded ref with container ref
    const setRefs = React.useCallback(
      (el: HTMLDivElement | null) => {
        (containerRef as React.MutableRefObject<HTMLDivElement | null>).current = el
        if (typeof forwardedRef === 'function') {
          forwardedRef(el)
        } else if (forwardedRef) {
          forwardedRef.current = el
        }
      },
      [forwardedRef],
    )

    return (
      <div
        ref={setRefs}
        className={cn(
          'overflow-hidden rounded-lg border border-[var(--border-subtle)]',
          className,
        )}
        {...props}
      >
        {/* ---- Label row ---- */}
        <div className="flex items-center justify-between px-3 py-2 bg-[var(--bg-card)]">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-xs font-medium text-[var(--text-secondary)] shrink-0">
              {beforeLabel}
            </span>
            <div className="flex items-center gap-1 text-[10px] text-[var(--text-tertiary)] truncate">
              {beforeVersion && <span>{beforeVersion}</span>}
              {beforeModel && (
                <>
                  <span className="text-[var(--border-default)]">&middot;</span>
                  <span className="truncate">{beforeModel}</span>
                </>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 min-w-0">
            <div className="flex items-center gap-1 text-[10px] text-[var(--text-tertiary)] truncate">
              {afterVersion && <span>{afterVersion}</span>}
              {afterModel && (
                <>
                  <span className="truncate">{afterModel}</span>
                  <span className="text-[var(--border-default)]">&middot;</span>
                </>
              )}
            </div>
            <span className="text-xs font-medium text-[var(--accent-primary)] shrink-0">
              {afterLabel}
            </span>
          </div>
        </div>

        {/* ---- Comparison area ---- */}
        <div
          className="relative select-none cursor-col-resize"
          style={{ aspectRatio: '16/10' }}
          onMouseDown={handleMouseDown}
          onTouchStart={handleTouchStart}
          onKeyDown={handleKeyDown}
          tabIndex={0}
          role="slider"
          aria-label="图片对比滑块"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(position)}
          aria-valuetext={`${Math.round(position)}%`}
        >
          {/* After image (bottom layer, fully visible) */}
          {!afterError ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={afterSrc}
              alt={afterLabel}
              className="absolute inset-0 h-full w-full object-contain bg-[var(--media-placeholder)]"
              onLoad={() => setAfterLoaded(true)}
              onError={() => setAfterError(true)}
              draggable={false}
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center bg-[var(--media-placeholder)] text-[var(--text-tertiary)] text-sm">
              图片加载失败
            </div>
          )}

          {/* Before image (top layer, clipped) */}
          {!beforeError ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={beforeSrc}
              alt={beforeLabel}
              className="absolute inset-0 h-full w-full object-contain bg-[var(--media-placeholder)]"
              style={{ clipPath: `inset(0 ${100 - position}% 0 0)` }}
              onLoad={() => setBeforeLoaded(true)}
              onError={() => setBeforeError(true)}
              draggable={false}
            />
          ) : (
            <div
              className="absolute inset-0 flex items-center justify-center bg-[var(--media-placeholder)] text-[var(--text-tertiary)] text-sm"
              style={{ clipPath: `inset(0 ${100 - position}% 0 0)` }}
            >
              图片加载失败
            </div>
          )}

          {/* Divider line + drag handle */}
          <div
            className="absolute top-0 bottom-0 z-10 w-0.5 bg-white/60"
            style={{ left: `${position}%`, transform: 'translateX(-50%)' }}
          >
            {/* Handle circle */}
            <div
              className={cn(
                'absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2',
                'flex h-8 w-8 items-center justify-center rounded-full bg-white/90 shadow-lg',
                !prefersReduced && 'transition-transform duration-150',
                isDragging && 'scale-110',
              )}
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 16 16"
                fill="none"
                aria-hidden="true"
              >
                <path
                  d="M5 8L3 8M3 8L5 6M3 8L5 10"
                  stroke="#333"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <path
                  d="M11 8L13 8M13 8L11 6M13 8L11 10"
                  stroke="#333"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
          </div>

          {/* Loading overlay */}
          {!bothLoaded && !anyError && (
            <div className="absolute inset-0 flex items-center justify-center bg-[var(--media-scrim)]">
              <div className="flex items-center gap-2 text-[var(--text-tertiary)] text-sm">
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-[var(--text-tertiary)] border-t-transparent" />
                加载中...
              </div>
            </div>
          )}

          {/* Keyboard hint (visible on focus) */}
          <div className="absolute bottom-2 left-1/2 -translate-x-1/2 rounded bg-black/60 px-2 py-1 text-[10px] text-white/60 opacity-0 transition-opacity group-focus-within/slider:opacity-100 pointer-events-none">
            方向键调整对比位置
          </div>
        </div>

        {/* ---- Version info below ---- */}
        {(beforeVersion || afterVersion) && (
          <div className="flex items-center justify-between px-3 py-2 bg-[var(--bg-card)] border-t border-[var(--border-subtle)]">
            <span className="text-[11px] text-[var(--text-tertiary)]">
              {beforeVersion || beforeLabel}
            </span>
            <span className="text-[11px] text-[var(--text-tertiary)]">
              {afterVersion || afterLabel}
            </span>
          </div>
        )}
      </div>
    )
  },
)
ImageComparison.displayName = 'ImageComparison'

export { ImageComparison }
