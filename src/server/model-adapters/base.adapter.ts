// ============================================
// 模型适配器基类
// ============================================
import {
  ITextAdapter, IImageAdapter, IVideoAdapter,
  TextGenerationRequest, TextGenerationResponse,
  VideoGenerationRequest, VideoGenerationResponse,
  VideoTaskCreationResult, VideoTaskPollResult, VideoTaskWaitResult,
  AdapterError, RemoteVideoTaskStatus,
} from './types'

// ─── 共享工具函数 ──────────────────────────────────────────────────

/**
 * 标准化远端任务状态到统一枚举
 *
 * 各 Provider 返回的状态字符串不一致（completed/succeeded/success/done 等），
 * 统一映射到 4 个核心状态：completed / failed / processing / queued
 */
export function normalizeStatus(raw: string): RemoteVideoTaskStatus {
  const s = raw.toLowerCase()
  if (s === 'completed' || s === 'succeeded' || s === 'success' || s === 'done') return 'completed'
  if (s === 'failed' || s === 'error' || s === 'cancelled') return 'failed'
  if (s === 'processing' || s === 'running' || s === 'in_progress' || s === 'generating') return 'processing'
  if (s === 'queued' || s === 'pending' || s === 'waiting') return 'queued'
  return 'unknown'
}

/**
 * 创建结构化适配器错误
 *
 * 所有适配器应使用此函数创建错误，确保错误结构一致：
 * - code: 机器可读错误码
 * - message: 人类可读错误消息
 * - retryable: 该错误是否可重试
 * - statusCode: 原始 HTTP 状态码
 */
export function createAdapterError(options: {
  code: string
  message: string
  retryable?: boolean
  statusCode?: number
}): AdapterError {
  const err = new Error(options.message) as AdapterError
  err.code = options.code
  err.retryable = options.retryable ?? false
  err.statusCode = options.statusCode
  return err
}

// ─── 基类 ──────────────────────────────────────────────────────────

export abstract class BaseTextAdapter implements ITextAdapter {
  abstract generate<T = unknown>(request: TextGenerationRequest): Promise<TextGenerationResponse<T>>
}

export abstract class BaseImageAdapter implements IImageAdapter {
  abstract generate(
    request: Parameters<IImageAdapter['generate']>[0]
  ): ReturnType<IImageAdapter['generate']>
}

export abstract class BaseVideoAdapter implements IVideoAdapter {
  abstract generate(request: VideoGenerationRequest): Promise<VideoGenerationResponse>
  abstract createVideoTask(request: VideoGenerationRequest): Promise<VideoTaskCreationResult>
  abstract pollVideoTask(taskId: string): Promise<VideoTaskPollResult>
  abstract waitForVideoCompletion(
    taskId: string,
    options?: { timeoutMinutes?: number; intervalSeconds?: number; onPoll?: (result: VideoTaskPollResult) => void }
  ): Promise<VideoTaskWaitResult>
  abstract downloadVideo(videoUrl: string, localPath: string): Promise<string>
}
