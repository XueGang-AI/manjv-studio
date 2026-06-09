// ============================================
// 任务队列类型定义
// ============================================

export enum TaskType {
  GENERATE_STORY_PACKAGE = 'GENERATE_STORY_PACKAGE',
  GENERATE_CHARACTERS = 'GENERATE_CHARACTERS',
  GENERATE_CHARACTER_IMAGES = 'GENERATE_CHARACTER_IMAGES',
  GENERATE_STORYBOARD = 'GENERATE_STORYBOARD',
  GENERATE_IMAGE_PROMPTS = 'GENERATE_IMAGE_PROMPTS',
  GENERATE_SHOT_IMAGES = 'GENERATE_SHOT_IMAGES',
  GENERATE_VIDEO_PROMPTS = 'GENERATE_VIDEO_PROMPTS',
  GENERATE_SHOT_VIDEOS = 'GENERATE_SHOT_VIDEOS',
  GENERATE_VOICE_SCRIPT = 'GENERATE_VOICE_SCRIPT',
  GENERATE_PLATFORM_COPY = 'GENERATE_PLATFORM_COPY',
  RENDER_FINAL_VIDEO = 'RENDER_FINAL_VIDEO',
  QUALITY_CHECK = 'QUALITY_CHECK',
}

export enum TaskStatus {
  PENDING = 'pending',
  RUNNING = 'running',
  SUCCESS = 'success',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
  RETRYING = 'retrying',
}

export interface TaskPayload {
  projectId: string
  episodeId?: string
  shotId?: string
  taskType: TaskType
  input?: Record<string, unknown>
}

export interface TaskResult {
  taskId: string
  status: TaskStatus
  output?: Record<string, unknown>
  error?: string
  progress: number
}
