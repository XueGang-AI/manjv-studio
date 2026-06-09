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
  params?: Record<string, unknown>
}

export interface VideoGenerationResponse {
  videos: Array<{
    url: string
    duration?: number
    params?: Record<string, unknown>
  }>
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
}
