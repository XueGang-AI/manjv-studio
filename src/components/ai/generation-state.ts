/**
 * AI 生成状态映射（Phase 4）
 * --------------------------------------------
 * 将视频/图片任务的远端状态 + 项目状态 + 提交态映射为统一 GenerationState。
 * 状态来自真实数据，不由 UI 自行推进。
 *
 * 数据来源：
 * - ShotVideo.remoteStatus（远端异步任务状态）
 * - project.status（项目级生成态）
 * - 提交组件的本地 submitting 标志
 */

export type GenerationState =
  | 'idle'
  | 'submitting'
  | 'queued'
  | 'running'
  | 'success'
  | 'error'
  | 'cancelled'

/** 远端 pending 状态集合（queued/processing/running 等） */
const REMOTE_PENDING = new Set([
  'queued', 'pending', 'waiting',
  'processing', 'running', 'in_progress', 'generating',
])

/** 远端终态成功集合 */
const REMOTE_SUCCESS = new Set([
  'completed', 'succeeded', 'success', 'done',
])

/** 远端终态失败集合 */
const REMOTE_FAILED = new Set([
  'failed', 'error',
])

/** 远端取消集合 */
const REMOTE_CANCELLED = new Set([
  'cancelled', 'canceled',
])

/** 远端超时（视为需处理，归 error） */
const REMOTE_TIMEOUT = new Set(['timeout'])

function norm(status: string | null | undefined): string {
  return (status || '').toLowerCase()
}

/**
 * 从远端任务状态 + 是否有产物推导 GenerationState。
 *
 * @param remoteStatus ShotVideo.remoteStatus
 * @param hasOutput 是否已有成功产物（videoUrl 且远端成功）
 * @param submitting 是否正在提交（API 调用中）
 */
export function deriveGenerationState(
  remoteStatus: string | null | undefined,
  hasOutput: boolean,
  submitting: boolean,
): GenerationState {
  if (submitting) return 'submitting'

  const s = norm(remoteStatus)
  if (!s) {
    // 无远端任务记录：有产物=成功，否则空闲
    return hasOutput ? 'success' : 'idle'
  }
  if (REMOTE_SUCCESS.has(s)) return 'success'
  if (REMOTE_FAILED.has(s) || REMOTE_TIMEOUT.has(s)) return 'error'
  if (REMOTE_CANCELLED.has(s)) return 'cancelled'
  // queued 与 running 在 UI 上均表现为"运行中"，但 queued 单独保留语义
  if (s === 'queued' || s === 'pending' || s === 'waiting') return 'queued'
  if (REMOTE_PENDING.has(s)) return 'running'
  return hasOutput ? 'success' : 'idle'
}

export const GENERATION_STATE_LABEL: Record<GenerationState, string> = {
  idle: '空闲',
  submitting: '提交中',
  queued: '排队中',
  running: '生成中',
  success: '已完成',
  error: '生成失败',
  cancelled: '已取消',
}
