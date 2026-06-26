// ============================================
// Mock 视频适配器 - 返回占位视频
// 实现完整的 IVideoAdapter 接口
// ============================================
import { BaseVideoAdapter } from '../base.adapter'
import {
  VideoGenerationRequest, VideoGenerationResponse,
  VideoTaskCreationResult, VideoTaskPollResult, VideoTaskWaitResult,
} from '../types'
import { FFmpegService } from '@/server/services/ffmpeg.service'
import fs from 'fs'
import path from 'path'

export class MockVideoAdapter extends BaseVideoAdapter {
  async generate(request: VideoGenerationRequest): Promise<VideoGenerationResponse> {
    await new Promise((resolve) => setTimeout(resolve, 3000))
    const videoUrl = await this.ensureLocalMockVideo(request.duration || 5, request.aspectRatio || '9:16')

    return {
      videos: [
        {
          url: videoUrl,
          duration: request.duration || 5,
          params: {
            motion_strength: request.motionStrength,
            aspect_ratio: request.aspectRatio,
          },
        },
        {
          url: videoUrl,
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
    const videoUrl = await this.ensureLocalMockVideo(5, '9:16')

    // Mock: 总是返回完成
    return {
      taskId,
      status: 'completed',
      progress: 100,
      videoUrl,
      duration: 5,
      response: { mock: true, task_id: taskId, status: 'completed', video_url: videoUrl },
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

    if (!/^https?:\/\//i.test(videoUrl)) {
      fs.copyFileSync(videoUrl, localPath)
      return localPath
    }

    const res = await fetch(videoUrl)
    const buffer = Buffer.from(await res.arrayBuffer())
    fs.writeFileSync(localPath, buffer)
    return localPath
  }

  private async ensureLocalMockVideo(duration: number, aspectRatio: string): Promise<string> {
    const safeDuration = Math.max(1, Math.min(15, Math.round(duration)))
    const safeAspect = aspectRatio === '16:9' ? '16x9' : aspectRatio === '1:1' ? '1x1' : '9x16'
    const outputDir = path.join(process.cwd(), 'uploads', 'mock_videos')
    const outputPath = path.join(outputDir, `mock-${safeAspect}-${safeDuration}s.mp4`)

    if (fs.existsSync(outputPath) && fs.statSync(outputPath).size > 0) {
      return outputPath
    }

    fs.mkdirSync(outputDir, { recursive: true })
    const ffmpeg = new FFmpegService()
    const result = await ffmpeg.generatePlaceholder(outputPath, safeDuration, aspectRatio)
    if (!result.success || !result.outputPath) {
      throw new Error(`Mock video placeholder failed: ${result.error || 'unknown error'}`)
    }
    return result.outputPath
  }
}
