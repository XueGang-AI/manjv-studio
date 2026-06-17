// ============================================
// Agnes-Video-V2.0 视频适配器（真实 API + 异步轮询）
// 官方文档: num_frames (≤441, 8n+1) + frame_rate (1-60) 控制时长
// 轮询推荐: /agnesapi?video_id=<VIDEO_ID>
// 兼容旧版: /v1/videos/<task_id>
// ============================================
import { BaseVideoAdapter, normalizeStatus, createAdapterError } from '../base.adapter'
import {
  VideoGenerationRequest,
  VideoGenerationResponse,
  VideoTaskCreationResult,
  VideoTaskPollResult,
  VideoTaskWaitResult,
  RemoteVideoTaskStatus,
} from '../types'
import fs from 'fs'
import path from 'path'

export interface AgnesVideoAdapterConfig {
  model: string
  apiKey: string
  baseUrl: string
}

const DEFAULT_BASE_URL = 'https://apihub.agnes-ai.com/v1'
const DEFAULT_MODEL = 'agnes-video-v2.0'
const DEFAULT_FRAME_RATE = 24

export class AgnesVideoAdapter extends BaseVideoAdapter {
  private baseUrl: string
  private apiKey: string
  private model: string

  constructor(config: AgnesVideoAdapterConfig) {
    super()
    this.baseUrl = config.baseUrl || DEFAULT_BASE_URL
    this.apiKey = config.apiKey
    this.model = config.model || DEFAULT_MODEL
  }

  // ============================================================
  // 原有同步接口（向后兼容，内部调用 create + wait）
  // ============================================================
  async generate(request: VideoGenerationRequest): Promise<VideoGenerationResponse> {
    if (!this.apiKey) {
      throw createAdapterError({ code: 'AUTH_ERROR', message: 'AGNES_VIDEO_API_KEY not configured' })
    }

    const create = await this.createVideoTask(request)
    const wait = await this.waitForVideoCompletion(create.taskId, { timeoutMinutes: 10 })

    if (wait.completed && wait.videoUrl) {
      return {
        videos: [{
          url: wait.videoUrl,
          duration: wait.duration || request.duration,
          params: { task_id: wait.taskId, status: wait.status },
        }],
      }
    }

    if (wait.timedOut) {
      throw createAdapterError({
        code: 'TIMEOUT',
        message: `视频任务 ${wait.taskId} 轮询超时 (${wait.pollAttempts} 次, ${wait.totalSeconds}s)。任务仍在远端，task_id 已保存，可稍后继续检查。`,
        retryable: true,
      })
    }

    throw createAdapterError({
      code: 'GENERATION_FAILED',
      message: `视频生成失败: ${wait.error || JSON.stringify(wait.lastResponse).substring(0, 200)}`,
      retryable: true,
    })
  }

