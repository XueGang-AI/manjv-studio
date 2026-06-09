// ============================================
// Mock 图片适配器 - 返回占位图
// Phase 2+ 时替换为 AgnesImageAdapter
// ============================================
import { BaseImageAdapter } from '../base.adapter'
import { ImageGenerationRequest, ImageGenerationResponse } from '../types'

export class MockImageAdapter extends BaseImageAdapter {
  async generate(request: ImageGenerationRequest): Promise<ImageGenerationResponse> {
    // 模拟 API 延迟
    await new Promise((resolve) => setTimeout(resolve, 1500))

    const numOutputs = request.numOutputs || 4

    return {
      images: Array.from({ length: numOutputs }, (_, i) => ({
        url: `https://placehold.co/1080x1920/1a1a2e/e94560?text=${request.taskType}+${i + 1}`,
        seed: `mock-seed-${Date.now()}-${i}`,
        params: { aspect_ratio: request.aspectRatio, style: request.style },
      })),
    }
  }
}
