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
  taskType: 'character_image' | 'shot_image' | 'cover_image' | 'image_edit'
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
  negativePrompt?: string
  duration?: number
  aspectRatio?: '9:16' | '16:9' | '1:1'
  motionStrength?: 'low' | 'medium' | 'high'
  fps?: number
  /** TTS 语音文本，用于自动生成配音（如角色对白） */
  voiceText?: string
  /** 是否自动生成音频 */
  generateAudio?: boolean
  params?: Record<string, unknown>
}

export interface VideoGenerationResponse {
  videos: Array<{
    url: string
    duration?: number
    params?: Record<string, unknown>
  }>
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
