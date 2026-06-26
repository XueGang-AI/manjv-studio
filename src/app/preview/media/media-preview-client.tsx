'use client'

/**
 * MediaPreviewClient — 视频媒体组件预览客户端
 * --------------------------------------------
 * 接收服务端传入的测试项目 ID（非 NEXT_PUBLIC_ 变量），fetch 真实 shot-videos 数据。
 */
import { useEffect, useState } from 'react'
import { VideoPreviewCard, type VideoPreviewCardData, type VideoPreviewCardProps } from '@/components/media/video-preview-card'
import { PlaybackProvider } from '@/components/media/video-playback-coordinator'
import type { ShotVideoGroup } from '@/components/shot-videos/shot-videos-types'

function toCardData(group: ShotVideoGroup): VideoPreviewCardData[] {
  return group.videos.map((v, i) => ({
    id: v.id,
    videoUrl: v.videoUrl,
    posterUrl: group.shot.confirmedImage?.imageUrl ?? null,
    title: `镜头 ${group.shot.shotNo}`,
    subtitle: group.shot.shotName || `候选 ${i + 1}`,
    duration: v.duration,
    aspectRatio: (v.params?.aspect_ratio as string) ?? null,
    version: v.seed ? String(i + 1) : null,
    isSelected: v.isSelected,
    isConfirmed: v.isConfirmed,
    remoteStatus: v.remoteStatus,
    remoteProgress: v.remoteProgress,
  }))
}

function statusFor(group: ShotVideoGroup, idx: number): VideoPreviewCardProps['status'] {
  const v = group.videos[idx]
  if (group.confirmed) return 'confirmed'
  if (v?.isSelected) return 'selected'
  if (v?.remoteStatus) {
    const s = v.remoteStatus.toLowerCase()
    if (['queued', 'pending', 'processing', 'running', 'in_progress', 'waiting'].includes(s)) return 'generating'
    if (['failed', 'error'].includes(s)) return 'failed'
  }
  if (v?.videoUrl) return 'generated'
  return 'none'
}

export function MediaPreviewClient({
  projectId,
  episodeId,
  configured,
}: {
  projectId: string
  episodeId: string
  configured: boolean
}) {
  const [groups, setGroups] = useState<ShotVideoGroup[]>([])

  useEffect(() => {
    if (!configured) return
    fetch(`/api/projects/${projectId}/episodes/${episodeId}/shot-videos`)
      .then(r => r.json())
      .then(j => { if (j.success) setGroups(j.data.shots) })
      .catch(() => {})
  }, [configured, projectId, episodeId])

  const cards = groups.flatMap(g => toCardData(g).map((data, i) => ({ data, status: statusFor(g, i) })))

  return (
    <div className="min-h-screen bg-[var(--bg-base)] p-6">
      <div className="max-w-5xl mx-auto">
        <h1 className="text-xl font-bold text-[var(--text-primary)] mb-1">视频媒体组件预览</h1>
        <p className="text-sm text-[var(--text-tertiary)] mb-6">
          真实项目视频数据 · hover 静音预览 · 点击播放 · 多卡互斥 · 离开视口暂停
        </p>
        {!configured ? (
          <div className="rounded-[var(--radius-lg)] border border-dashed border-[var(--border-default)] p-6 text-sm text-[var(--text-secondary)]">
            <p className="mb-2 font-medium text-[var(--text-primary)]">未配置测试项目</p>
            <p className="text-[var(--text-tertiary)]">
              在 <code className="font-mono">.env</code> 中设置 <code className="font-mono">PREVIEW_PROJECT_ID</code> 与 <code className="font-mono">PREVIEW_EPISODE_ID</code> 指向本地测试项目，再访问本页加载真实视频数据。源码不固化真实业务 ID。
            </p>
          </div>
        ) : (
          <PlaybackProvider>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {cards.map(({ data, status }) => (
                <VideoPreviewCard key={data.id} video={data} status={status} />
              ))}
            </div>
            {cards.length === 0 && (
              <p className="text-sm text-[var(--text-tertiary)]">加载真实视频数据中…</p>
            )}
          </PlaybackProvider>
        )}
      </div>
    </div>
  )
}
