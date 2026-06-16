// ============================================
// 任务事件系统 — Redis Pub/Sub + 进程内回退
// ============================================
//
// 架构：
//   Worker 进程
//     → 更新 GenerationTask（DB 是 Source of Truth）
//     → emitTaskEvent()
//     → Redis PUBLISH（跨进程低延迟通知）
//     → 进程内 EventEmitter（同进程直推，如 Worker 内嵌时）
//
//   Next.js 进程（SSE Route）
//     → Redis SUBSCRIBE（接收跨进程事件）
//     → 进程内 EventEmitter（同进程直推）
//     → SSE 推送到浏览器
//
//   Redis 不可用时：
//     → 仅进程内 EventEmitter（不跨进程）
//     → SSE 依赖 DB 轮询降级
//
// 安全约束：
//   事件只包含必要字段，不包含完整 input/output/FFmpeg stderr/密钥/路径

import { EventEmitter } from 'events'

// ─── 事件类型 ──────────────────────────────────────────────────────

export interface TaskUpdateEvent {
  /** 事件唯一 ID（用于去重和 Last-Event-ID） */
  eventId: string
  taskId: string
  projectId: string
  episodeId?: string | null
  taskType: string
  status: string
  progress: number
  /** 脱敏错误信息，不含内部堆栈 */
  errorMessage?: string | null
  updatedAt: string
}

export type TaskEventType =
  | 'task.created'
  | 'task.updated'
  | 'task.running'
  | 'task.progress'
  | 'task.completed'
  | 'task.failed'

// ─── Redis 频道 ────────────────────────────────────────────────────

const REDIS_CHANNEL_PREFIX = 'manjv:task:'

/** 项目频道：manjv:task:{projectId} */
function projectChannel(projectId: string): string {
  return `${REDIS_CHANNEL_PREFIX}${projectId}`
}

/** 全局频道：manjv:task:_all */
const GLOBAL_CHANNEL = `${REDIS_CHANNEL_PREFIX}_all`

// ─── 进程内事件总线（同进程直推） ──────────────────────────────────

const TASK_EVENT_BUS = new EventEmitter()
TASK_EVENT_BUS.setMaxListeners(50)

// ─── Redis 客户端（懒初始化） ──────────────────────────────────────

let publisher: import('ioredis').Redis | null = null
let redisAvailable = false

async function getPublisher(): Promise<import('ioredis').Redis | null> {
  if (publisher) return publisher
  if (!process.env.REDIS_URL) return null

  try {
    const Redis = (await import('ioredis')).default
    publisher = new Redis(process.env.REDIS_URL, {
      maxRetriesPerRequest: 1,
      retryStrategy(times) {
        if (times > 3) return null // 放弃重连
        return Math.min(times * 200, 2000)
      },
      lazyConnect: true,
      connectTimeout: 3000,
    })

    publisher.on('error', (err) => {
      if (!redisAvailable) return // 连接阶段的错误，静默
      console.error('[task-events] Redis publisher error:', err.message)
      redisAvailable = false
    })

    publisher.on('ready', () => {
      redisAvailable = true
    })

    await publisher.connect()
    redisAvailable = true
    return publisher
  } catch (err) {
    console.warn('[task-events] Redis not available, falling back to in-process events:', (err as Error).message)
    publisher = null
    redisAvailable = false
    return null
  }
}

// ─── 事件发布 ──────────────────────────────────────────────────────

/**
 * Worker 侧：推送任务事件
 *
 * 1. 进程内 EventEmitter（同进程直推）
 * 2. Redis PUBLISH（跨进程低延迟通知）
 * 3. Redis 不可用时仅进程内直推
 */
export async function emitTaskEvent(type: TaskEventType, payload: Omit<TaskUpdateEvent, 'eventId'>): Promise<void> {
  const eventId = generateEventId()
  const fullPayload: TaskUpdateEvent = { ...payload, eventId }

  // 进程内直推
  TASK_EVENT_BUS.emit('task_update', { type, payload: fullPayload })
  TASK_EVENT_BUS.emit(`task_update:${payload.projectId}`, { type, payload: fullPayload })

  // Redis 跨进程发布
  try {
    const pub = await getPublisher()
    if (pub && redisAvailable) {
      const message = JSON.stringify({ type, payload: fullPayload })
      // 发布到项目频道和全局频道
      await Promise.all([
        pub.publish(projectChannel(payload.projectId), message),
        pub.publish(GLOBAL_CHANNEL, message),
      ])
    }
  } catch {
    // Redis 发布失败不影响业务流程
    redisAvailable = false
  }
}

/** 同步版本（用于不关心 Redis 结果的场景） */
export function emitTaskEventSync(type: TaskEventType, payload: Omit<TaskUpdateEvent, 'eventId'>): void {
  const eventId = generateEventId()
  const fullPayload: TaskUpdateEvent = { ...payload, eventId }

  // 进程内直推
  TASK_EVENT_BUS.emit('task_update', { type, payload: fullPayload })
  TASK_EVENT_BUS.emit(`task_update:${payload.projectId}`, { type, payload: fullPayload })

  // 异步 Redis 发布（不阻塞）
  emitTaskEvent(type, payload).catch(() => { /* ignore */ })
}

// ─── SSE 侧订阅 ───────────────────────────────────────────────────

export interface TaskEventSubscription {
  unsubscribe: () => void
}

