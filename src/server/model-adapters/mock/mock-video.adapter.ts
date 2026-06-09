// ============================================
// Mock 视频适配器 - 返回占位视频
// Phase 2+ 时替换为 AgnesVideoAdapter
// ============================================
import { BaseVideoAdapter } from '../base.adapter'
import { VideoGenerationRequest, VideoGenerationResponse } from '../types'

export class MockVideoAdapter extends BaseVideoAdapter {
  async generate(request: VideoGenerationRequest): Promise<VideoGenerationResponse> {
    // 模拟 API 延迟（视频生成更慢）
    await new Promise((resolve) => setTimeout(resolve, 3000))

    return {
      videos: [
        {
          url: 'https://www.w3schools.com/html/mov_bbb.mp4',
          duration: request.duration || 5,
          params: {
            motion_strength: request.motionStrength,
            aspect_ratio: request.aspectRatio,
          },
        },
        {
          url: 'https://www.w3schools.com/html/mov_bbb.mp4',
          duration: request.duration || 5,
          params: {
            motion_strength: request.motionStrength,
            aspect_ratio: request.aspectRatio,
          },
        },
      ],
    }
  }
}
