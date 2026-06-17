'use client'

/**
 * VideoPreviewCard — 正式视频预览卡片（Phase 3）
 * --------------------------------------------
 * 适配真实 ShotVideoItem 数据的 hover 播放卡片。
 * 不复制实验页 Mock；通过 props 接收真实数据。
 *
 * 播放规则：
 * - 桌面端 hover 静音预览（reduced-motion 下禁用自动播放）
 * - 鼠标移出暂停
 * - 点击主动播放/暂停（可取消静音）
 * - 同页互斥：通过 PlaybackProvider 协调，新播放暂停上一个
 * - 离开视口暂停（IntersectionObserver）
 * - 路由切换/卸载时暂停并清理
 * - muted + playsInline + preload="metadata"（不全量下载）
 * - 自动播放被拒绝时不抛未处理 Promise
 * - URL 失效显示错误状态
 */

import * as React from 'react'
import { Play, Pause, Loader2, AlertCircle, Film } from 'lucide-react'
import { cn } from '@/lib/utils'
import { MediaStatusBadge } from './media-status-badge'
import { useVideoPlaybackControl } from './video-playback-coordinator'

export interface VideoPreviewCardData {
  id: string
  videoUrl: string | null
  posterUrl?: string | null
  /** 镜头编号或标题 */
  title: string
  /** 副标题，如镜头名 */
  subtitle?: string | null
  /** 时长（秒） */
  duration?: number | null
  /** 画幅比例，如 "9:16" */
  aspectRatio?: string | null
  /** 版本号或 seed */
  version?: string | null
  /** 是否当前最终选中 */
  isSelected?: boolean
  /** 是否已确认 */
  isConfirmed?: boolean
  /** 远端状态（生成中/失败等） */
  remoteStatus?: string | null
  remoteProgress?: number | null
}

export interface VideoPreviewCardProps {
  video: VideoPreviewCardData
  /** 卡片状态（由调用方从真实数据派生） */
  status: 'none' | 'generating' | 'generated' | 'selected' | 'confirmed' | 'failed' | 'disabled'
  /** 宽高比类名，默认 9/16 */
  aspectClass?: string
  className?: string
}

function subscribeReducedMotion(callback: () => void) {
  const mql = window.matchMedia('(prefers-reduced-motion: reduce)')
  mql.addEventListener('change', callback)
  return () => mql.removeEventListener('change', callback)
}

function usePrefersReducedMotion(): boolean {
  return React.useSyncExternalStore(
    subscribeReducedMotion,
    () => window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    () => false, // SSR snapshot
  )
}