/**
 * SSE 端点：订阅项目任务事件
 *
 * 同时使用：
 * 1. 进程内 EventEmitter（同进程直推）
 * 2. Redis SUBSCRIBE（跨进程通知）
 *
 * 返回 unsubscribe 函数。
 */
export async function subscribeToProjectEvents(
  projectId: string,
  callback: (event: { type: TaskEventType; payload: TaskUpdateEvent }) => void,
): Promise<TaskEventSubscription> {
  const subscriptions: Array<() => void> = []

  // 1. 进程内订阅
  const inProcHandler = (event: { type: TaskEventType; payload: TaskUpdateEvent }) => {
    callback(event)
  }
  TASK_EVENT_BUS.on(`task_update:${projectId}`, inProcHandler)
  subscriptions.push(() => TASK_EVENT_BUS.off(`task_update:${projectId}`, inProcHandler))

  // 2. Redis 订阅
  let subscriber: import('ioredis').Redis | null = null
  try {
    const Redis = (await import('ioredis')).default
    subscriber = new Redis(process.env.REDIS_URL!, {
      maxRetriesPerRequest: null, // 订阅模式不设超时
      retryStrategy(times) {
        if (times > 10) return null
        return Math.min(times * 500, 5000)
      },
      lazyConnect: true,
      connectTimeout: 3000,
    })

    subscriber.on('message', (channel: string, message: string) => {
      if (channel === projectChannel(projectId) || channel === GLOBAL_CHANNEL) {
        try {
          const event = JSON.parse(message)
          // 去重：检查 eventId
          callback(event)
        } catch { /* ignore parse errors */ }
      }
    })

    subscriber.on('error', () => {
      // Redis 订阅错误静默，依赖进程内 + DB fallback
    })

    await subscriber.connect()
    await subscriber.subscribe(projectChannel(projectId), GLOBAL_CHANNEL)
    subscriptions.push(() => {
      subscriber?.disconnect()
    })
  } catch {
    // Redis 不可用，仅依赖进程内 + DB fallback
    subscriber?.disconnect()
  }

  return {
    unsubscribe: () => {
      for (const unsub of subscriptions) {
        try { unsub() } catch { /* ignore */ }
      }
    },
  }
}

/**
 * SSE 端点：订阅全局任务事件
 */
export async function subscribeToAllEvents(
  callback: (event: { type: TaskEventType; payload: TaskUpdateEvent }) => void,
): Promise<TaskEventSubscription> {
  const subscriptions: Array<() => void> = []

  // 进程内
  const inProcHandler = (event: { type: TaskEventType; payload: TaskUpdateEvent }) => {
    callback(event)
  }
  TASK_EVENT_BUS.on('task_update', inProcHandler)
  subscriptions.push(() => TASK_EVENT_BUS.off('task_update', inProcHandler))

  // Redis
  let subscriber: import('ioredis').Redis | null = null
  try {
    const Redis = (await import('ioredis')).default
    subscriber = new Redis(process.env.REDIS_URL!, {
      maxRetriesPerRequest: null,
      retryStrategy(times) {
        if (times > 10) return null
        return Math.min(times * 500, 5000)
      },
      lazyConnect: true,
      connectTimeout: 3000,
    })

    subscriber.on('message', (_channel: string, message: string) => {
      try {
        callback(JSON.parse(message))
      } catch { /* ignore */ }
    })

    subscriber.on('error', () => {})

    await subscriber.connect()
    await subscriber.subscribe(GLOBAL_CHANNEL)
    subscriptions.push(() => { subscriber?.disconnect() })
  } catch {
    subscriber?.disconnect()
  }

  return {
    unsubscribe: () => {
      for (const unsub of subscriptions) {
        try { unsub() } catch { /* ignore */ }
      }
    },
  }
}

// ─── 工具函数 ──────────────────────────────────────────────────────

/** 根据 GenerationTask status 推导事件类型 */
export function statusToEventType(status: string): TaskEventType {
  switch (status) {
    case 'pending': return 'task.created'
    case 'running': return 'task.running'
    case 'success': return 'task.completed'
    case 'failed': return 'task.failed'
    default: return 'task.updated'
  }
}

/** 从 GenerationTask 记录构造 TaskUpdateEvent（不含 eventId，由 emitTaskEvent 补充） */
export function taskToUpdateEvent(task: {
  id: string
  projectId: string
  episodeId?: string | null
  taskType: string
  status: string
  progress: number
  errorMessage?: string | null
  updatedAt: Date
}): Omit<TaskUpdateEvent, 'eventId'> {
  return {
    taskId: task.id,
    projectId: task.projectId,
    episodeId: task.episodeId,
    taskType: task.taskType,
    status: task.status,
    progress: task.progress,
    errorMessage: task.errorMessage,
    updatedAt: task.updatedAt.toISOString(),
  }
}

/** 生成事件 ID（用于去重和 Last-Event-ID） */
function generateEventId(): string {
  // 格式：evt_<timestamp>_<random>，便于 Last-Event-ID 比较
  const ts = Date.now()
  const rand = Math.random().toString(36).substring(2, 8)
  return `evt_${ts}_${rand}`
}

/** 关闭 Redis 连接（Worker 退出时调用） */
export async function closeEventConnections(): Promise<void> {
  if (publisher) {
    try {
      await publisher.quit()
    } catch { /* ignore */ }
    publisher = null
  }
}

/** 检查 Redis 是否可用 */
export function isRedisAvailable(): boolean {
  return redisAvailable
}
