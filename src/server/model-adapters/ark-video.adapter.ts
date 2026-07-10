// ============================================
// ArkVideoAdapter — 豆包 Seedance 视频适配器
// Model: doubao-seedance-1-5-pro-251215
// Create: POST {baseUrl}/contents/generations/tasks
// Poll: GET {baseUrl}/contents/generations/tasks/{task_id}
// Format: content_array
// Audio: generate_audio supported
// ============================================
import { BaseVideoAdapter, normalizeStatus, createAdapterError } from './base.adapter'
import {
  VideoGenerationRequest,
  VideoGenerationResponse,
  VideoTaskCreationResult,
  VideoTaskPollResult,
  VideoTaskWaitResult,
  RemoteVideoTaskStatus,
} from './types'
import { isSeedanceLastFrameEnabled } from '@/server/services/seedance-last-frame'
import fs from 'fs'
import path from 'path'

export interface ArkVideoAdapterOptions {
  model: string
  apiKey: string
  baseUrl: string
}

const DEFAULT_MODEL = 'doubao-seedance-1-5-pro-251215'
const DEFAULT_RESOLUTION = '720p'

/** @deprecated Prefer isSeedanceLastFrameEnabled from seedance-last-frame service */
export function isArkLastFrameEnabled(): boolean {
  return isSeedanceLastFrameEnabled()
}

export class ArkVideoAdapter extends BaseVideoAdapter {
  private baseUrl: string
  private apiKey: string
  private model: string

  constructor(options: ArkVideoAdapterOptions) {
    super()
    this.model = options.model || DEFAULT_MODEL
    this.apiKey = options.apiKey
    this.baseUrl = options.baseUrl
  }