  // ============================================================
  // 创建视频异步任务（仅创建，不轮询，立即返回 task_id / video_id）
  // ============================================================
  async createVideoTask(request: VideoGenerationRequest): Promise<VideoTaskCreationResult> {
    if (!this.apiKey) {
      throw createAdapterError({ code: 'AUTH_ERROR', message: 'AGNES_VIDEO_API_KEY not configured' })
    }

    const frameRate = request.fps || DEFAULT_FRAME_RATE
    const numFrames = calcAgnesNumFrames(request.duration, frameRate)

    const createBody: Record<string, unknown> = {
      model: this.model,
      prompt: request.prompt,
      num_frames: numFrames,
      frame_rate: frameRate,
    }

    // 图生视频：传入 image 参数
    if (request.inputImage) {
      createBody.image = request.inputImage
    }

    if (request.negativePrompt) {
      createBody.negative_prompt = request.negativePrompt
    }
    if (request.params?.seed !== undefined) {
      createBody.seed = request.params.seed
    }

    // 尺寸：根据 aspectRatio 推导
    if (request.aspectRatio === '16:9') {
      createBody.width = 1152
      createBody.height = 768
    } else {
      // 9:16 默认
      createBody.width = 768
      createBody.height = 1152
    }

    // 音频（TTS 配音）
    if (request.voiceText) {
      createBody.voice_text = request.voiceText
    }
    if (request.generateAudio) {
      createBody.generate_audio = request.generateAudio
    }

    const res = await fetch(`${this.baseUrl}/videos`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${this.apiKey}` },
      body: JSON.stringify(createBody),
      signal: AbortSignal.timeout(60000),
    })

    if (!res.ok) {
      const errText = await res.text()
      throw createAdapterError({
        code: 'API_ERROR',
        message: `Agnes Video create error (${res.status}): ${errText.substring(0, 300)}`,
        retryable: res.status >= 500 || res.status === 429,
        statusCode: res.status,
      })
    }

    const data = (await res.json()) as Record<string, unknown>

    // 优先使用 video_id（推荐轮询方式），回退到 task_id
    const videoId = (data.video_id || '') as string
    const taskId = (data.task_id || data.id || '') as string
    const pollId = videoId || taskId

    if (!pollId) {
      throw createAdapterError({
        code: 'NO_TASK_ID',
        message: `No task_id/video_id in video response: ${JSON.stringify(data).substring(0, 200)}`,
        retryable: false,
      })
    }

    return {
      taskId: pollId,
      status: (data.status as RemoteVideoTaskStatus) || 'queued',
      createResponse: data,
    }
  }

  // ============================================================
  // 单次轮询视频任务状态
  // 推荐方式: /agnesapi?video_id=<VIDEO_ID>
  // 兼容方式: /v1/videos/<task_id>（旧版 task_ 前缀 ID）
  // ============================================================
  async pollVideoTask(taskId: string): Promise<VideoTaskPollResult> {
    if (!this.apiKey) {
      throw createAdapterError({ code: 'AUTH_ERROR', message: 'AGNES_VIDEO_API_KEY not configured' })
    }

    // 根据 ID 前缀选择轮询端点
    const isVideoId = taskId.startsWith('video_')
    const pollUrl = isVideoId
      ? `https://apihub.agnes-ai.com/agnesapi?video_id=${taskId}`
      : `${this.baseUrl}/videos/${taskId}`

    const res = await fetch(pollUrl, {
      headers: { 'Authorization': `Bearer ${this.apiKey}` },
      signal: AbortSignal.timeout(15000),
    })

    const data = (await res.json()) as Record<string, unknown>

    if (!res.ok) {
      return {
        taskId,
        status: 'failed',
        error: `HTTP ${res.status}: ${JSON.stringify(data).substring(0, 200)}`,
        errorCode: 'API_ERROR',
        retryable: res.status >= 500 || res.status === 429,
        response: data,
        polledAt: new Date().toISOString(),
      }
    }

    const rawStatus = (data.status as string) || 'unknown'
    const status = normalizeStatus(rawStatus)

    const result: VideoTaskPollResult = {
      taskId,
      status,
      progress: typeof data.progress === 'number' ? data.progress : undefined,
      response: data,
      polledAt: new Date().toISOString(),
    }

    if (status === 'completed' || status === 'succeeded' || status === 'success') {
      result.videoUrl = (data.video_url || data.url || data.output_url || data.remixed_from_video_id || '') as string
      // seconds 字段是 string 类型（如 "5.0"），需要解析
      const seconds = data.seconds
      if (typeof seconds === 'string') {
        result.duration = parseFloat(seconds) || undefined
      } else if (typeof seconds === 'number') {
        result.duration = seconds
      }
    }

    if (status === 'failed' || status === 'error') {
      result.error = (data.error || data.message || JSON.stringify(data)) as string
      result.errorCode = 'REMOTE_FAILED'
      result.retryable = false
    }

    return result
  }

  // ============================================================
  // 等待视频任务完成（含超时和进度回调）
  // ============================================================
  async waitForVideoCompletion(
    taskId: string,
    options?: {
      timeoutMinutes?: number
      intervalSeconds?: number
      onPoll?: (result: VideoTaskPollResult) => void
    }
  ): Promise<VideoTaskWaitResult> {
    const timeoutMinutes = options?.timeoutMinutes ?? 10
    const intervalSeconds = options?.intervalSeconds ?? 5
    const maxAttempts = Math.floor((timeoutMinutes * 60) / intervalSeconds)

    let lastResponse: Record<string, unknown> = {}

    const startTime = Date.now()

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      await new Promise(r => setTimeout(r, intervalSeconds * 1000))

      const pollResult = await this.pollVideoTask(taskId).catch((): VideoTaskPollResult => ({
        taskId,
        status: 'unknown' as RemoteVideoTaskStatus,
        response: {} as Record<string, unknown>,
        polledAt: new Date().toISOString(),
      }))

      lastResponse = pollResult.response
      if (options?.onPoll) options.onPoll(pollResult)

      // Terminal states
      if (pollResult.status === 'completed' || pollResult.status === 'succeeded' || pollResult.status === 'success') {
        return {
          taskId,
          completed: true,
          timedOut: false,
          status: 'completed',
          videoUrl: pollResult.videoUrl,
          duration: pollResult.duration,
          lastResponse,
          pollAttempts: attempt,
          totalSeconds: Math.floor((Date.now() - startTime) / 1000),
        }
      }

      if (pollResult.status === 'failed' || pollResult.status === 'error') {
        return {
          taskId,
          completed: false,
          timedOut: false,
          status: pollResult.status,
          error: pollResult.error,
          lastResponse,
          pollAttempts: attempt,
          totalSeconds: Math.floor((Date.now() - startTime) / 1000),
        }
      }
    }

    // Timeout
    return {
      taskId,
      completed: false,
      timedOut: true,
      status: 'timeout',
      lastResponse,
      pollAttempts: maxAttempts,
      totalSeconds: Math.floor((Date.now() - startTime) / 1000),
    }
  }

