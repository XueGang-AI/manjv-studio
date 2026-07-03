/**
 * Final Preview shared types — aligned with Prisma + API
 */

export interface ShotVideoBrief {
  shotNo: number
  shotName: string | null
  videoCount: number
}

export interface FinalVideoItem {
  id: string
  videoUrl: string | null
  storageObjectKey: string | null
  storageProvider: string | null
  sourceVideoUrl: string | null
  coverUrl: string | null
  subtitleUrl: string | null
  assetPackageUrl: string | null
  assetPackageObjectKey: string | null
  assetPackageStorageProvider: string | null
  duration: number | null
  aspectRatio: string | null
  fps: number | null
  status: string
  createdAt: string
}

export interface FinalPreviewData {
  projectId: string
  episodeId: string
  projectStatus: string
  finalVideos: FinalVideoItem[]
  latest: FinalVideoItem | null
  shotsWithVideos: ShotVideoBrief[]
  allVideosConfirmed: boolean
  canRender: boolean
}

// ─── Helpers ─────────────────────────────────────────────────────────

export type RenderStatus = 'idle' | 'can_render' | 'cannot_render' | 'rendering' | 'rendered' | 'failed'

export function getRenderStatus(data: FinalPreviewData | null, localRendering: boolean): RenderStatus {
  if (!data) return 'idle'
  if (data.projectStatus === 'RENDERING' || localRendering) return 'rendering'
  if (data.projectStatus === 'RENDERED' || data.latest?.status === 'READY') return 'rendered'
  if (data.canRender) return 'can_render'
  return 'cannot_render'
}

export const STATUS_LABELS: Record<RenderStatus, string> = {
  idle: '加载中',
  can_render: '可以合成',
  cannot_render: '前置条件未满足',
  rendering: '合成中',
  rendered: '已合成',
  failed: '合成失败',
}

/** Check preflight conditions, return array of issues */
export function getPreflightIssues(data: FinalPreviewData | null): Array<{ key: string; label: string; passed: boolean; detail: string }> {
  if (!data) return []

  const issues: Array<{ key: string; label: string; passed: boolean; detail: string }> = []

  // Check shots exist
  const totalShots = data.shotsWithVideos.length
  issues.push({
    key: 'has_shots',
    label: '镜头数据',
    passed: totalShots > 0,
    detail: totalShots > 0 ? `${totalShots} 个镜头` : '无镜头数据',
  })

  // Check all videos confirmed
  issues.push({
    key: 'all_confirmed',
    label: '视频确认',
    passed: data.allVideosConfirmed,
    detail: data.allVideosConfirmed ? '全部已确认' : '部分镜头未确认视频',
  })

  // Check each shot has at least one video
  const missingShots = data.shotsWithVideos.filter(s => s.videoCount === 0)
  issues.push({
    key: 'has_videos',
    label: '视频片段',
    passed: missingShots.length === 0,
    detail: missingShots.length === 0
      ? `${totalShots} 个镜头均有视频`
      : `${missingShots.length} 个镜头缺少视频`,
  })

  return issues
}

export function getMp4LinkCheck(
  videoUrl: string | null | undefined,
  videoReady: boolean,
  videoError: boolean,
): { key: string; label: string; passed: boolean; detail: string } | null {
  if (!videoUrl) return null
  if (videoError) {
    return { key: 'mp4_link', label: 'MP4 链接', passed: false, detail: '不可读' }
  }
  if (!videoReady) {
    return { key: 'mp4_link', label: 'MP4 链接', passed: false, detail: '读取中' }
  }
  return { key: 'mp4_link', label: 'MP4 链接', passed: true, detail: '可访问' }
}
