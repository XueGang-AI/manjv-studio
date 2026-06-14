// ============================================
// 模型适配器基类
// ============================================
import {
  ITextAdapter, IImageAdapter, IVideoAdapter,
  TextGenerationRequest, TextGenerationResponse,
  VideoGenerationRequest, VideoGenerationResponse,
  VideoTaskCreationResult, VideoTaskPollResult, VideoTaskWaitResult,
} from './types'

export abstract class BaseTextAdapter implements ITextAdapter {
  abstract generate<T = unknown>(request: TextGenerationRequest): Promise<TextGenerationResponse<T>>
}

export abstract class BaseImageAdapter implements IImageAdapter {
  abstract generate(
    request: Parameters<IImageAdapter['generate']>[0]
  ): ReturnType<IImageAdapter['generate']>
}

export abstract class BaseVideoAdapter implements IVideoAdapter {
  abstract generate(request: VideoGenerationRequest): Promise<VideoGenerationResponse>
  abstract createVideoTask(request: VideoGenerationRequest): Promise<VideoTaskCreationResult>
  abstract pollVideoTask(taskId: string): Promise<VideoTaskPollResult>
  abstract waitForVideoCompletion(
    taskId: string,
    options?: { timeoutMinutes?: number; intervalSeconds?: number; onPoll?: (result: VideoTaskPollResult) => void }
  ): Promise<VideoTaskWaitResult>
  abstract downloadVideo(videoUrl: string, localPath: string): Promise<string>
}
