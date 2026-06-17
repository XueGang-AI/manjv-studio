'use client'

import * as React from 'react'
import { cn } from '@/lib/utils'
import {
  Play,
  Pause,
  Maximize2,
  RefreshCw,
  Star,
  Download,
  Trash2,
  Loader2,
  AlertCircle,
  Check,
  Film,
  Clock,
  Monitor,
  Cpu,
} from 'lucide-react'
import { getPlaceholderImage } from '../mock-data'

// ---- Reduced motion hook (useSyncExternalStore) ----

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

// ---- IntersectionObserver hook ----

function useInView(): {
  ref: React.RefObject<HTMLDivElement | null>
  inView: boolean
} {
  const ref = React.useRef<HTMLDivElement | null>(null)
  const [inView, setInView] = React.useState(false)

  React.useEffect(() => {
    const el = ref.current
    if (!el) return

    const observer = new IntersectionObserver(
      ([entry]) => setInView(entry.isIntersecting),
      { threshold: 0.1 },
    )

    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  return { ref, inView }
}

// ---- Mobile detection hook ----

function useIsMobile(): boolean {
  return useMediaQuery('(max-width: 768px)')
}

// ---- Status config ----

const STATUS_LABEL: Record<string, string> = {
  ready: '就绪',
  generating: '生成中',
  error: '失败',
  selected: '已选',
}

const STATUS_BADGE_STYLE: Record<string, string> = {
  ready: 'text-[var(--text-tertiary)] bg-[var(--bg-elevated)]',
  generating: 'text-[var(--status-generating)] bg-[var(--generating-soft)]',
  error: 'text-[var(--status-error)] bg-[var(--error-soft)]',
  selected: 'text-[var(--accent-primary)] bg-[var(--accent-soft)]',
}

const STATUS_DOT_STYLE: Record<string, string> = {
  ready: 'bg-[var(--text-tertiary)]',
  generating: 'bg-[var(--status-generating)]',
  error: 'bg-[var(--status-error)]',
  selected: 'bg-[var(--accent-primary)]',
}

// ---- Props ----

export interface HoverPlayCardProps extends React.HTMLAttributes<HTMLDivElement> {
  id: string
  shotNo: number
  name: string
  duration?: string
  aspectRatio?: string
  resolution?: string
  modelName?: string
  status: 'ready' | 'generating' | 'error' | 'selected'
  version?: string
  thumbnailUrl?: string
  videoUrl?: string
  createdAt?: string
  onPreview?: (id: string) => void
  onRegenerate?: (id: string) => void
  onSetFinal?: (id: string) => void
  onDownload?: (id: string) => void
  onDelete?: (id: string) => void
}

// ---- Sub-components ----

function StatusBadge({ status }: { status: HoverPlayCardProps['status'] }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium leading-none',
        STATUS_BADGE_STYLE[status],
      )}
    >
      <span className={cn('h-1.5 w-1.5 rounded-full shrink-0', STATUS_DOT_STYLE[status])} />
      {status === 'generating' && <Loader2 size={10} className="animate-spin" />}
      {status === 'error' && <AlertCircle size={10} />}
      {status === 'selected' && <Star size={10} />}
      {STATUS_LABEL[status]}
    </span>
  )
}

function VersionBadge({ version }: { version?: string }) {
  if (!version) return null
  return (
    <span className="inline-flex items-center rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-medium leading-none text-[var(--text-secondary)]">
      {version}
    </span>
  )
}

function ShotNumberBadge({ shotNo }: { shotNo: number }) {
  return (
    <span className="inline-flex items-center justify-center rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-mono font-bold leading-none text-[var(--text-primary)]">
      #{shotNo}
    </span>
  )
}

