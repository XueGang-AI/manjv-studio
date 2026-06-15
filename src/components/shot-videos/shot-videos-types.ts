/**
 * Shot Videos shared types — aligned with Prisma + API
 */

export interface VideoPromptBrief {
  prompt: string | null
  duration: number | null
  motionStrength: string | null
  negativePrompt: string | null
}

export interface ConfirmedImageBrief {
  id: string
  imageUrl: string
}

export interface ShotVideoItem {
  id: string
  videoUrl: string | null
  prompt: string | null
  seed: string | null
  duration: number | null
  modelName: string | null
  isSelected: boolean
  isConfirmed: boolean
  inputImageUrl: string | null
  remoteTaskId: string | null
  remoteStatus: string | null
  remoteProgress: number | null
  lastPolledAt: string | null
  remoteResponseJson: unknown
  params: { aspect_ratio?: string; generation_method?: string; [key: string]: unknown } | null
}

export interface ShotVideoGroup {
  shot: {
    id: string; shotNo: number; shotName: string | null
    startTime: number | null; endTime: number | null
    videoPrompt: VideoPromptBrief | null
    confirmedImage: ConfirmedImageBrief | null
  }
  videos: ShotVideoItem[]
  selectedVideo: { id: string; videoUrl: string } | null
  confirmed: boolean
}

export interface ShotVideosData {
  projectId: string
  episodeId: string
  projectStatus: string
  shots: ShotVideoGroup[]
  allConfirmed: boolean
}

// ─── Helpers ─────────────────────────────────────────────────────────

export type VideoStatus = 'none' | 'generating' | 'generated' | 'selected' | 'confirmed' | 'failed' | 'timeout'

/** Derive display status from video group data */
export function getVideoGroupStatus(group: ShotVideoGroup, isGenerating: boolean): VideoStatus {
  if (group.confirmed) return 'confirmed'
  if (group.selectedVideo) return 'selected'

  // Check remote task states
  const hasPendingTask = group.videos.some(v => {
    if (!v.remoteTaskId) return false
    const s = (v.remoteStatus || '').toLowerCase()
    return s === 'queued' || s === 'pending' || s === 'processing' || s === 'running' || s === 'in_progress' || s === 'waiting'
  })
  const hasFailedTask = group.videos.some(v => {
    if (!v.remoteTaskId) return false
    const s = (v.remoteStatus || '').toLowerCase()
    return s === 'failed' || s === 'error' || s === 'cancelled'
  })
  const hasTimedOutTask = group.videos.some(v => {
    if (!v.remoteTaskId) return false
    return (v.remoteStatus || '').toLowerCase() === 'timeout'
  })

  if (hasTimedOutTask) return 'timeout'
  if (hasFailedTask && !hasPendingTask && group.videos.every(v => !v.videoUrl)) return 'failed'
  if (hasPendingTask) return 'generating'
  if (group.videos.some(v => v.videoUrl)) return 'generated'
  if (isGenerating) return 'generating'
  return 'none'
}

export const STATUS_LABELS: Record<VideoStatus, string> = {
  none: '未生成',
  generating: '生成中',
  generated: '待选择',
  selected: '已选择',
  confirmed: '已确认',
  failed: '生成失败',
  timeout: '轮询超时',
}

/** Get human-readable remote status */
export function remoteStatusLabel(status?: string | null): string {
  if (!status) return ''
  const s = status.toLowerCase()
  if (s === 'queued' || s === 'pending' || s === 'waiting') return '排队中…'
  if (s === 'processing' || s === 'running' || s === 'in_progress' || s === 'generating') return '处理中…'
  if (s === 'completed' || s === 'succeeded' || s === 'success' || s === 'done') return '已完成'
  if (s === 'failed' || s === 'error' || s === 'cancelled') return '失败'
  if (s === 'timeout') return '超时'
  return status
}

/** Check if a remote task is in a terminal state */
export function isRemoteTerminal(status?: string | null): boolean {
  if (!status) return false
  const s = status.toLowerCase()
  return ['completed', 'succeeded', 'success', 'done', 'failed', 'error', 'cancelled', 'timeout'].includes(s)
}

/** Check if a remote task is pending (not terminal) */
export function isRemotePending(status?: string | null): boolean {
  if (!status) return false
  return !isRemoteTerminal(status)
}
