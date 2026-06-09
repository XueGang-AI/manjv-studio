// ============================================
// Agnes-Video-V2.0 视频适配器（真实 API + 异步轮询）
// ============================================
import { BaseVideoAdapter } from '../base.adapter'
import { VideoGenerationRequest, VideoGenerationResponse } from '../types'

export class AgnesVideoAdapter extends BaseVideoAdapter {
  private baseUrl: string
  private apiKey: string
  private model: string

  constructor() {
    super()
    this.baseUrl = process.env.AGNES_VIDEO_API_BASE_URL || 'https://apihub.agnes-ai.com/v1'
    this.apiKey = process.env.AGNES_VIDEO_API_KEY || ''
    this.model = process.env.AGNES_VIDEO_MODEL || 'agnes-video-v2.0'
  }

  async generate(request: VideoGenerationRequest): Promise<VideoGenerationResponse> {
    if (!this.apiKey) {
      throw new Error('AGNES_VIDEO_API_KEY not configured')
    }

    // Step 1: Create video task
    const createBody: Record<string, unknown> = {
      model: this.model,
      prompt: request.prompt,
      duration: request.duration || 5,
      aspect_ratio: request.aspectRatio || '9:16',
    }

    if (request.inputImage) {
      createBody.image = request.inputImage
    }

    const createRes = await fetch(`${this.baseUrl}/videos`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${this.apiKey}` },
      body: JSON.stringify(createBody),
      signal: AbortSignal.timeout(30000),
    })

    if (!createRes.ok) {
      const err = await createRes.text()
      throw new Error(`Agnes Video create error (${createRes.status}): ${err.substring(0, 300)}`)
    }

    const createData = await createRes.json()
    const taskId = createData.task_id || createData.id || createData.video_id

    if (!taskId) {
      throw new Error(`No task ID in video response: ${JSON.stringify(createData).substring(0, 200)}`)
    }

    // Step 2: Poll until complete
    const maxAttempts = 120 // 10 minutes at 5s intervals
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      await new Promise(r => setTimeout(r, 5000))

      const pollRes = await fetch(`${this.baseUrl}/videos/${taskId}`, {
        headers: { 'Authorization': `Bearer ${this.apiKey}` },
        signal: AbortSignal.timeout(10000),
      })

      if (!pollRes.ok) continue

      const pollData = await pollRes.json()
      const status = pollData.status

      if (status === 'completed' || status === 'succeeded' || status === 'success') {
        return {
          videos: [{
            url: pollData.video_url || pollData.url || pollData.output_url || '',
            duration: pollData.seconds || request.duration,
            params: { task_id: taskId, status },
          }],
        }
      }

      if (status === 'failed' || status === 'error') {
        throw new Error(`Video generation failed: ${pollData.error || JSON.stringify(pollData).substring(0, 200)}`)
      }
    }

    throw new Error(`Video generation timed out after ${maxAttempts * 5}s`)
  }
}