/** Simulated playback progress bar */
function PlaybackProgress({
  active,
  prefersReduced,
}: {
  active: boolean
  prefersReduced: boolean
}) {
  const barRef = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    if (!active || prefersReduced) return

    const start = performance.now()
    const cycleDuration = 8000

    let raf: number
    const tick = (now: number) => {
      const elapsed = now - start
      const pct = Math.min((elapsed % cycleDuration) / cycleDuration, 1)
      if (barRef.current) {
        barRef.current.style.width = `${pct * 100}%`
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [active, prefersReduced])

  if (!active || prefersReduced) return null

  return (
    <div className="absolute bottom-0 left-0 right-0 h-[3px] bg-[var(--media-scrim)]">
      <div
        ref={barRef}
        className="h-full bg-[var(--accent-primary)] transition-[width] duration-100 ease-linear"
        style={{ width: '0%' }}
      />
    </div>
  )
}

/** Small action button for the action bar */
function ActionButton({
  icon: Icon,
  label,
  danger,
  onClick,
}: {
  icon: React.ElementType
  label: string
  danger?: boolean
  onClick?: () => void
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={(e) => {
        e.stopPropagation()
        onClick?.()
      }}
      className={cn(
        'inline-flex items-center justify-center rounded p-1.5 transition-colors cursor-pointer',
        'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent-primary)]/50',
        danger
          ? 'text-[var(--text-tertiary)] hover:text-[var(--status-error)] hover:bg-[var(--error-soft)]'
          : 'text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)]',
      )}
    >
      <Icon size={14} />
    </button>
  )
}

// ---- Main component ----

const HoverPlayCard = React.forwardRef<HTMLDivElement, HoverPlayCardProps>(
  (
    {
      id,
      shotNo,
      name,
      duration,
      aspectRatio,
      resolution,
      modelName,
      status,
      version,
      thumbnailUrl,
      videoUrl,
      createdAt,
      onPreview,
      onRegenerate,
      onSetFinal,
      onDownload,
      onDelete,
      className,
      ...props
    },
    forwardedRef,
  ) => {
    const prefersReduced = usePrefersReducedMotion()
    const isMobile = useIsMobile()
    const { ref: inViewRef, inView } = useInView()

    // Merge refs
    const setRefs = React.useCallback(
      (el: HTMLDivElement | null) => {
        inViewRef.current = el
        if (typeof forwardedRef === 'function') {
          forwardedRef(el)
        } else if (forwardedRef) {
          forwardedRef.current = el
        }
      },
      [forwardedRef, inViewRef],
    )

    const videoRef = React.useRef<HTMLVideoElement>(null)
    const [isHovered, setIsHovered] = React.useState(false)
    const [isPlaying, setIsPlaying] = React.useState(false)
    const [showMobileControls, setShowMobileControls] = React.useState(false)
    const [videoError, setVideoError] = React.useState(false)

    const showOverlay = isMobile ? showMobileControls : isHovered
    const showPlayback = showOverlay && isPlaying
    const hasVideo = !!videoUrl && !videoError

    const thumbnailSrc = thumbnailUrl || getPlaceholderImage(320, 568, `#${shotNo} ${name}`)

    // ---- Video playback control ----
    const playVideo = React.useCallback(() => {
      const v = videoRef.current
      if (!v || !hasVideo) return
      v.play().catch(() => { /* autoplay may be blocked */ })
      setIsPlaying(true)
    }, [hasVideo])

    const pauseVideo = React.useCallback(() => {
      const v = videoRef.current
      if (!v) return
      v.pause()
      setIsPlaying(false)
    }, [])

    // Pause when out of view
    React.useEffect(() => {
      if (!inView && isPlaying) {
        pauseVideo()
      }
    }, [inView, isPlaying, pauseVideo])

    // Cleanup on unmount
    React.useEffect(() => {
      const v = videoRef.current
      return () => {
        if (v) {
          v.pause()
          v.removeAttribute('src')
          v.load()
        }
      }
    }, [])

    // Card border + bg styles based on status and hover
    const cardStyles = cn(
      status === 'selected'
        ? 'border-[var(--accent-primary)] shadow-[0_0_0_1px_var(--accent-border)] bg-[var(--bg-card)]'
        : status === 'generating'
          ? 'border-[rgba(69,199,232,0.55)] bg-[var(--bg-card)]'
          : 'border-[var(--border-subtle)] bg-[var(--bg-card)]',
      isHovered &&
        status !== 'selected' &&
        status !== 'generating' &&
        'bg-[var(--bg-hover)] border-[var(--border-default)]',
      isHovered && status === 'selected' && 'bg-[var(--bg-hover)]',
      isHovered && status === 'generating' && 'bg-[var(--bg-hover)]',
    )

    // Handlers
    const handleMouseEnter = React.useCallback(() => {
      if (!isMobile) {
        setIsHovered(true)
        // Auto-play on hover (desktop, not reduced motion)
        if (hasVideo && !prefersReduced) {
          playVideo()
        }
      }
    }, [isMobile, hasVideo, prefersReduced, playVideo])

    const handleMouseLeave = React.useCallback(() => {
      setIsHovered(false)
      pauseVideo()
    }, [pauseVideo])

    const handleCardClick = React.useCallback(
      (e: React.MouseEvent) => {
        if ((e.target as HTMLElement).closest('[data-action]')) return
        if (isMobile) {
          setShowMobileControls((prev) => !prev)
        } else {
          onPreview?.(id)
        }
      },
      [isMobile, onPreview, id],
    )

    const handlePlayToggle = React.useCallback(() => {
      if (hasVideo) {
        if (isPlaying) {
          pauseVideo()
        } else {
          playVideo()
        }
      } else if (thumbnailUrl) {
        setIsPlaying((prev) => !prev)
      }
    }, [hasVideo, isPlaying, playVideo, pauseVideo, thumbnailUrl])

    const handlePreview = React.useCallback(() => onPreview?.(id), [onPreview, id])
    const handleRegenerate = React.useCallback(() => onRegenerate?.(id), [onRegenerate, id])
    const handleSetFinal = React.useCallback(() => onSetFinal?.(id), [onSetFinal, id])
    const handleDownload = React.useCallback(() => onDownload?.(id), [onDownload, id])
    const handleDelete = React.useCallback(() => onDelete?.(id), [onDelete, id])

    // Close mobile controls on outside click
    React.useEffect(() => {
      if (!isMobile || !showMobileControls) return

      const handleClickOutside = (e: MouseEvent) => {
        if (!(e.target as HTMLElement).closest(`[data-card-id="${id}"]`)) {
          setShowMobileControls(false)
          setIsPlaying(false)
        }
      }

      // Delay to avoid the same click that opened the controls
      const timer = setTimeout(() => {
        document.addEventListener('click', handleClickOutside)
      }, 0)
      return () => {
        clearTimeout(timer)
        document.removeEventListener('click', handleClickOutside)
      }
    }, [isMobile, showMobileControls, id])

    return (
      <div
        ref={setRefs}
        data-card-id={id}
        role="article"
        aria-label={`镜头 ${shotNo}: ${name}`}
        className={cn(
          'group relative flex flex-col overflow-hidden rounded-lg',
          !prefersReduced && 'transition-all duration-200',
          cardStyles,
          className,
        )}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onClick={handleCardClick}
        {...props}
      >
        {/* ---- Thumbnail area ---- */}
        <div className="relative aspect-[9/16] w-full overflow-hidden bg-[var(--media-placeholder)] cursor-pointer">
          {/* Video element (when videoUrl available) */}
          {hasVideo && inView && (
            <video
              ref={videoRef}
              src={videoUrl}
              className={cn(
                'absolute inset-0 h-full w-full object-cover',
                isPlaying ? 'z-10' : 'z-0 opacity-0',
              )}
              muted
              playsInline
              preload={inView ? 'metadata' : 'none'}
              loop
              onError={() => setVideoError(true)}
            />
          )}

          {/* Image or placeholder */}
          {inView ? (
            thumbnailUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={thumbnailSrc}
                alt={`镜头 ${shotNo}: ${name}`}
                className="h-full w-full object-cover"
                loading="lazy"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center">
                <Film size={32} className="text-[var(--text-tertiary)]/40" />
              </div>
            )
          ) : (
            <div className="flex h-full w-full items-center justify-center">
              <Film size={32} className="text-[var(--text-tertiary)]/40" />
            </div>
          )}

          {/* Video load error state */}
          {videoUrl && videoError && (
            <div className="absolute inset-0 flex items-center justify-center bg-[var(--media-scrim)]/80 z-20">
              <AlertCircle size={24} className="text-[var(--status-error)]" />
            </div>
          )}

          {/* Top badges */}
          <div className="absolute left-2 right-2 top-2 flex items-start justify-between">
            <ShotNumberBadge shotNo={shotNo} />
            <div className="flex items-center gap-1">
              <VersionBadge version={version} />
            </div>
          </div>

          {/* Selected checkmark (top-right, below version badge) */}
          {status === 'selected' && (
            <div className="absolute right-2 top-9 flex h-5 w-5 items-center justify-center rounded-full bg-[var(--accent-primary)]">
              <Check size={12} className="text-[var(--text-inverse)]" />
            </div>
          )}

          {/* Duration label (bottom-right of thumbnail) */}
          {duration && (
            <div className="absolute bottom-2 right-2 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-mono text-[var(--text-secondary)]">
              {duration}
            </div>
          )}

          {/* Play/Pause overlay - desktop: on hover; mobile: on controls shown */}
          <div
            className={cn(
              'absolute inset-0 flex items-center justify-center bg-[var(--media-scrim)]',
              !prefersReduced && 'transition-opacity duration-200',
              showOverlay || (isMobile && !showMobileControls)
                ? 'opacity-100'
                : 'opacity-0 pointer-events-none',
            )}
          >
            {/* Mobile: always show play button when controls not yet shown */}
            {isMobile && !showMobileControls && (
              <button
                type="button"
                aria-label="显示控制"
                className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--accent-primary)]/90 text-[var(--text-inverse)] shadow-lg transition-transform hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-primary)]"
                onClick={(e) => {
                  e.stopPropagation()
                  setShowMobileControls(true)
                }}
              >
                <Play size={22} className="ml-0.5" />
              </button>
            )}

            {/* Play/Pause button when overlay is shown */}
            {showOverlay && (
              <button
                type="button"
                aria-label={isPlaying ? '暂停' : '播放'}
                className={cn(
                  'flex h-12 w-12 items-center justify-center rounded-full bg-[var(--accent-primary)]/90 text-[var(--text-inverse)] shadow-lg',
                  'transition-transform hover:scale-105',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-primary)]',
                )}
                onClick={(e) => {
                  e.stopPropagation()
                  handlePlayToggle()
                }}
              >
                {isPlaying ? <Pause size={22} /> : <Play size={22} className="ml-0.5" />}
              </button>
            )}
          </div>

          {/* Simulated playback progress */}
          <PlaybackProgress active={showPlayback} prefersReduced={prefersReduced} />

          {/* Generating overlay */}
          {status === 'generating' && (
            <div className="absolute inset-0 bg-[var(--status-generating)]/5">
              <div
                className={cn(
                  'absolute inset-0 bg-gradient-to-r from-transparent via-[var(--status-generating)]/10 to-transparent',
                  !prefersReduced && 'animate-pulse',
                )}
              />
            </div>
          )}

          {/* Error overlay */}
          {status === 'error' && !showOverlay && (
            <div className="absolute inset-0 flex items-center justify-center bg-[var(--media-scrim)]/60">
              <AlertCircle size={28} className="text-[var(--status-error)]" />
            </div>
          )}
        </div>

        {/* ---- Info area ---- */}
        <div className="flex flex-col gap-1.5 px-3 py-2.5">
          {/* Name + status badge */}
          <div className="flex items-center justify-between gap-2">
            <span className="truncate text-[13px] font-medium text-[var(--text-primary)]" title={name}>
              {name}
            </span>
            <StatusBadge status={status} />
          </div>

          {/* Meta info */}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-[var(--text-tertiary)]">
            {aspectRatio && (
              <span className="inline-flex items-center gap-1">
                <Monitor size={10} />
                {aspectRatio}
              </span>
            )}
            {resolution && <span>{resolution}</span>}
            {modelName && (
              <span className="inline-flex items-center gap-1">
                <Cpu size={10} />
                <span className="truncate">{modelName}</span>
              </span>
            )}
          </div>

          {/* Created at */}
          {createdAt && (
            <span className="flex items-center gap-1 text-[11px] text-[var(--text-tertiary)]">
              <Clock size={10} />
              {createdAt}
            </span>
          )}
        </div>

        {/* ---- Action bar ---- */}
        <div
          className={cn(
            'flex items-center justify-between border-t border-[var(--border-subtle)] px-2 py-1.5',
            !prefersReduced && 'transition-opacity duration-200',
            showOverlay ? 'opacity-100' : 'opacity-0 pointer-events-none',
          )}
        >
          <div className="flex items-center gap-0.5">
            <div data-action>
              <ActionButton
                icon={isPlaying ? Pause : Play}
                label={isPlaying ? '暂停' : '播放'}
                onClick={handlePlayToggle}
              />
            </div>
            <div data-action>
              <ActionButton icon={Maximize2} label="全屏预览" onClick={handlePreview} />
            </div>
            {(status === 'ready' || status === 'selected' || status === 'error') && onRegenerate && (
              <div data-action>
                <ActionButton
                  icon={RefreshCw}
                  label={status === 'error' ? '重试' : '重新生成'}
                  onClick={handleRegenerate}
                />
              </div>
            )}
            {status !== 'selected' && onSetFinal && (
              <div data-action>
                <ActionButton icon={Star} label="设为最终版" onClick={handleSetFinal} />
              </div>
            )}
            {onDownload && (
              <div data-action>
                <ActionButton icon={Download} label="下载" onClick={handleDownload} />
              </div>
            )}
          </div>
          {onDelete && (
            <div data-action>
              <ActionButton icon={Trash2} label="删除" danger onClick={handleDelete} />
            </div>
          )}
        </div>
      </div>
    )
  },
)
HoverPlayCard.displayName = 'HoverPlayCard'

export { HoverPlayCard }
