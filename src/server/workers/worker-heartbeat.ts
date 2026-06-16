// ============================================
// Worker Heartbeat — 进程存活心跳
// ============================================
//
// Worker 每 10 秒写 Redis key `worker:heartbeat:<workerId>`，
// TTL 30 秒。Health API 读取 heartbeat 判断 Worker 进程存活。
//
// 安全约束：
//   - 不包含密钥、任务 payload、服务器路径
//   - Redis 不可用时不能导致 Worker 崩溃
//   - Worker 优雅退出时删除 heartbeat

// task-events 的 isRedisAvailable 可用于检查 Publisher 侧的 Redis 状态，
// 但 heartbeat 使用独立的 Redis 连接，不依赖 task-events 的连接状态。

/** Heartbeat Redis key 前缀 */
const HEARTBEAT_KEY_PREFIX = 'worker:heartbeat:'
/** Heartbeat 写入间隔 ms */
const HEARTBEAT_INTERVAL = 10_000
/** Heartbeat TTL ms（必须是 interval 的 2-3 倍，容忍 2-3 次写入失败） */
const HEARTBEAT_TTL = 30_000

let heartbeatTimer: ReturnType<typeof setInterval> | null = null
let redisClient: import('ioredis').Redis | null = null
let redisInitPromise: Promise<import('ioredis').Redis | null> | null = null

export interface WorkerHeartbeatData {
  /** Worker 标识 */
  workerId: string
  /** 进程 PID */
  pid: number
  /** 当前状态 */
  status: 'running' | 'shutting_down'
  /** 当前活跃任务数 */
  activeTasks: number
  /** 心跳更新时间 ISO */
  updatedAt: string
}

/**
 * 获取或创建 heartbeat 专用的 Redis 连接
 *
 * 与 Publisher/Subscriber 分离，避免 subscribe 模式冲突。
 * Redis 不可用时返回 null，不影响 Worker 运行。
 */
async function getHeartbeatRedis(): Promise<import('ioredis').Redis | null> {
  if (redisClient && redisClient.status === 'ready') return redisClient
  if (!process.env.REDIS_URL) return null

  // 如果连接已断开且不再重连（end 状态），重置以允许重新创建
  if (redisClient && redisClient.status === 'end') {
    redisClient = null
    redisInitPromise = null
  }

  if (redisInitPromise) return redisInitPromise

  redisInitPromise = initHeartbeatRedis()
  return redisInitPromise
}

async function initHeartbeatRedis(): Promise<import('ioredis').Redis | null> {
  try {
    const Redis = (await import('ioredis')).default
    const client = new Redis(process.env.REDIS_URL!, {
      maxRetriesPerRequest: 1,
      retryStrategy(times) {
        // 允许无限重试，确保 Redis 恢复后 heartbeat 能自动恢复
        return Math.min(times * 1000, 5000)
      },
      lazyConnect: true,
      connectTimeout: 2000,
    })

    client.on('error', () => {
      // 静默，heartbeat 写入失败不影响 Worker
    })

    client.on('close', () => {
      // 连接断开，下次写入时 ioredis 会自动重连
    })

    client.on('ready', () => {
      // 重连成功，heartbeat 写入会自动恢复
    })

    await client.connect()
    redisClient = client
    return client
  } catch {
    redisClient = null
    redisInitPromise = null
    return null
  }
}

/**
 * 写入 Worker heartbeat 到 Redis
 */
async function writeHeartbeat(workerId: string, status: 'running' | 'shutting_down', activeTasks: number): Promise<void> {
  try {
    const redis = await getHeartbeatRedis()
    if (!redis) return

    const data: WorkerHeartbeatData = {
      workerId,
      pid: process.pid,
      status,
      activeTasks,
      updatedAt: new Date().toISOString(),
    }

    const key = `${HEARTBEAT_KEY_PREFIX}${workerId}`
    await redis.set(key, JSON.stringify(data), 'PX', HEARTBEAT_TTL)
  } catch {
    // 写入失败不影响 Worker 运行
  }
}

/**
 * 删除 Worker heartbeat
 */
async function deleteHeartbeat(workerId: string): Promise<void> {
  try {
    const redis = await getHeartbeatRedis()
    if (!redis) return
    await redis.del(`${HEARTBEAT_KEY_PREFIX}${workerId}`)
  } catch {
    // 删除失败不影响
  }
}