  // ============================================================
  // 下载视频到本地
  // ============================================================
  async downloadVideo(videoUrl: string, localPath: string): Promise<string> {
    const dir = path.dirname(localPath)
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }

    const res = await fetch(videoUrl, {
      signal: AbortSignal.timeout(300000), // 5 min download timeout
    })

    if (!res.ok) {
      throw createAdapterError({
        code: 'DOWNLOAD_FAILED',
        message: `Download failed (${res.status}): ${videoUrl.substring(0, 80)}`,
        retryable: res.status >= 500 || res.status === 429,
        statusCode: res.status,
      })
    }

    const buffer = Buffer.from(await res.arrayBuffer())
    fs.writeFileSync(localPath, buffer)
    return localPath
  }

}

/**
 * 根据请求的 duration 和 frame_rate 计算 Agnes Video API 合法的 num_frames。
 * 约束：
 *   - num_frames ≤ 441
 *   - num_frames 满足 8n + 1（即 1, 9, 17, 25, ..., 441）
 *   - seconds = num_frames / frame_rate
 *
 * 常用值（24fps）: 81≈3.4s, 121≈5s, 161≈6.7s, 241≈10s, 321≈13.4s, 401≈16.7s, 441≈18.4s
 */
function calcAgnesNumFrames(requestedDuration: number | undefined, frameRate: number): number {
  const fps = frameRate || DEFAULT_FRAME_RATE

  if (typeof requestedDuration !== 'number' || !Number.isFinite(requestedDuration) || requestedDuration <= 0) {
    return 121 // 默认 5 秒
  }

  const targetFrames = Math.round(requestedDuration * fps)

  // Snap 到 8n+1 格式，且 ≤ 441
  // 8n+1 的值 = 1, 9, 17, 25, ..., 441
  // n = (targetFrames - 1) / 8
  let n = Math.round((targetFrames - 1) / 8)
  n = Math.max(0, Math.min(n, 55)) // 55 → 8*55+1 = 441

  return 8 * n + 1
}
