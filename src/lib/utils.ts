// ============================================
// 通用工具函数
// ============================================
import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * 格式化日期
 */
export function formatDate(date: Date | string): string {
  return new Date(date).toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/**
 * 项目状态中文映射
 */
export const PROJECT_STATUS_MAP: Record<string, string> = {
  DRAFT: '草稿',
  STORY_GENERATING: '故事方案生成中',
  STORY_PENDING_CONFIRM: '故事方案待确认',
  STORY_CONFIRMED: '故事方案已确认',
  CHARACTER_GENERATING: '角色设定生成中',
  CHARACTER_PENDING_CONFIRM: '角色设定待确认',
  CHARACTER_CONFIRMED: '角色设定已确认',
  CHARACTER_IMAGE_GENERATING: '角色图生成中',
  CHARACTER_IMAGE_PENDING_PICK: '角色图待选择',
  CHARACTER_IMAGE_CONFIRMED: '标准角色图已确认',
  STORYBOARD_GENERATING: '分镜生成中',
  STORYBOARD_PENDING_CONFIRM: '分镜待确认',
  STORYBOARD_CONFIRMED: '分镜已确认',
  SHOT_IMAGE_GENERATING: '分镜图生成中',
  SHOT_IMAGE_PENDING_PICK: '分镜图待选择',
  SHOT_IMAGE_CONFIRMED: '分镜图已确认',
  SHOT_VIDEO_GENERATING: '视频片段生成中',
  SHOT_VIDEO_PENDING_PICK: '视频片段待选择',
  SHOT_VIDEO_CONFIRMED: '视频片段已确认',
  RENDERING: '成片合成中',
  RENDERED: '成片已生成',
  FINAL_CONFIRMED: '最终确认',
  FAILED: '失败',
}

/**
 * 任务状态中文映射
 */
export const TASK_STATUS_MAP: Record<string, string> = {
  pending: '等待中',
  running: '执行中',
  success: '已完成',
  failed: '已失败',
  cancelled: '已取消',
  retrying: '重试中',
}

/**
 * 任务类型中文映射
 */
export const TASK_TYPE_MAP: Record<string, string> = {
  GENERATE_STORY_PACKAGE: '生成故事方案',
  GENERATE_CHARACTERS: '生成角色设定',
  GENERATE_CHARACTER_IMAGES: '生成角色图',
  GENERATE_STORYBOARD: '生成分镜脚本',
  GENERATE_IMAGE_PROMPTS: '生成图片 Prompt',
  GENERATE_SHOT_IMAGES: '生成分镜图',
  GENERATE_VIDEO_PROMPTS: '生成视频 Prompt',
  GENERATE_SHOT_VIDEOS: '生成视频片段',
  GENERATE_VOICE_SCRIPT: '生成配音文案',
  GENERATE_PLATFORM_COPY: '生成平台文案',
  RENDER_FINAL_VIDEO: '合成最终成片',
  QUALITY_CHECK: '质量检查',
}

/**
 * 按 provider 约束 snap 镜头 duration，确保存入 DB 的值与实际视频时长一致。
 *
 * - Agnes: num_frames ≤ 441 / 24fps，snap 到 8n+1 帧数对应的精确秒数
 * - Ark i2v: 4~12 秒整数
 * - Ark t2v: 5 或 10 秒
 */
export function snapShotDuration(requested: number, modelProvider: string): number {
  if (modelProvider === 'ark') {
    return Math.max(4, Math.min(12, Math.round(requested)))
  }
  // Agnes: snap 到 8n+1 帧数 / 24fps 对应的秒数
  const fps = 24
  const targetFrames = Math.round(requested * fps)
  let n = Math.round((targetFrames - 1) / 8)
  n = Math.max(0, Math.min(n, 55)) // 8*55+1=441
  const numFrames = 8 * n + 1
  return numFrames / fps
}

/**
 * 根据项目的 modelProvider 返回视频生成模型单镜头最大时长（秒）
 * - Agnes Video: num_frames ≤ 441 / 24fps ≈ 18.4s，取 18
 * - Ark Seedance i2v: 最大 12 秒
 * - 保守默认: 12 秒
 */
export function getMaxShotDuration(modelProvider: string | null): number {
  if (modelProvider === 'ark') return 12
  if (modelProvider === 'agnes') return 18
  return 12
}
