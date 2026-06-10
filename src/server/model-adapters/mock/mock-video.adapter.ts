// ============================================
// Mock 视频适配器 - 返回占位视频
// 实现完整的 IVideoAdapter 接口
// ============================================
import { BaseVideoAdapter } from '../base.adapter'
import {
  VideoGenerationRequest, VideoGenerationResponse,
  VideoTaskCreationResult, VideoTaskPollResult, VideoTaskWaitResult,
} from '../types'
import fs from 'fs'
import path from 'path'

export class MockVideoAdapter extends BaseVideoAdapter {
  async generate(request: VideoGenerationRequest): Promise<VideoGenerationResponse> {
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

  async createVideoTask(request: VideoGenerationRequest): Promise<VideoTaskCreationResult> {
    return {
      taskId: `mock-video-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      status: 'queued',
      createResponse: { mock: true, prompt: request.prompt.substring(0, 50), created_at: new Date().toISOString() },
    }
  }

  async pollVideoTask(taskId: string): Promise<VideoTaskPollResult> {
    // Mock: 总是返回完成
    return {
      taskId,
      status: 'completed',
      progress: 100,
      videoUrl: 'https://www.w3schools.com/html/mov_bbb.mp4',
      duration: 5,
      response: { mock: true, task_id: taskId, status: 'completed', video_url: 'https://www.w3schools.com/html/mov_bbb.mp4' },
      polledAt: new Date().toISOString(),
    }
  }

  async waitForVideoCompletion(
    taskId: string,
    options?: { timeoutMinutes?: number; intervalSeconds?: number; onPoll?: (result: VideoTaskPollResult) => void }
  ): Promise<VideoTaskWaitResult> {
    // Mock: 立即完成
    await new Promise(r => setTimeout(r, 1000))
    const pollResult = await this.pollVideoTask(taskId)
    if (options?.onPoll) options.onPoll(pollResult)
    return {
      taskId,
      completed: true,
      timedOut: false,
      status: 'completed',
      videoUrl: pollResult.videoUrl,
      duration: pollResult.duration,
      lastResponse: pollResult.response,
      pollAttempts: 1,
      totalSeconds: 1,
    }
  }

  async downloadVideo(videoUrl: string, localPath: string): Promise<string> {
    const dir = path.dirname(localPath)
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })

    // Mock: 复制本地占位视频或创建空文件
    const res = await fetch(videoUrl)
    const buffer = Buffer.from(await res.arrayBuffer())
    fs.writeFileSync(localPath, buffer)
    return localPath
  }
}
