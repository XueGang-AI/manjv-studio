'use client'

/**
 * 开发预览：真实视频媒体组件验证（Phase 3）。
 * --------------------------------------------
 * 使用真实项目 shot-videos 数据渲染 VideoPreviewCard 列表，
 * 验证 hover 播放 / 互斥 / 视口离开暂停 / reduced motion / 错误状态。
 *
 * 开发预览页，生产导航无入口；不修改业务路由。
 */
import { useEffect, useState } from 'react'
import { VideoPreviewCard, type VideoPreviewCardData } from '@/components/media/video-preview-card'
import { PlaybackProvider } from '@/components/media/video-playback-coordinator'
import type { ShotVideoGroup } from '@/components/shot-videos/shot-videos-types'
import type { VideoPreviewCardProps } from '@/components/media/video-preview-card'

// 测试项目通过环境变量指定（PREVIEW_PROJECT_ID / PREVIEW_EPISODE_ID），
// 避免将真实业务项目 ID 固化进源码。未配置时页面提示如何设置。
const PROJECT_ID = process.env.NEXT_PUBLIC_PREVIEW_PROJECT_ID || ''
const EPISODE_ID = process.env.NEXT_PUBLIC_PREVIEW_EPISODE_ID || ''

function toCardData(group: ShotVideoGroup): VideoPreviewCardData[] {
  // 取该 shot 下每个视频为一张卡片
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

export default function MediaPreviewPage() {
  const [groups, setGroups] = useState<ShotVideoGroup[]>([])
  const configured = Boolean(PROJECT_ID && EPISODE_ID)

  useEffect(() => {
    if (!configured) return
    fetch(`/api/projects/${PROJECT_ID}/episodes/${EPISODE_ID}/shot-videos`)
      .then(r => r.json())
      .then(j => { if (j.success) setGroups(j.data.shots) })
      .catch(() => {})
  }, [configured])

  const cards = groups.flatMap(g => toCardData(g).map((data, i) => ({ data, status: statusFor(g, i) })))

  return (
    <div className="min-h-screen bg-[var(--bg-base)] p-6">
      <div className="max-w-5xl mx-auto">
        <h1 className="text-xl font-bold text-[var(--text-primary)] mb-1">视频媒体组件预览（Phase 3）</h1>
        <p className="text-sm text-[var(--text-tertiary)] mb-6">
          真实项目视频数据 · hover 静音预览 · 点击播放 · 多卡互斥 · 离开视口暂停
        </p>
        {!configured ? (
          <div className="rounded-[var(--radius-lg)] border border-dashed border-[var(--border-default)] p-6 text-sm text-[var(--text-secondary)]">
            <p className="mb-2 font-medium text-[var(--text-primary)]">未配置测试项目</p>
            <p className="text-[var(--text-tertiary)]">
              在 <code className="font-mono">.env</code> 中设置 <code className="font-mono">NEXT_PUBLIC_PREVIEW_PROJECT_ID</code> 与 <code className="font-mono">NEXT_PUBLIC_PREVIEW_EPISODE_ID</code> 指向本地测试项目，再访问本页加载真实视频数据。源码不固化真实业务 ID。
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
