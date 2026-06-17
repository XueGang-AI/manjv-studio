// ============================================
// Agnes-Image-2.0-Flash 图片适配器（真实 API）
// ============================================
import { BaseImageAdapter, createAdapterError } from '../base.adapter'
import { ImageGenerationRequest, ImageGenerationResponse } from '../types'

export interface AgnesImageAdapterConfig {
  model: string
  apiKey: string
  baseUrl: string
}

const DEFAULT_BASE_URL = 'https://apihub.agnes-ai.com/v1'
const DEFAULT_MODEL = 'agnes-image-2.0-flash'

export class AgnesImageAdapter extends BaseImageAdapter {
  private baseUrl: string
  private apiKey: string
  private model: string

  constructor(config: AgnesImageAdapterConfig) {
    super()
    this.baseUrl = config.baseUrl || DEFAULT_BASE_URL
    this.apiKey = config.apiKey
    this.model = config.model || DEFAULT_MODEL
  }

  async generate(request: ImageGenerationRequest): Promise<ImageGenerationResponse> {
    if (!this.apiKey) {
      throw createAdapterError({ code: 'AUTH_ERROR', message: 'AGNES_IMAGE_API_KEY not configured' })
    }

    const body: Record<string, unknown> = {
      model: this.model,
      prompt: request.prompt,
      aspect_ratio: request.aspectRatio || '9:16',
      num_outputs: request.numOutputs || 4,
    }

    if (request.negativePrompt) body.negative_prompt = request.negativePrompt
    if (request.seed) body.seed = request.seed
    if (request.referenceImages?.length) body.reference_images = request.referenceImages
    // Note: `style` is not supported by the Agnes image API; include it in the prompt instead

    const response = await fetch(`${this.baseUrl}/images/generations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${this.apiKey}` },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(120000),
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw createAdapterError({
        code: 'API_ERROR',
        message: `Agnes Image API error (${response.status}): ${errorText.substring(0, 300)}`,
        retryable: response.status >= 500 || response.status === 429,
        statusCode: response.status,
      })
    }

    const data = await response.json()
    const images: Array<{ url: string; seed?: string | number; params?: Record<string, unknown> }> = []

    if (data.data && Array.isArray(data.data)) {
      for (const item of data.data) {
        images.push({
          url: item.url || '',
          seed: item.seed,
          params: { revised_prompt: item.revised_prompt },
        })
      }
    }

    if (images.length === 0) {
      throw createAdapterError({ code: 'NO_RESULT', message: 'No images in response', retryable: true })
    }

    return { images }
  }
}
