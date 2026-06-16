// ============================================
// 任务事件系统 — Redis Pub/Sub + 共享 Subscriber + 进程内回退
// ============================================
//
// 架构：
//   Worker 进程
//     → 更新 GenerationTask（DB 是 Source of Truth）
//     → emitTaskEvent()
//     → Redis PUBLISH（跨进程低延迟通知）
//     → 进程内 EventEmitter（同进程直推）
//
//   Next.js 进程（SSE Route）
//     → 共享 Redis Subscriber（单连接，多频道）
//     → 进程内 EventEmitter（同进程直推）
//     → SSE 推送到浏览器
//
//   Redis 不可用时：
//     → 仅进程内 EventEmitter（不跨进程）
//     → SSE 依赖 DB 增量轮询降级
//
// 连接管理：
//   - Publisher：1 个共享连接（Worker + API 共用）
//   - Subscriber：1 个共享连接，使用 psubscribe 模式
//   - 每个 SSE 客户端只注册进程内 listener，不创建 Redis 连接
//   - 客户端断开时只移除 listener，不断开 Redis
//
// 安全约束：
//   事件只包含必要字段，不含 input/output/FFmpeg stderr/密钥/路径

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
TASK_EVENT_BUS.setMaxListeners(200) // SSE 可能很多客户端

// ─── Redis Publisher（共享单连接） ─────────────────────────────────

let publisher: import('ioredis').Redis | null = null
let redisAvailable = false
let publisherInitPromise: Promise<import('ioredis').Redis | null> | null = null

async function getPublisher(): Promise<import('ioredis').Redis | null> {
  if (publisher) return publisher
  if (!process.env.REDIS_URL) return null
  // 防止并发初始化
  if (publisherInitPromise) return publisherInitPromise

  publisherInitPromise = initPublisher()
  return publisherInitPromise
}

async function initPublisher(): Promise<import('ioredis').Redis | null> {
  try {
    const Redis = (await import('ioredis')).default
    const client = new Redis(process.env.REDIS_URL!, {
      maxRetriesPerRequest: 1,
      retryStrategy(times) {
        if (times > 5) return null
        return Math.min(times * 500, 3000)
      },
      lazyConnect: true,
      connectTimeout: 3000,
    })

    client.on('error', (err) => {
      // 连接阶段静默，运行时错误限流日志
      if (redisAvailable) {
        console.error('[task-events] Redis publisher error:', err.message?.substring(0, 100))
      }
      redisAvailable = false
    })

    client.on('ready', () => {
      redisAvailable = true
    })

    await client.connect()
    publisher = client
    redisAvailable = true
    return client
  } catch (err) {
    console.warn('[task-events] Redis not available, falling back to in-process events:', (err as Error).message)
    publisher = null
    redisAvailable = false
    publisherInitPromise = null
    return null
  }
}

// ─── Redis Subscriber（共享单连接 + 频道管理） ─────────────────────

let subscriber: import('ioredis').Redis | null = null
let subscriberInitPromise: Promise<import('ioredis').Redis | null> | null = null
/** 当前已订阅的项目频道集合 */
const subscribedProjects = new Set<string>()
let globalSubscribed = false

/**
 * 获取或初始化共享 Subscriber
 *
 * 每个进程只创建一个 Redis Subscriber 连接，
 * 所有 SSE 客户端共享此连接，只注册进程内 listener。
 */
async function getSubscriber(): Promise<import('ioredis').Redis | null> {
  if (subscriber) return subscriber
  if (!process.env.REDIS_URL) return null
  if (subscriberInitPromise) return subscriberInitPromise

  subscriberInitPromise = initSubscriber()
  return subscriberInitPromise
}

async function initSubscriber(): Promise<import('ioredis').Redis | null> {
  try {
    const Redis = (await import('ioredis')).default
    const client = new Redis(process.env.REDIS_URL!, {
      maxRetriesPerRequest: null, // 订阅模式不设超时
      retryStrategy(times) {
        if (times > 10) return null
        return Math.min(times * 500, 5000)
      },
      lazyConnect: true,
      connectTimeout: 3000,
    })

    // 收到 Redis 消息后，转发到进程内 EventEmitter
    client.on('message', (channel: string, message: string) => {
      try {
        const event = JSON.parse(message) as { type: TaskEventType; payload: TaskUpdateEvent }
        const payload = event.payload

        // 转发到进程内总线（SSE 客户端监听这里）
        TASK_EVENT_BUS.emit('redis_event', event)

        // 也按 projectId 转发
        if (payload.projectId) {
          TASK_EVENT_BUS.emit(`redis_event:${payload.projectId}`, event)
        }
      } catch { /* ignore parse errors */ }
    })

    client.on('error', () => {
      // 订阅错误静默，依赖进程内 + DB fallback
    })

    await client.connect()
    subscriber = client
    return client
  } catch {
    subscriber = null
    subscriberInitPromise = null
    return null
  }
}

/** 确保项目频道已订阅 */
async function ensureProjectSubscribed(projectId: string): Promise<void> {
  if (subscribedProjects.has(projectId)) return
  const sub = await getSubscriber()
  if (!sub) return

  try {
    await sub.subscribe(projectChannel(projectId))
    subscribedProjects.add(projectId)
  } catch {
    // 订阅失败不阻塞
  }
}

