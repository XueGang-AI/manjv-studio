// ============================================
// 任务队列客户端 - BullMQ + Redis
// ============================================
import { Queue, Worker, Job, QueueScheduler } from 'bullmq'
import { TaskType, TaskPayload } from './queue.types'

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379'

// Redis 连接配置
const connection = {
  url: REDIS_URL,
}

// 队列实例（单例模式）
let taskQueue: Queue<TaskPayload> | null = null
let scheduler: QueueScheduler | null = null

export function getTaskQueue(): Queue<TaskPayload> {
  if (!taskQueue) {
    taskQueue = new Queue<TaskPayload>('manjv-tasks', { connection })
  }
  return taskQueue
}

export function getScheduler(): QueueScheduler {
  if (!scheduler) {
    scheduler = new QueueScheduler('manjv-tasks', { connection })
  }
  return scheduler
}

/**
 * 添加任务到队列
 */
export async function enqueueTask(
  taskType: TaskType,
  payload: Omit<TaskPayload, 'taskType'>
): Promise<string> {
  const queue = getTaskQueue()
  const job = await queue.add(taskType, {
    taskType,
    ...payload,
  } as TaskPayload, {
    attempts: getRetryAttempts(taskType),
    backoff: {
      type: 'exponential',
      delay: 2000,
    },
  })
  return job.id || ''
}

/**
 * 根据任务类型获取重试次数
 */
function getRetryAttempts(taskType: TaskType): number {
  switch (taskType) {
    case TaskType.GENERATE_STORY_PACKAGE:
    case TaskType.GENERATE_CHARACTERS:
    case TaskType.GENERATE_STORYBOARD:
      return 3 // 文本任务 3 次
    case TaskType.GENERATE_CHARACTER_IMAGES:
    case TaskType.GENERATE_SHOT_IMAGES:
      return 3 // 图片任务 3 次
    case TaskType.GENERATE_SHOT_VIDEOS:
      return 2 // 视频任务 2 次
    case TaskType.RENDER_FINAL_VIDEO:
      return 1 // 合成不自动重试
    default:
      return 2
  }
}

/**
 * 创建 Worker（在独立进程中运行，Phase 1 仅定义接口）
 */
export function createWorker(
  processor: (job: Job<TaskPayload>) => Promise<Record<string, unknown>>
): Worker<TaskPayload> {
  return new Worker<TaskPayload>('manjv-tasks', processor, {
    connection,
    concurrency: 4,
  })
}
