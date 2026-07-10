// ============================================
// 模型适配层 - 统一接口类型定义
// ============================================

// ---- 文本生成 ----
export interface TextGenerationRequest {
  taskType:
    | 'story_analysis'
    | 'episode_outline'
    | 'character_design'
    | 'relationship_network'
    | 'storyboard'
    | 'scene_prompt'
    | 'image_prompt'
    | 'video_prompt'
    | 'voice_script'
    | 'platform_copy'
    | 'quality_check'
  systemPrompt: string
  userPrompt: string
  outputSchema?: object
  temperature?: number
  maxTokens?: number
}

export interface TextGenerationResponse<T = unknown> {
  rawText: string
  json?: T
  usage?: {
    inputTokens?: number
    outputTokens?: number
  }
}

// ---- 图片生成 ----
export interface ImageGenerationRequest {
  taskType: 'character_image' | 'scene_image' | 'shot_image' | 'cover_image' | 'image_edit'
  prompt: string
  negativePrompt?: string
  referenceImages?: string[]
  aspectRatio?: '9:16' | '16:9' | '1:1'
  style?: string
  seed?: string | number
  numOutputs?: number
  params?: Record<string, unknown>
}

export interface ImageGenerationResponse {
  images: Array<{
    url: string
    seed?: string | number
    params?: Record<string, unknown>
  }>
}

// ---- 视频生成 ----
export interface VideoGenerationRequest {
  taskType: 'text_to_video' | 'image_to_video'
  prompt: string
  inputImage?: string
  /** Optional last frame for providers/accounts where first+last frame mode has been explicitly enabled. */
  lastImage?: string
  referenceImages?: string[]
  negativePrompt?: string
  duration?: number
  aspectRatio?: '9:16' | '16:9' | '1:1'
  motionStrength?: 'low' | 'medium' | 'high'
  fps?: number
  /** TTS 语音文本，用于自动生成配音（如角色对白） */
  voiceText?: string
  /** 是否自动生成音频 */
  generateAudio?: boolean
  transition?: {
    type: 'hard_cut' | 'match_cut' | 'fade_to_black'
    durationFrames: number
    reason?: string
  }
  params?: Record<string, unknown>
}

export interface VideoGenerationResponse {
  videos: Array<{
    url: string
    duration?: number
    params?: Record<string, unknown>
  }>
}

// ---- 统一错误结构 ----
export interface AdapterError extends Error {
  /** 机器可读错误码，如 API_ERROR / AUTH_ERROR / TIMEOUT / NO_RESULT */
  code: string
  /** 人类可读错误消息 */
  message: string
  /** 该错误是否可重试 */
  retryable: boolean
  /** 原始 HTTP 状态码（如有） */
  statusCode?: number
}

// ---- 视频异步任务（新增） ----
export type RemoteVideoTaskStatus = 'queued' | 'processing' | 'running' | 'completed' | 'succeeded' | 'success' | 'failed' | 'error' | 'timeout' | 'unknown'

export interface VideoTaskCreationResult {
  taskId: string
  status: RemoteVideoTaskStatus
  createResponse: Record<string, unknown>
}

export interface VideoTaskPollResult {
  taskId: string
  status: RemoteVideoTaskStatus
  progress?: number
  videoUrl?: string
  duration?: number
  error?: string
  errorCode?: string
  retryable?: boolean
  response: Record<string, unknown>
  polledAt: string // ISO date
}

export interface VideoTaskWaitResult {
  taskId: string
  completed: boolean
  timedOut: boolean
  status: RemoteVideoTaskStatus
  videoUrl?: string
  duration?: number
  error?: string
  errorCode?: string
  retryable?: boolean
  lastResponse: Record<string, unknown>
  pollAttempts: number
  totalSeconds: number
}

// ---- 适配器接口 ----
export interface ITextAdapter {
  generate<T = unknown>(request: TextGenerationRequest): Promise<TextGenerationResponse<T>>
}

export interface IImageAdapter {
  generate(request: ImageGenerationRequest): Promise<ImageGenerationResponse>
}

export interface IVideoAdapter {
  generate(request: VideoGenerationRequest): Promise<VideoGenerationResponse>

  /** 创建视频异步任务（仅创建，不轮询） */
  createVideoTask(request: VideoGenerationRequest): Promise<VideoTaskCreationResult>

  /** 单次轮询视频任务状态 */
  pollVideoTask(taskId: string): Promise<VideoTaskPollResult>

  /** 等待视频任务完成（含超时） */
  waitForVideoCompletion(
    taskId: string,
    options?: { timeoutMinutes?: number; intervalSeconds?: number; onPoll?: (result: VideoTaskPollResult) => void }
  ): Promise<VideoTaskWaitResult>

  /** 下载视频到本地路径 */
  downloadVideo(videoUrl: string, localPath: string): Promise<string>
}
