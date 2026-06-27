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
  GENERATE_SCENE_REFERENCES: '生成场景参考图',
  GENERATE_SHOT_IMAGES: '生成分镜图',
  GENERATE_SHOT_VIDEOS: '生成视频片段',
  RENDER_FINAL_VIDEO: '合成最终成片',
  QUALITY_CHECK: '质量检查',
}

const MIN_SHOT_DURATION = 4

/**
 * 按当前 Ark Seedance i2v 模型约束 snap 镜头 duration，确保存入 DB 的值与实际视频时长一致。
 *
 * - Seedance 2.0: 4~15 秒整数
 * - Seedance 1.5 i2v: 4~12 秒整数
 */
export function snapShotDuration(requested: number, videoModelName: string): number {
  return Math.max(MIN_SHOT_DURATION, Math.min(getMaxShotDuration(videoModelName), Math.round(requested)))
}

/**
 * 返回视频生成模型单镜头最大时长（秒）。
 */
export function getMaxShotDuration(videoModelName: string | null): number {
  return (videoModelName || '').toLowerCase().includes('seedance-1-5') ? 12 : 15
}

/**
 * 校正镜头时长，确保：
 * 1. 每个镜头不超过 maxDuration（超长则拆分）
 * 2. 所有镜头总时长等于 targetDuration（按比例缩放 + 微调）
 * 3. 时间轴连续（start_time 紧接上一个 end_time）
 */
export function normalizeShotDurations(
  shots: Array<Record<string, unknown>>,
  targetDuration: number,
  maxDuration: number
): Array<Record<string, unknown>> {
  if (!shots.length) return shots

  const target = Math.max(MIN_SHOT_DURATION, Math.round(targetDuration))
  const max = Math.max(MIN_SHOT_DURATION, Math.round(maxDuration))
  const min = Math.min(MIN_SHOT_DURATION, max)

  // Step 1: 先拆分超长镜头，并保留每段原始时长作为后续配比依据
  const parts = splitOversizedShots(shots, max)
  const maxShotCount = Math.max(1, Math.floor(target / min))
  while (parts.length > maxShotCount) {
    const last = parts.pop()
    const prev = parts[parts.length - 1]
    if (!last || !prev) break
    prev.duration = getShotDuration(prev) + getShotDuration(last)
  }

  const minShotCount = Math.ceil(target / max)
  while (parts.length < minShotCount) {
    const largestIndex = findLargestDurationIndex(parts)
    const largest = parts[largestIndex]
    const duration = getShotDuration(largest)
    const firstDuration = Math.max(min, Math.floor(duration / 2))
    const secondDuration = Math.max(min, duration - firstDuration)
    parts.splice(
      largestIndex,
      1,
      { ...largest, shot_name: `${largest.shot_name || largest.shotName || ''} (1/2)`, duration: firstDuration },
      { ...largest, shot_name: `${largest.shot_name || largest.shotName || ''} (2/2)`, duration: secondDuration }
    )
  }

  const rawTotal = parts.reduce((sum, shot) => sum + getShotDuration(shot), 0)
  if (rawTotal <= 0) return parts

  // Step 2: 按目标总长重新分配整数秒，确保每段都在 Seedance 合法区间内
  const weighted = parts.map((shot, index) => {
    const scaled = (getShotDuration(shot) / rawTotal) * target
    const duration = clamp(Math.round(scaled), min, max)
    return {
      shot,
      index,
      duration,
      fraction: scaled - Math.floor(scaled),
    }
  })

  let total = weighted.reduce((sum, item) => sum + item.duration, 0)
  let diff = target - total
  while (diff !== 0) {
    const candidates = weighted
      .filter(item => diff > 0 ? item.duration < max : item.duration > min)
      .sort((a, b) => diff > 0 ? b.fraction - a.fraction : a.fraction - b.fraction)

    if (candidates.length === 0) break
    for (const item of candidates) {
      if (diff === 0) break
      item.duration += diff > 0 ? 1 : -1
      diff += diff > 0 ? -1 : 1
    }
  }

  total = weighted.reduce((sum, item) => sum + item.duration, 0)
  if (total !== target) {
    const adjustable = weighted.find(item => item.duration + (target - total) >= min && item.duration + (target - total) <= max)
    if (adjustable) adjustable.duration += target - total
  }

  const result: Array<Record<string, unknown>> = weighted
    .sort((a, b) => a.index - b.index)
    .map(item => ({ ...item.shot, duration: item.duration }))

  // Step 3: 重建连续时间轴
  let currentTime = 0
  let shotNo = 1
  for (const shot of result) {
    const dur = getShotDuration(shot)
    shot.shot_no = shotNo++
    shot.start_time = currentTime
    shot.end_time = currentTime + dur
    currentTime += dur
  }

  return result
}

/**
 * 拆分超过 maxDuration 的镜头为多个子镜头
 * 保留原始镜头的所有内容属性，仅调整时间轴和 shot_no
 */
function splitOversizedShots(
  shots: Array<Record<string, unknown>>,
  maxDuration: number
): Array<Record<string, unknown>> {
  const result: Array<Record<string, unknown>> = []

  for (const shot of shots) {
    const duration = getShotDuration(shot)

    if (duration <= maxDuration) {
      result.push({ ...shot, duration })
    } else {
      // 超长镜头：拆分为多个等长的子镜头
      const partCount = Math.ceil(duration / maxDuration)
      const partDuration = duration / partCount

      for (let i = 0; i < partCount; i++) {
        const suffix = partCount > 1 ? ` (${i + 1}/${partCount})` : ''

        result.push({
          ...shot,
          shot_name: `${shot.shot_name || ''}${suffix}`,
          duration: Math.max(MIN_SHOT_DURATION, Math.round(partDuration)),
        })
      }
    }
  }

  return result
}

function getShotDuration(shot: Record<string, unknown>): number {
  const explicit = toFiniteNumber(shot.duration)
  if (explicit && explicit > 0) return explicit

  const start = toFiniteNumber(shot.start_time) ?? toFiniteNumber(shot.startTime) ?? 0
  const end = toFiniteNumber(shot.end_time) ?? toFiniteNumber(shot.endTime)
  if (typeof end === 'number' && end > start) return end - start

  return 10
}

function toFiniteNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return undefined
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function findLargestDurationIndex(shots: Array<Record<string, unknown>>): number {
  let largestIndex = 0
  let largestDuration = 0
  for (let i = 0; i < shots.length; i++) {
    const duration = getShotDuration(shots[i])
    if (duration > largestDuration) {
      largestDuration = duration
      largestIndex = i
    }
  }
  return largestIndex
}
