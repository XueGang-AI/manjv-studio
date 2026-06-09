// ============================================
// Agnes-Image-2.0-Flash 图片适配器（真实 API）
// ============================================
import { BaseImageAdapter } from '../base.adapter'
import { ImageGenerationRequest, ImageGenerationResponse } from '../types'

export class AgnesImageAdapter extends BaseImageAdapter {
  private baseUrl: string
  private apiKey: string
  private model: string

  constructor() {
    super()
    this.baseUrl = process.env.AGNES_IMAGE_API_BASE_URL || 'https://apihub.agnes-ai.com/v1'
    this.apiKey = process.env.AGNES_IMAGE_API_KEY || ''
    this.model = process.env.AGNES_IMAGE_MODEL || 'agnes-image-2.0-flash'
  }

  async generate(request: ImageGenerationRequest): Promise<ImageGenerationResponse> {
    if (!this.apiKey) {
      throw new Error('AGNES_IMAGE_API_KEY not configured')
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
    if (request.style) body.style = request.style

    const response = await fetch(`${this.baseUrl}/images/generations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${this.apiKey}` },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(120000),
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`Agnes Image API error (${response.status}): ${errorText.substring(0, 300)}`)
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
      throw new Error('No images in response')
    }

    return { images }
  }
}