export function VideoPreviewCard({
  video,
  status,
  aspectClass = 'aspect-[9/16]',
  className,
}: VideoPreviewCardProps) {
  const videoRef = React.useRef<HTMLVideoElement>(null)
  const wrapRef = React.useRef<HTMLDivElement>(null)
  const [loadError, setLoadError] = React.useState(false)
  const [manualMode, setManualMode] = React.useState(false)
  const reduced = usePrefersReducedMotion()
  const { isMineActive, requestPlay, requestPause } = useVideoPlaybackControl(video.id)

  const isGenerating = status === 'generating'
  const isFailed = status === 'failed'
  const hasUrl = !!video.videoUrl
  const canPlay = hasUrl && !isGenerating && !isFailed && !loadError

  // 视口离开暂停
  React.useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting && isMineActive) {
            // 离开视口：暂停并释放活动锁
            videoRef.current?.pause()
            requestPause()
          }
        }
      },
      { threshold: 0.1 },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [isMineActive, requestPause])

  // 当不再是活动视频时，暂停本视频
  React.useEffect(() => {
    if (!isMineActive && videoRef.current) {
      videoRef.current.pause()
    }
  }, [isMineActive])

  // 卸载时清理：暂停 + 释放 src 避免后台下载
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

  const tryAutoplay = React.useCallback(() => {
    const v = videoRef.current
    if (!v) return
    // 自动播放被浏览器拒绝时静默处理，不抛未处理 Promise
    v.play().catch(() => {
      // 静音重试一次（部分浏览器允许静音自动播放）
      v.muted = true
      v.play().catch(() => {})
    })
  }, [])

  const handleMouseEnter = React.useCallback(() => {
    if (!canPlay || manualMode || reduced) return
    requestPlay()
    tryAutoplay()
  }, [canPlay, manualMode, reduced, requestPlay, tryAutoplay])

  const handleMouseLeave = React.useCallback(() => {
    if (!canPlay || manualMode) return
    if (isMineActive) {
      videoRef.current?.pause()
      requestPause()
    }
  }, [canPlay, manualMode, isMineActive, requestPause])

  const handleClick = React.useCallback(() => {
    if (!canPlay) return
    const v = videoRef.current
    if (!v) return
    setManualMode(true)
    if (isMineActive && !v.paused) {
      v.pause()
      requestPause()
    } else {
      // 主动播放时取消静音，给用户有声体验
      v.muted = false
      requestPlay()
      v.play().catch(() => {
        // 拒绝有声自动播放 → 回退静音
        v.muted = true
        v.play().catch(() => {})
      })
    }
  }, [canPlay, isMineActive, requestPlay, requestPause])

  // ─── 状态分支渲染 ─────────────────────────────

  if (isGenerating) {
    return (
      <VideoCardShell
        ref={wrapRef}
        aspectClass={aspectClass}
        className={className}
        title={video.title}
        subtitle={video.subtitle}
        version={video.version}
        status={status}
      >
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-[var(--bg-panel)]">
          {video.posterUrl && (
            // eslint-disable-next-line @next/next/no-img-element -- 视频临时 poster（远端对象存储 URL），next.config 未配 remotePatterns，无需优化，与 shot-video-player 既有约定一致
            <img src={video.posterUrl} alt="" aria-hidden className="absolute inset-0 w-full h-full object-cover opacity-25" />
          )}
          <Loader2 size={32} className="text-[var(--status-generating)] animate-spin mb-2" />
          <p className="text-xs text-[var(--text-tertiary)]">
            {video.remoteProgress != null ? `${video.remoteProgress}%` : '生成中'}
          </p>
        </div>
      </VideoCardShell>
    )
  }

  if (isFailed || loadError) {
    return (
      <VideoCardShell
        ref={wrapRef}
        aspectClass={aspectClass}
        className={className}
        title={video.title}
        subtitle={video.subtitle}
        version={video.version}
        status={status}
      >
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-[var(--bg-panel)] px-2 text-center">
          <AlertCircle size={32} className="text-[var(--status-error)] mb-2" />
          <p className="text-xs text-[var(--status-error)]">视频{loadError ? '加载' : '生成'}失败</p>
        </div>
      </VideoCardShell>
    )
  }

  if (!hasUrl) {
    return (
      <VideoCardShell
        ref={wrapRef}
        aspectClass={aspectClass}
        className={className}
        title={video.title}
        subtitle={video.subtitle}
        version={video.version}
        status={status}
      >
        <div className="absolute inset-0 flex items-center justify-center bg-[var(--bg-panel)]">
          <Film size={32} className="text-[var(--text-tertiary)] opacity-50" />
        </div>
      </VideoCardShell>
    )
  }

  // 正常播放卡片
  return (
    <VideoCardShell
      ref={wrapRef}
      aspectClass={aspectClass}
      className={className}
      title={video.title}
      subtitle={video.subtitle}
      version={video.version}
      status={status}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <video
        ref={videoRef}
        src={video.videoUrl!}
        poster={video.posterUrl || undefined}
        muted
        playsInline
        preload="metadata"
        loop
        className="absolute inset-0 w-full h-full object-cover"
        aria-label={`${video.title} 预览`}
        onError={() => setLoadError(true)}
      />
      {/* 点击播放/暂停覆盖层 */}
      <button
        type="button"
        onClick={handleClick}
        aria-label={isMineActive ? '暂停' : '播放'}
        className={cn(
          'absolute inset-0 flex items-center justify-center transition-colors',
          isMineActive ? 'bg-black/0' : 'bg-black/20 hover:bg-black/30',
        )}
      >
        {!isMineActive && (
          <span className="w-12 h-12 rounded-full bg-black/60 flex items-center justify-center text-white">
            <Play size={20} className="ml-0.5" />
          </span>
        )}
        {isMineActive && manualMode && (
          <span className="w-12 h-12 rounded-full bg-black/50 flex items-center justify-center text-white">
            <Pause size={20} />
          </span>
        )}
      </button>
    </VideoCardShell>
  )
}

// ─── 共享卡片外壳 ─────────────────────────────

const VideoCardShell = React.forwardRef<
  HTMLDivElement,
  {
    aspectClass: string
    className?: string
    title: string
    subtitle?: string | null
    version?: string | null
    status: VideoPreviewCardProps['status']
    children: React.ReactNode
    onMouseEnter?: () => void
    onMouseLeave?: () => void
  }
>(function VideoCardShell(
  { aspectClass, className, title, subtitle, version, status, children, onMouseEnter, onMouseLeave },
  ref,
) {
  const borderClass =
    status === 'confirmed'
      ? 'border-[var(--status-success)]/55'
      : status === 'selected'
        ? 'border-[var(--accent-primary)]/55'
        : status === 'failed'
          ? 'border-[var(--status-error)]/55'
          : status === 'generating'
            ? 'border-[var(--status-generating)]/45'
            : 'border-[var(--border-default)]'

  return (
    <div
      ref={ref}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      className={cn(
        'group rounded-[var(--radius-lg)] overflow-hidden bg-[var(--bg-card)] border transition-colors',
        borderClass,
        className,
      )}
    >
      <div className={cn('relative w-full', aspectClass)}>
        {children}
      </div>
      <div className="px-2.5 py-2 space-y-1">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-medium text-[var(--text-primary)] truncate" title={title}>
            {title}
          </span>
          {version && (
            <span className="text-[10px] text-[var(--text-tertiary)] font-mono shrink-0">v{version}</span>
          )}
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className="text-[10px] text-[var(--text-tertiary)] truncate" title={subtitle ?? ''}>
            {subtitle || ' '}
          </span>
          <MediaStatusBadge status={status} showText={false} />
        </div>
      </div>
    </div>
  )
})
