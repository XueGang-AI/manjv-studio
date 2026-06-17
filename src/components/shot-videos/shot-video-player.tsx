'use client'

import { useRef, useEffect, useState, useCallback } from 'react'
import { AlertCircle, Video, Loader2, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { remoteStatusLabel, isRemotePending, isRemoteTerminal, type ShotVideoItem } from './shot-videos-types'

interface ShotVideoPlayerProps {
  video: ShotVideoItem | null
  posterUrl: string | null
  isConfirmed: boolean
  onRegenerate: () => void
  onCheckTask: (videoId: string) => void
  regenerating: boolean
  checkingTask: boolean
}

export function ShotVideoPlayer({
  video, posterUrl, isConfirmed, onRegenerate, onCheckTask, regenerating, checkingTask,
}: ShotVideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [loadError, setLoadError] = useState(false)
  const [loadStarted, setLoadStarted] = useState(false)

  // Pause old video when switching
  useEffect(() => {
    if (videoRef.current && video?.id) {
      videoRef.current.pause()
    }
  }, [video?.id])

  const handleVideoError = useCallback(() => {
    setLoadError(true)
  }, [])

  const handleLoadStart = useCallback(() => {
    setLoadStarted(true)
    setLoadError(false)
  }, [])

  // No video record at all
  if (!video) {
    return (
      <div className="aspect-video bg-[var(--bg-panel)] rounded-[var(--radius-lg)] flex items-center justify-center">
        <div className="text-center">
          <Video size={48} className="text-[var(--color-text-muted)] mx-auto mb-3" />
          <p className="text-sm text-[var(--color-text-muted)]">尚未生成视频</p>
        </div>
      </div>
    )
  }

  const hasRemoteTask = !!video.remoteTaskId
  const remoteIsPending = hasRemoteTask && isRemotePending(video.remoteStatus)
  const remoteIsFailed = hasRemoteTask && (video.remoteStatus || '').toLowerCase() !== 'timeout' && (video.remoteStatus || '').toLowerCase() !== 'cancelled' && ['failed', 'error'].includes((video.remoteStatus || '').toLowerCase())
  const remoteIsTimedOut = hasRemoteTask && (video.remoteStatus || '').toLowerCase() === 'timeout'
  const remoteIsCompleted = hasRemoteTask && isRemoteTerminal(video.remoteStatus) && !remoteIsFailed && !remoteIsTimedOut
  const videoAvailable = !!(video.videoUrl && (remoteIsCompleted || !hasRemoteTask))

  // Remote task still processing
  if (remoteIsPending) {
    return (
      <div className="aspect-video bg-[var(--bg-panel)] rounded-[var(--radius-lg)] flex items-center justify-center relative">
        {/* Show poster if available */}
        {posterUrl && (
          // eslint-disable-next-line @next/next/no-img-element -- 远端对象存储视频 poster，next.config 未配 remotePatterns，与既有约定一致
          <img
            src={posterUrl}
            alt="参考图"
            className="absolute inset-0 w-full h-full object-cover opacity-30 rounded-[var(--radius-lg)]"
          />
        )}
        <div className="text-center relative z-10">
          <Loader2 size={40} className="text-[var(--color-accent-cyan)] animate-spin mx-auto mb-3" />
          <p className="text-sm text-[var(--color-text-muted)] mb-1">{remoteStatusLabel(video.remoteStatus)}</p>
          {video.remoteProgress != null && (
            <div className="mt-2 w-40 mx-auto bg-[var(--bg-elevated)] rounded-full h-1.5">
              <div className="bg-[var(--color-accent-cyan)] h-1.5 rounded-full transition-all" style={{ width: `${video.remoteProgress}%` }} />
            </div>
          )}
          <Button
            variant="outline"
            size="sm"
            className="mt-3"
            onClick={() => onCheckTask(video.id)}
            disabled={checkingTask}
          >
            {checkingTask ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
            检查状态
          </Button>
        </div>
      </div>
    )
  }

  // Remote task failed
  if (remoteIsFailed) {
    return (
      <div className="aspect-video bg-[var(--bg-panel)] rounded-[var(--radius-lg)] flex items-center justify-center">
        <div className="text-center">
          <AlertCircle size={40} className="text-[var(--color-danger)] mx-auto mb-3" />
          <p className="text-sm text-[var(--color-danger)] mb-1">视频生成失败</p>
          <p className="text-[10px] text-[var(--color-text-muted)] mb-3">{remoteStatusLabel(video.remoteStatus)}</p>
          {!isConfirmed && (
            <Button variant="outline" size="sm" icon={<RefreshCw size={12} className={regenerating ? 'animate-spin' : ''} />} onClick={onRegenerate} disabled={regenerating}>
              {regenerating ? '重新生成中…' : '重新生成'}
            </Button>
          )}
        </div>
      </div>
    )
  }

  // Remote task timed out
  if (remoteIsTimedOut) {
    return (
      <div className="aspect-video bg-[var(--bg-panel)] rounded-[var(--radius-lg)] flex items-center justify-center">
        <div className="text-center">
          <AlertCircle size={40} className="text-[var(--color-warning)] mx-auto mb-3" />
          <p className="text-sm text-[var(--color-warning)] mb-1">轮询超时</p>
          <p className="text-[10px] text-[var(--color-text-muted)] mb-3">视频任务可能仍在处理</p>
          <div className="flex gap-2 justify-center">
            <Button variant="outline" size="sm" onClick={() => onCheckTask(video.id)} disabled={checkingTask}>
              {checkingTask ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
              检查状态
            </Button>
            {!isConfirmed && (
              <Button variant="outline" size="sm" icon={<RefreshCw size={12} className={regenerating ? 'animate-spin' : ''} />} onClick={onRegenerate} disabled={regenerating}>
                重新生成
              </Button>
            )}
          </div>
        </div>
      </div>
    )
  }

  // Video URL not available yet
  if (!videoAvailable) {
    return (
      <div className="aspect-video bg-[var(--bg-panel)] rounded-[var(--radius-lg)] flex items-center justify-center">
        <div className="text-center">
          <Video size={40} className="text-[var(--color-text-muted)] mx-auto mb-3 opacity-50" />
          <p className="text-sm text-[var(--color-text-muted)]">等待视频…</p>
        </div>
      </div>
    )
  }

  // Video load error
  if (loadError) {
    return (
      <div className="aspect-video bg-[var(--bg-panel)] rounded-[var(--radius-lg)] flex items-center justify-center">
        <div className="text-center">
          <AlertCircle size={40} className="text-[var(--color-danger)] mx-auto mb-3" />
          <p className="text-sm text-[var(--color-danger)] mb-1">视频加载失败</p>
          <p className="text-[10px] text-[var(--color-text-muted)] mb-3">文件可能已失效或格式不受支持</p>
          {!isConfirmed && (
            <Button variant="outline" size="sm" icon={<RefreshCw size={12} className={regenerating ? 'animate-spin' : ''} />} onClick={onRegenerate} disabled={regenerating}>
              {regenerating ? '重新生成中…' : '重新生成'}
            </Button>
          )}
        </div>
      </div>
    )
  }

  // Normal video player
  return (
    <div className="relative rounded-[var(--radius-lg)] overflow-hidden bg-black">
      <video
        key={video.id}
        ref={videoRef}
        src={video.videoUrl!}
        poster={posterUrl || undefined}
        controls
        preload="metadata"
        playsInline
        className="w-full aspect-video"
        aria-label={`镜头视频播放`}
        onError={handleVideoError}
        onLoadStart={handleLoadStart}
      />
      {/* Loading overlay before metadata loads */}
      {!loadStarted && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/60 pointer-events-none">
          <Loader2 size={32} className="text-[var(--color-accent-cyan)] animate-spin" />
        </div>
      )}
    </div>
  )
}
