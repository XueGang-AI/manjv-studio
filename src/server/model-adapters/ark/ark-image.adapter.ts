// ============================================
// Ark Seedream 5.0 Image Adapter (doubao-seedream-5-0-260128)
// POST {baseUrl}/images/generations
// ============================================
import { BaseImageAdapter, createAdapterError } from '../base.adapter'
import { ImageGenerationRequest, ImageGenerationResponse } from '../types'

export interface ArkImageAdapterConfig {
  model: string
  apiKey: string
  baseUrl: string
}

export class ArkImageAdapter extends BaseImageAdapter {
  private baseUrl: string
  private apiKey: string
  private model: string

  constructor(config: ArkImageAdapterConfig) {
    super()
    this.model = config.model
    this.apiKey = config.apiKey
    this.baseUrl = config.baseUrl
  }

  async generate(request: ImageGenerationRequest): Promise<ImageGenerationResponse> {
    if (!this.apiKey) {
      throw createAdapterError({ code: 'AUTH_ERROR', message: 'Ark API key not configured' })
    }

    // Build prompt: prepend style as a directive if provided
    let prompt = request.prompt
    if (request.style) {
      prompt = `Style: ${request.style}. ${prompt}`
    }

    // Build request body
    const body: Record<string, unknown> = {
      model: this.model,
      prompt,
      watermark: false,
      response_format: 'url',
    }

    // Ark Seedream 5.0 当前图片接口使用 size 控制画幅。
    // aspect_ratio 会被忽略为默认 2K 方图；1080x1920 又低于最小像素要求。
    // 因此把内部比例显式映射到可接受的高分辨率尺寸。
    const requestedSize = request.params?.size as string | undefined
    body.size = requestedSize || sizeForAspectRatio(request.aspectRatio)

    // 兼容旧字段：保留在请求中不依赖它，方便供应商后续恢复时仍可识别。
    if (request.aspectRatio) {
      body.aspect_ratio = request.aspectRatio
    }

    // Multi-image: 直接透传 num_outputs。
    if (request.numOutputs && request.numOutputs > 1) {
      body.num_outputs = request.numOutputs
    }

    // Reference images: use reference_images (array) — confirmed working.
    // image (string) and image (array) also work, but reference_images is
    // the most semantically clear mapping from our interface.
    // Note: multimodal prompt array fails (HTTP 400: InvalidParameter).
    if (request.referenceImages?.length) {
      body.reference_images = request.referenceImages
    }

    // Negative prompt: confirmed accepted (HTTP 200)
    if (request.negativePrompt) {
      body.negative_prompt = request.negativePrompt
    }

    // Seed: passed through if provided (API may ignore it; probe found no seed in response)
    if (request.seed !== undefined && request.seed !== null) {
      body.seed = request.seed
    }

    const response = await fetch(`${this.baseUrl}/images/generations`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(120000),
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw createAdapterError({
        code: 'API_ERROR',
        message: `Ark Image API error (${response.status}): ${errorText.substring(0, 300)}`,
        retryable: response.status >= 500 || response.status === 429,
        statusCode: response.status,
      })
    }

    const data = await response.json()
    const images: Array<{ url: string; seed?: string | number; params?: Record<string, unknown> }> = []

    if (data.data && Array.isArray(data.data)) {
      for (const item of data.data) {
        // Build params from extra fields in the response item
        const params: Record<string, unknown> = {}
        if (item.size) params.size = item.size
        if (item.revised_prompt) params.revised_prompt = item.revised_prompt

        images.push({
          url: item.url || '',
          seed: item.seed, // probe found no seed in response; will be undefined
          params: Object.keys(params).length > 0 ? params : undefined,
        })
      }
    }

    if (images.length === 0) {
      throw createAdapterError({ code: 'NO_RESULT', message: 'No images in Ark response', retryable: true })
    }

    return { images }
  }
}

function sizeForAspectRatio(aspectRatio?: '9:16' | '16:9' | '1:1'): string {
  if (aspectRatio === '16:9') return '2560x1440'
  if (aspectRatio === '1:1') return '2048x2048'
  return '1440x2560'
}
