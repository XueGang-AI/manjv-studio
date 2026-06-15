'use client'

import { useState } from 'react'
import { AlertCircle, Loader2, RefreshCw, Video } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { FinalVideoItem } from './final-preview-types'

interface FinalVideoPlayerProps {
  video: FinalVideoItem | null
  onRerender: () => void
  rerendering: boolean
}

export function FinalVideoPlayer({ video, onRerender, rerendering }: FinalVideoPlayerProps) {
  const [loadError, setLoadError] = useState(false)

  // No video at all
  if (!video) {
    return (
      <div className="aspect-video bg-[var(--bg-panel)] rounded-[var(--radius-lg)] flex items-center justify-center max-w-lg mx-auto">
        <div className="text-center">
          <Video size={48} className="text-[var(--color-text-muted)] mx-auto mb-3" />
          <p className="text-sm text-[var(--color-text-muted)]">尚未合成视频</p>
        </div>
      </div>
    )
  }

  // Video load error
  if (loadError) {
    return (
      <div className="aspect-video bg-[var(--bg-panel)] rounded-[var(--radius-lg)] flex items-center justify-center max-w-lg mx-auto">
        <div className="text-center">
          <AlertCircle size={40} className="text-[var(--color-danger)] mx-auto mb-3" />
          <p className="text-sm text-[var(--color-danger)] mb-1">视频加载失败</p>
          <p className="text-[10px] text-[var(--color-text-muted)] mb-3">文件可能已失效或格式不受支持</p>
          <Button variant="outline" size="sm" icon={<RefreshCw size={12} className={rerendering ? 'animate-spin' : ''} />} onClick={onRerender} disabled={rerendering}>
            {rerendering ? '重新合成中…' : '重新合成'}
          </Button>
        </div>
      </div>
    )
  }

  // No URL available
  if (!video.videoUrl) {
    return (
      <div className="aspect-video bg-[var(--bg-panel)] rounded-[var(--radius-lg)] flex items-center justify-center max-w-lg mx-auto">
        <div className="text-center">
          <Video size={40} className="text-[var(--color-text-muted)] mx-auto mb-3 opacity-50" />
          <p className="text-sm text-[var(--color-text-muted)]">视频 URL 不可用</p>
        </div>
      </div>
    )
  }

  // Normal player
  return (
    <div className="relative rounded-[var(--radius-lg)] overflow-hidden bg-black max-w-lg mx-auto">
      <video
        key={video.id}
        src={video.videoUrl}
        controls
        preload="metadata"
        playsInline
        className="w-full aspect-video"
        aria-label="最终成片播放"
        onError={() => setLoadError(true)}
      />
    </div>
  )
}