  // ============================================================
  // 原有同步接口（向后兼容，内部调用 create + wait）
  // ============================================================
  async generate(request: VideoGenerationRequest): Promise<VideoGenerationResponse> {
    if (!this.apiKey) {
      throw createAdapterError({ code: 'AUTH_ERROR', message: 'ArkVideoAdapter: apiKey is required' })
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
        message: `Ark 视频任务 ${wait.taskId} 轮询超时 (${wait.pollAttempts} 次, ${wait.totalSeconds}s)。任务仍在远端，task_id 已保存，可稍后继续检查。`,
        retryable: true,
      })
    }

    throw createAdapterError({
      code: 'GENERATION_FAILED',
      message: `Ark 视频生成失败: ${wait.error || JSON.stringify(wait.lastResponse).substring(0, 200)}`,
      retryable: true,
    })
  }

  // ============================================================
  // 创建视频异步任务（仅创建，不轮询，立即返回 task_id）
  // Ark API 使用 content_array 格式
  // ============================================================
  async createVideoTask(request: VideoGenerationRequest): Promise<VideoTaskCreationResult> {
    if (!this.apiKey) {
      throw createAdapterError({ code: 'AUTH_ERROR', message: 'ArkVideoAdapter: apiKey is required' })
    }
    if (!this.baseUrl) {
      throw createAdapterError({ code: 'CONFIG_ERROR', message: 'ArkVideoAdapter: baseUrl is required' })
    }

    // Build content array (confirmed working format from probe)
    const content: Array<Record<string, unknown>> = [
      { type: 'text', text: request.prompt },
    ]

    // Append motionStrength to prompt text if provided (not directly supported by Ark)
    if (request.motionStrength) {
      content[0].text = `${content[0].text}, motion strength: ${request.motionStrength}`
    }

    // Append voiceText to prompt if provided (not directly supported by Ark)
    if (request.voiceText) {
      content[0].text = `${content[0].text}, voice text: "${request.voiceText}"`
    }

    // Seedance 任务接口没有稳定的 negative_prompt 字段；把负面约束合入文本，
    // 确保视频阶段能继承分镜图的一致性和反伪文字要求。
    if (request.negativePrompt) {
      content[0].text = `${content[0].text}\n\nNegative prompt: ${request.negativePrompt}`
    }

    // Add input image
    if (request.inputImage) {
      content.push({
        type: 'image_url',
        image_url: { url: request.inputImage },
        role: 'first_frame',
      })
    }

    const wantsLastFrame = !!request.inputImage && !!request.lastImage && isArkLastFrameEnabled()
    if (wantsLastFrame) {
      content.push({
        type: 'image_url',
        image_url: { url: request.lastImage },
        role: 'last_frame',
      })
    }

    // Seedance visual modes are mutually exclusive: first/last-frame mode cannot
    // be mixed with multimodal reference media. The confirmed shot image is the
    // first frame; character/scene consistency is already baked into that frame.
    const extraReferenceImages = request.inputImage
      ? []
      : (request.referenceImages || [])
        .filter(url => url)
        .slice(0, 8)
    for (const imageUrl of extraReferenceImages) {
      content.push({
        type: 'image_url',
        image_url: { url: imageUrl },
        role: 'reference_image',
      })
    }

    const createBody: Record<string, unknown> = {
      model: this.model,
      content,
      duration: snapArkSeedanceDuration(request.duration, request.taskType, this.model),
      ratio: request.aspectRatio || '9:16',
      resolution: (request.params?.resolution as string | undefined) || process.env.ARK_VIDEO_RESOLUTION || DEFAULT_RESOLUTION,
      watermark: false,
    }

    // Optional params
    if (request.fps) {
      createBody.fps = request.fps
    }
    if (request.generateAudio !== undefined) {
      createBody.generate_audio = request.generateAudio
    }
    if (request.params?.seed !== undefined) {
      createBody.seed = request.params.seed
    }

    const res = await fetch(`${this.baseUrl}/contents/generations/tasks`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(createBody),
      signal: AbortSignal.timeout(60000),
    })

    if (!res.ok) {
      const errText = await res.text()
      throw createAdapterError({
        code: 'API_ERROR',
        message: `Ark Video create error (${res.status}): ${errText.substring(0, 300)}`,
        retryable: res.status >= 500 || res.status === 429,
        statusCode: res.status,
      })
    }

    const data = (await res.json()) as Record<string, unknown>

    // Extract task ID from confirmed field paths:
    // Probe checks: data.task_id → data.id → data.data.task_id → data.data.id
    const taskId = (data.task_id
      || data.id
      || (data.data as Record<string, unknown>)?.task_id
      || (data.data as Record<string, unknown>)?.id
      || '') as string

    if (!taskId) {
      throw createAdapterError({
        code: 'NO_TASK_ID',
        message: `No task_id in Ark video response: ${JSON.stringify(data).substring(0, 200)}`,
        retryable: false,
      })
    }

    return {
      taskId,
      status: (data.status as RemoteVideoTaskStatus) || 'queued',
      createResponse: data,
    }
  }

  // ============================================================
  // 单次轮询视频任务状态
  // Ark poll: GET {baseUrl}/contents/generations/tasks/{task_id}
  // ============================================================
  async pollVideoTask(taskId: string): Promise<VideoTaskPollResult> {
    if (!this.apiKey) {
      throw createAdapterError({ code: 'AUTH_ERROR', message: 'ArkVideoAdapter: apiKey is required' })
    }

    const res = await fetch(`${this.baseUrl}/contents/generations/tasks/${taskId}`, {
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
      // Extract video_url from confirmed field paths
      // Ark API: content.video_url (actual observed path)
      // Fallback: top-level video_url, url, output_url, data.video_url, data.url
      const content = data.content as Record<string, unknown> | undefined
      result.videoUrl = (content?.video_url
        || data.video_url
        || data.url
        || data.output_url
        || (data.data as Record<string, unknown>)?.video_url
        || (data.data as Record<string, unknown>)?.url
        || '') as string
      result.duration = (data.duration || data.seconds || content?.duration) as number | undefined
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
    const intervalSeconds = options?.intervalSeconds ?? 10
    const maxAttempts = Math.floor((timeoutMinutes * 60) / intervalSeconds)

    let lastResponse: Record<string, unknown> = {}

    const startTime = Date.now()

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      await new Promise(r => setTimeout(r, intervalSeconds * 1000))

      const pollResult = await this.pollVideoTask(taskId).catch(() => ({
        taskId,
        status: 'unknown' as RemoteVideoTaskStatus,
        response: {} as Record<string, unknown>,
        polledAt: new Date().toISOString(),
        videoUrl: undefined as string | undefined,
        duration: undefined as number | undefined,
        error: undefined as string | undefined,
        progress: undefined as number | undefined,
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
        message: `Ark download failed (${res.status}): ${videoUrl.substring(0, 80)}`,
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
 * 把请求里的 duration 收口到 Seedance 支持的合法值集合。
 * - Seedance 2.0: 4 ~ 15 秒整数
 * - Seedance 1.5 i2v: 4 ~ 12 秒整数
 * - Seedance 1.5 t2v: 5 / 10
 * 超出范围的值会被远端 400 InvalidParameter 拒掉，所以这里 clamp 到合法区间。
 */
export function snapArkSeedanceDuration(
  requested: number | undefined,
  taskType: 'text_to_video' | 'image_to_video',
  model: string
): number {
  if (typeof requested !== 'number' || !Number.isFinite(requested) || requested <= 0) {
    return taskType === 'image_to_video' ? 5 : 5
  }

  if (isSeedance20Model(model)) {
    return Math.max(4, Math.min(15, Math.round(requested)))
  }

  if (taskType === 'image_to_video') {
    // i2v: 4 ~ 12，clamp 到合法范围
    return Math.max(4, Math.min(12, Math.round(requested)))
  }

  // t2v: 仅允许 5 / 10，四舍五入到最近的合法值
  const ALLOWED = [5, 10]
  let best = ALLOWED[0]
  let bestDiff = Math.abs(requested - best)
  for (const v of ALLOWED) {
    const d = Math.abs(requested - v)
    if (d < bestDiff) {
      best = v
      bestDiff = d
    }
  }
  return best
}

function isSeedance20Model(model: string): boolean {
  const normalized = model.toLowerCase()
  return normalized.includes('seedance-2-0') || normalized.includes('seedance-2.0')
}