/** 确保全局频道已订阅 */
async function ensureGlobalSubscribed(): Promise<void> {
  if (globalSubscribed) return
  const sub = await getSubscriber()
  if (!sub) return

  try {
    await sub.subscribe(GLOBAL_CHANNEL)
    globalSubscribed = true
  } catch {
    // 订阅失败不阻塞
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

  // 进程内直推（标记来源为 local）
  const event = { type, payload: fullPayload, source: 'local' as const }
  TASK_EVENT_BUS.emit('task_update', event)
  TASK_EVENT_BUS.emit(`task_update:${payload.projectId}`, event)

  // Redis 跨进程发布
  try {
    const pub = await getPublisher()
    if (pub && redisAvailable) {
      const message = JSON.stringify({ type, payload: fullPayload, source: 'redis' })
      await Promise.all([
        pub.publish(projectChannel(payload.projectId), message),
        pub.publish(GLOBAL_CHANNEL, message),
      ])
    }
  } catch {
    redisAvailable = false
  }
}

// ─── SSE 侧订阅 ───────────────────────────────────────────────────

export interface TaskEventSubscription {
  unsubscribe: () => void
}

/**
 * SSE 端点：订阅项目任务事件
 *
 * 使用共享 Redis Subscriber + 进程内 listener 模式：
 * - 不为每个 SSE 客户端创建 Redis 连接
 * - 每个客户端只注册进程内 EventEmitter listener
 * - 断开时只移除 listener
 *
 * 事件来源标记：
 * - source=local：同进程直推（Worker 与 SSE 同进程）
 * - source=redis：跨进程 Redis 推送
 * - source=db-fallback：DB 增量轮询
 */
export async function subscribeToProjectEvents(
  projectId: string,
  callback: (event: { type: TaskEventType; payload: TaskUpdateEvent; source: string }) => void,
): Promise<TaskEventSubscription> {
  const cleanups: Array<() => void> = []

  // 1. 进程内：同进程 Worker 直推
  const localHandler = (event: { type: TaskEventType; payload: TaskUpdateEvent; source: string }) => {
    callback({ ...event, source: event.source || 'local' })
  }
  TASK_EVENT_BUS.on(`task_update:${projectId}`, localHandler)
  cleanups.push(() => TASK_EVENT_BUS.off(`task_update:${projectId}`, localHandler))

  // 2. 进程内：Redis Subscriber 转发（跨进程事件）
  const redisHandler = (event: { type: TaskEventType; payload: TaskUpdateEvent; source: string }) => {
    callback({ ...event, source: 'redis' })
  }
  TASK_EVENT_BUS.on(`redis_event:${projectId}`, redisHandler)
  cleanups.push(() => TASK_EVENT_BUS.off(`redis_event:${projectId}`, redisHandler))

  // 3. 确保共享 Subscriber 已订阅该项目频道
  await ensureProjectSubscribed(projectId)
  await ensureGlobalSubscribed()

  // 全局 Redis 事件也转发（避免遗漏）
  const globalRedisHandler = (event: { type: TaskEventType; payload: TaskUpdateEvent; source: string }) => {
    if (event.payload.projectId === projectId) {
      callback({ ...event, source: 'redis' })
    }
  }
  TASK_EVENT_BUS.on('redis_event', globalRedisHandler)
  cleanups.push(() => TASK_EVENT_BUS.off('redis_event', globalRedisHandler))

  return {
    unsubscribe: () => {
      for (const cleanup of cleanups) {
        try { cleanup() } catch { /* ignore */ }
      }
    },
  }
}

/**
 * SSE 端点：订阅全局任务事件
 */
export async function subscribeToAllEvents(
  callback: (event: { type: TaskEventType; payload: TaskUpdateEvent; source: string }) => void,
): Promise<TaskEventSubscription> {
  const cleanups: Array<() => void> = []

  // 进程内：同进程直推
  const localHandler = (event: { type: TaskEventType; payload: TaskUpdateEvent; source: string }) => {
    callback({ ...event, source: event.source || 'local' })
  }
  TASK_EVENT_BUS.on('task_update', localHandler)
  cleanups.push(() => TASK_EVENT_BUS.off('task_update', localHandler))

  // 进程内：Redis 转发
  const redisHandler = (event: { type: TaskEventType; payload: TaskUpdateEvent; source: string }) => {
    callback({ ...event, source: 'redis' })
  }
  TASK_EVENT_BUS.on('redis_event', redisHandler)
  cleanups.push(() => TASK_EVENT_BUS.off('redis_event', redisHandler))

  await ensureGlobalSubscribed()

  return {
    unsubscribe: () => {
      for (const cleanup of cleanups) {
        try { cleanup() } catch { /* ignore */ }
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

/** 从 GenerationTask 记录构造 TaskUpdateEvent（不含 eventId） */
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

/** 生成事件 ID */
function generateEventId(): string {
  const ts = Date.now()
  const rand = Math.random().toString(36).substring(2, 8)
  return `evt_${ts}_${rand}`
}

/** 关闭 Redis 连接（Worker/应用 退出时调用） */
export async function closeEventConnections(): Promise<void> {
  const promises: Array<Promise<void>> = []

  if (publisher) {
    promises.push(publisher.quit().then(() => { publisher = null }).catch(() => { publisher = null }))
  }
  if (subscriber) {
    promises.push(subscriber.quit().then(() => { subscriber = null }).catch(() => { subscriber = null }))
  }

  await Promise.all(promises)
  subscribedProjects.clear()
  globalSubscribed = false
  redisAvailable = false
  publisherInitPromise = null
  subscriberInitPromise = null
}

/** 检查 Redis 是否可用 */
export function isRedisAvailable(): boolean {
  return redisAvailable
}