/**
 * 启动 Worker heartbeat 定时器
 *
 * @param workerId Worker 标识
 * @param getActiveTasks 获取当前活跃任务数的函数
 */
export function startHeartbeat(workerId: string, getActiveTasks: () => number): void {
  // 立即写一次
  writeHeartbeat(workerId, 'running', getActiveTasks())

  heartbeatTimer = setInterval(() => {
    writeHeartbeat(workerId, 'running', getActiveTasks())
  }, HEARTBEAT_INTERVAL)

  // 确保 timer 不阻止进程退出
  if (heartbeatTimer.unref) {
    heartbeatTimer.unref()
  }
}

/**
 * 停止 Worker heartbeat 并清理
 *
 * 写入 shutting_down 状态后删除 key，关闭 Redis 连接。
 */
export async function stopHeartbeat(workerId: string): Promise<void> {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer)
    heartbeatTimer = null
  }

  // 写入 shutting_down 状态
  await writeHeartbeat(workerId, 'shutting_down', 0)

  // 删除 heartbeat key
  await deleteHeartbeat(workerId)

  // 关闭专用 Redis 连接
  if (redisClient) {
    try {
      await redisClient.quit()
    } catch {
      // 忽略
    }
    redisClient = null
    redisInitPromise = null
  }
}

/**
 * 读取指定 Worker 的 heartbeat（供 Health API 使用）
 */
export async function getWorkerHeartbeat(workerId: string): Promise<WorkerHeartbeatData | null> {
  try {
    const redis = await getHeartbeatRedis()
    if (!redis) return null

    const data = await redis.get(`${HEARTBEAT_KEY_PREFIX}${workerId}`)
    if (!data) return null

    return JSON.parse(data) as WorkerHeartbeatData
  } catch {
    return null
  }
}

/**
 * 读取所有活跃 Worker 的 heartbeat
 */
export async function getAllWorkerHeartbeats(): Promise<WorkerHeartbeatData[]> {
  try {
    const redis = await getHeartbeatRedis()
    if (!redis) return []

    const keys = await redis.keys(`${HEARTBEAT_KEY_PREFIX}*`)
    if (keys.length === 0) return []

    const values = await redis.mget(...keys)
    return values
      .filter((v): v is string => v !== null)
      .map(v => {
        try { return JSON.parse(v) as WorkerHeartbeatData }
        catch { return null }
      })
      .filter((v): v is WorkerHeartbeatData => v !== null)
  } catch {
    return []
  }
}

/**
 * Health API 侧：获取 Worker 存活状态（不需要 Worker 进程内部调用）
 *
 * 此函数使用独立的 Redis 连接（从 Health API 进程调用），
 * 不复用 Worker 的 heartbeat Redis 连接。
 */
export async function checkWorkerHealth(): Promise<{
  status: 'healthy' | 'degraded' | 'unknown'
  workers: WorkerHeartbeatData[]
  note?: string
}> {
  try {
    // Health API 可能在 Next.js 进程中调用，使用独立的 Redis 连接
    const Redis = (await import('ioredis')).default
    if (!process.env.REDIS_URL) {
      return { status: 'unknown', workers: [], note: 'REDIS_URL not set, cannot check worker heartbeat' }
    }

    const client = new Redis(process.env.REDIS_URL, {
      maxRetriesPerRequest: 1,
      lazyConnect: true,
      connectTimeout: 2000,
    })

    try {
      await client.connect()
      const keys = await client.keys(`${HEARTBEAT_KEY_PREFIX}*`)

      if (keys.length === 0) {
        return { status: 'unknown', workers: [], note: 'No worker heartbeats found' }
      }

      const values = await client.mget(...keys)
      const workers = values
        .filter((v): v is string => v !== null)
        .map(v => {
          try { return JSON.parse(v) as WorkerHeartbeatData }
          catch { return null }
        })
        .filter((v): v is WorkerHeartbeatData => v !== null)

      const hasRunningWorker = workers.some(w => w.status === 'running')
      return {
        status: hasRunningWorker ? 'healthy' : 'degraded',
        workers,
      }
    } finally {
      await client.quit()
    }
  } catch {
    return { status: 'unknown', workers: [], note: 'Cannot connect to Redis for worker heartbeat check' }
  }
}
