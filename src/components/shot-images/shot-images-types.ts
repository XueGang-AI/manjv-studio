/**
 * Shot Images shared types — aligned with Prisma + API
 */

export interface ImagePromptBrief {
  zhPrompt: string | null
  enPrompt: string | null
  negativePrompt: string | null
}

export interface ShotImageItem {
  id: string
  imageUrl: string
  prompt: string | null
  seed: string | null
  style: string | null
  aspectRatio: string | null
  referenceImages: Array<{ character_name: string; image_url: string; reference_type?: string }>
  isSelected: boolean
  isConfirmed: boolean
}

export interface ShotGroup {
  shot: {
    id: string; shotNo: number; shotName: string | null
    startTime: number | null; endTime: number | null
    location: string | null; characters: unknown; action: string | null
    imagePrompt: ImagePromptBrief | null
  }
  images: ShotImageItem[]
  selectedImage: { id: string; imageUrl: string } | null
  confirmed: boolean
}

export interface ShotImagesData {
  projectId: string
  episodeId: string
  projectStatus: string
  shots: ShotGroup[]
  allConfirmed: boolean
}

// ─── Helpers ─────────────────────────────────────────────────────────

export function getShotDuration(shot: ShotGroup['shot']): number {
  return Math.max(0, (shot.endTime ?? 0) - (shot.startTime ?? 0))
}

export type ImageStatus = 'none' | 'generating' | 'generated' | 'selected' | 'confirmed' | 'failed'

export function getImageGroupStatus(group: ShotGroup, isGenerating: boolean): ImageStatus {
  if (group.confirmed) return 'confirmed'
  if (group.selectedImage) return 'selected'
  if (group.images.length > 0) return 'generated'
  if (isGenerating) return 'generating'
  return 'none'
}

export const STATUS_LABELS: Record<ImageStatus, string> = {
  none: '未生成',
  generating: '生成中',
  generated: '待选择',
  selected: '已选择',
  confirmed: '已确认',
  failed: '生成失败',
}
