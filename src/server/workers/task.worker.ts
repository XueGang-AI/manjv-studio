// ============================================
// Task Worker — 主循环（加固版）
// ============================================
//
// 独立进程运行，轮询数据库中的 pending 任务并执行。
// Worker 是独立进程，不经过 Next.js，不会自动加载 .env，
// 必须在所有 import 之前手动加载环境变量。

import 'dotenv/config'

import prisma from '@/lib/prisma'
import { handleStoryPackage } from './handlers/story-package.handler'
import { handleCharacters } from './handlers/characters.handler'
import { handleCharacterImages } from './handlers/character-images.handler'
import { handleFinalRender } from './handlers/final-render.handler'
import { handleStoryboard } from './handlers/storyboard.handler'
import { handleSceneReferences } from './handlers/scene-references.handler'
import { handleShotImages } from './handlers/shot-images.handler'
import { handleShotVideos } from './handlers/shot-videos.handler'
import { handleTestNoop, isTestTaskEnabled } from './handlers/test-noop.handler'
import { emitTaskEvent, taskToUpdateEvent, closeEventConnections } from './task-events'
import { startHeartbeat, stopHeartbeat } from './worker-heartbeat'

// ─── 生产环境 TEST_NOOP 遗留任务清理 ──────────────────────────────────

/**
 * 清理生产环境中的 TEST_NOOP 遗留任务
 *
 * 当 NODE_ENV=production 时，TEST_NOOP handler 不会注册，
 * 但数据库中可能存在遗留的 pending/retrying/running TEST_NOOP 任务，
 * 这些任务永远不会被领取，成为孤儿。
 *
 * Worker 启动时调用此函数，将这些任务标记为 failed。
 */
async function cleanupStaleTestNoopTasks(): Promise<number> {
  if (process.env.NODE_ENV !== 'production') return 0
  if (isTestTaskEnabled()) return 0

  try {
    const result = await prisma.generationTask.updateMany({
      where: {
        taskType: 'TEST_NOOP',
        status: { in: ['pending', 'retrying', 'running'] },
      },
      data: {
        status: 'failed',
        errorMessage: '[TEST_TASK_DISABLED] 测试任务在生产环境不可执行',
        finishedAt: new Date(),
      },
    })

    if (result.count > 0) {
      console.log(`[worker] Cleaned up ${result.count} stale TEST_NOOP tasks in production`)
    }

    return result.count
  } catch (err) {
    console.error('[worker] Failed to cleanup stale TEST_NOOP tasks:', (err as Error).message)
    return 0
  }
}

// ─── 配置 ──────────────────────────────────────────────────────────

const POLL_INTERVAL = Number(process.env.WORKER_POLL_INTERVAL) || 3000
const WORKER_ID = process.env.WORKER_ID || `worker-${process.pid}`
const GLOBAL_CONCURRENCY = Number(process.env.WORKER_CONCURRENCY) || 3

/** 各任务类型的并发上限和超时 */
interface TaskTypeConfig {
  handler: (taskId: string) => Promise<void>
  concurrency: number
  /** 任务类型超时 ms（用于崩溃恢复） */
  timeout: number
}

const TASK_TYPE_REGISTRY: Record<string, TaskTypeConfig> = {
  GENERATE_STORY_PACKAGE: {
    handler: handleStoryPackage,
    concurrency: 2,
    timeout: 10 * 60 * 1000, // 10 分钟
  },
  GENERATE_CHARACTERS: {
    handler: handleCharacters,
    concurrency: 2,
    timeout: 10 * 60 * 1000, // 10 分钟
  },
  GENERATE_CHARACTER_IMAGES: {
    handler: handleCharacterImages,
    concurrency: 1,
    timeout: 20 * 60 * 1000, // 20 分钟
  },
  GENERATE_STORYBOARD: {
    handler: handleStoryboard,
    concurrency: 2,
    timeout: 10 * 60 * 1000, // 10 分钟
  },
  GENERATE_SCENE_REFERENCES: {
    handler: handleSceneReferences,
    concurrency: 1,
    timeout: 15 * 60 * 1000, // 15 分钟
  },
  GENERATE_SHOT_IMAGES: {
    handler: handleShotImages,
    concurrency: 1,
    timeout: 15 * 60 * 1000, // 15 分钟
  },
  GENERATE_SHOT_VIDEOS: {
    handler: handleShotVideos,
    concurrency: 1,
    timeout: 35 * 60 * 1000, // 35 分钟（含远程轮询等待）
  },
  RENDER_FINAL_VIDEO: {
    handler: handleFinalRender,
    concurrency: 1, // FFmpeg 信号量已限制
    timeout: 10 * 60 * 1000, // 10 分钟
  },
  // 测试任务：仅在 ENABLE_TEST_TASKS=true 或 NODE_ENV=test 时注册
  ...(isTestTaskEnabled() ? {
    TEST_NOOP: {
      handler: handleTestNoop,
      concurrency: 5,
      timeout: 1 * 60 * 1000, // 1 分钟
    },
  } : {}),
}

/** 允许领取的任务类型（allowlist） */
const ALLOWED_TASK_TYPES = new Set(Object.keys(TASK_TYPE_REGISTRY))

// ─── 运行时状态 ────────────────────────────────────────────────────

let shuttingDown = false
/** 当前各任务类型的运行中数量 */
const runningByType: Record<string, number> = {}
/** 当前总运行数 */
let runningTotal = 0
/** 当前运行中的任务 ID 集合（用于防止重复领取） */
const runningTaskIds = new Set<string>()

function canAccept(taskType: string): boolean {
  if (shuttingDown) return false
  if (!ALLOWED_TASK_TYPES.has(taskType)) return false
  if (runningTotal >= GLOBAL_CONCURRENCY) return false
  const config = TASK_TYPE_REGISTRY[taskType]
  if (!config) return false
  const currentCount = runningByType[taskType] || 0
  return currentCount < config.concurrency
}

function markRunning(taskType: string, taskId: string) {
  runningByType[taskType] = (runningByType[taskType] || 0) + 1
  runningTotal++
  runningTaskIds.add(taskId)
}

function markDone(taskType: string, taskId: string) {
  runningByType[taskType] = Math.max(0, (runningByType[taskType] || 1) - 1)
  runningTotal = Math.max(0, runningTotal - 1)
  runningTaskIds.delete(taskId)
}

// ─── 原子领取 ──────────────────────────────────────────────────────

/**
 * 原子领取任务
 *
 * 使用条件更新：只更新 status in ('pending','retrying') 的行。
 * 检查 affected rows（Prisma updateMany 返回更新计数），
 * 如果记录不存在或状态已变，则领取失败。
 *
 * 同时接受 'retrying' 是因为 retryTask() 将手动重试任务置为 'retrying'，
 * 若不在此处领取，这些任务会卡在 'retrying' 成为孤儿。
 */
async function claimTask(taskId: string): Promise<boolean> {
  try {
    const updated = await prisma.generationTask.updateMany({
      where: { id: taskId, status: { in: ['pending', 'retrying'] } },
      data: { status: 'running', startedAt: new Date() },
    })
    return updated.count > 0
  } catch {
    return false
  }
}

// ─── 崩溃恢复 ──────────────────────────────────────────────────────

/**
 * 扫描并回收超时的 running 任务
 *
 * 规则：
 * - 只回收 registered 类型（allowlist 内）的任务
 * - 超时判断：updatedAt + type-specific timeout < now
 * - 如果没有 startedAt，使用 updatedAt 作为起点
 * - retryCount < maxRetries → 重置为 pending
 * - retryCount >= maxRetries → 标记为 failed
 */
async function recoverStaleTasks(): Promise<number> {
  let recovered = 0
  const now = new Date()

  for (const [taskType, config] of Object.entries(TASK_TYPE_REGISTRY)) {
    const timeoutMs = config.timeout
    const cutoffTime = new Date(now.getTime() - timeoutMs)

    // 查找超时的 running 任务
    const staleTasks = await prisma.generationTask.findMany({
      where: {
        taskType,
        status: { in: ['running', 'retrying'] },
        OR: [
          { startedAt: { lte: cutoffTime } },
          { startedAt: null, updatedAt: { lte: cutoffTime } },
        ],
      },
    })

    for (const task of staleTasks) {
      // 避免回收当前 Worker 仍在执行的任务
      if (runningTaskIds.has(task.id)) continue

      // retrying 任务（手动重试，retryTask 已 increment retryCount）从未被领取执行，
      // 超时是因为长时间未被领取（如 Worker 离线），不应再次 increment，否则会过早达到 maxRetries。
      // running 任务（已领取执行）超时表示执行失败，需要 increment。
      const isRetrying = task.status === 'retrying'
      const newRetryCount = isRetrying ? task.retryCount : task.retryCount + 1
      const exceededRetries = newRetryCount >= task.maxRetries

      if (exceededRetries) {
        // 超过重试上限，标记为 failed
        await prisma.generationTask.update({
          where: { id: task.id },
          data: {
            status: 'failed',
            retryCount: newRetryCount,
            errorMessage: `任务超时未完成（Worker 崩溃恢复），已达最大重试次数`,
            finishedAt: new Date(),
          },
        })

        // 恢复项目业务状态
        await recoverProjectStatus(task.projectId, task.taskType)

        console.log(`[worker] Recovered stale task ${task.id} → failed (max retries)`)
      } else {
        // 重置为 pending，等待重新领取
        await prisma.generationTask.update({
          where: { id: task.id },
          data: {
            status: 'pending',
            retryCount: newRetryCount,
            startedAt: null,
            errorMessage: null,
          },
        })

        console.log(`[worker] Recovered stale task ${task.id} → pending (retry ${newRetryCount}/${task.maxRetries})`)
      }

      recovered++
    }
  }

  return recovered
}

/**
 * 恢复项目业务状态
 *
 * 当任务失败后，需要将项目状态回退到合理的前置状态，
 * 否则用户可能卡在 GENERATING 状态。
 */
async function recoverProjectStatus(projectId: string, taskType: string): Promise<void> {
  const statusMap: Record<string, string> = {
    GENERATE_STORY_PACKAGE: 'DRAFT',
    GENERATE_CHARACTERS: 'STORY_CONFIRMED',
    GENERATE_CHARACTER_IMAGES: 'CHARACTER_CONFIRMED',
    GENERATE_STORYBOARD: 'CHARACTER_IMAGE_CONFIRMED',
    GENERATE_SCENE_REFERENCES: 'STORYBOARD_CONFIRMED',
    GENERATE_SHOT_IMAGES: 'STORYBOARD_CONFIRMED',
    GENERATE_SHOT_VIDEOS: 'SHOT_IMAGE_CONFIRMED',
    RENDER_FINAL_VIDEO: 'SHOT_VIDEO_CONFIRMED',
  }

  const targetStatus = statusMap[taskType]
  if (!targetStatus) return

  try {
    // 只在当前状态是生成中时才回退
    await prisma.project.updateMany({
      where: {
        id: projectId,
        status: { in: [
          'STORYBOARD_GENERATING',
          'STORY_GENERATING',
          'CHARACTER_GENERATING',
          'CHARACTER_IMAGE_GENERATING',
          'SHOT_IMAGE_GENERATING',
          'SHOT_VIDEO_GENERATING',
          'RENDERING',
        ] },
      },
      data: { status: targetStatus },
    })
  } catch {
    // 回退失败不影响任务标记
  }
}

// ─── 任务分发 ──────────────────────────────────────────────────────

async function dispatchTask(taskId: string, taskType: string): Promise<void> {
  const config = TASK_TYPE_REGISTRY[taskType]
  if (!config) {
    // 未知类型不应到达这里（allowlist 已过滤），但做防御
    console.warn(`[worker] Unknown task type: ${taskType}, marking as failed`)
    await prisma.generationTask.update({
      where: { id: taskId },
      data: { status: 'failed', errorMessage: `不支持的任务类型: ${taskType}`, finishedAt: new Date() },
    })
    return
  }

  markRunning(taskType, taskId)
  console.log(`[worker] Processing task ${taskId} (type=${taskType}, concurrency=${runningByType[taskType]}/${config.concurrency})`)

  try {
    await config.handler(taskId)
  } catch (error) {
    // handler 内部应已处理错误，此处为兜底
    console.error(`[worker] Unhandled error in task ${taskId}:`, error)

    try {
      await prisma.generationTask.update({
        where: { id: taskId },
        data: {
          status: 'failed',
          errorMessage: `Worker 内部错误: ${(error as Error).message}`.substring(0, 500),
          finishedAt: new Date(),
        },
      })
      // 恢复项目状态
      const task = await prisma.generationTask.findUnique({ where: { id: taskId } })
      if (task) {
        await recoverProjectStatus(task.projectId, task.taskType)
        // 发布失败事件
        emitTaskEvent('task.failed', taskToUpdateEvent(task))
      }
    } catch {
      console.error(`[worker] Failed to mark task ${taskId} as failed`)
    }
  } finally {
    markDone(taskType, taskId)
  }
}

// ─── 主循环 ────────────────────────────────────────────────────────

async function pollOnce(): Promise<number> {
  try {
    // 查询 allowlist 中的 pending 和 retrying 任务
    // retrying 任务由 retryTask() 创建（手动重试），需被领取才能执行
    const pendingTasks = await prisma.generationTask.findMany({
      where: {
        status: { in: ['pending', 'retrying'] },
        taskType: { in: [...ALLOWED_TASK_TYPES] },
      },
      orderBy: { createdAt: 'asc' },
      take: 10, // 多取一些，过滤并发限制后可能剩余
    })

    if (pendingTasks.length === 0) return 0

    let claimed = 0

    for (const task of pendingTasks) {
      if (shuttingDown) break
      if (!canAccept(task.taskType)) continue
      if (runningTaskIds.has(task.id)) continue

      // 原子领取
      const claimed_ok = await claimTask(task.id)
      if (!claimed_ok) {
        // 另一个 Worker 已领取
        continue
      }

      claimed++

      // 异步执行（不 await，实现并发）
      // 注意：task.running 事件由各 handler 内部在 startTask() 后发布，
      // 不在主循环重复发布，避免重复事件
      dispatchTask(task.id, task.taskType).catch(() => { /* handled inside */ })
    }

    return claimed
  } catch (error) {
    console.error('[worker] Poll error:', error)
    return 0
  }
}

// ─── 启动与退出 ────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log(`[worker] Task Worker starting...`)
  console.log(`[worker] Worker ID: ${WORKER_ID}`)
  console.log(`[worker] Poll interval: ${POLL_INTERVAL}ms`)
  console.log(`[worker] Global concurrency: ${GLOBAL_CONCURRENCY}`)
  console.log(`[worker] Registered task types: ${[...ALLOWED_TASK_TYPES].join(', ')}`)

  // 崩溃恢复
  const recoveredCount = await recoverStaleTasks()
  if (recoveredCount > 0) {
    console.log(`[worker] Recovered ${recoveredCount} stale tasks`)
  }

  // 生产环境 TEST_NOOP 遗留任务清理
  const cleanedCount = await cleanupStaleTestNoopTasks()
  if (cleanedCount > 0) {
    console.log(`[worker] Cleaned up ${cleanedCount} stale TEST_NOOP tasks`)
  }

  // 启动 Worker heartbeat
  startHeartbeat(WORKER_ID, () => runningTotal)
  console.log(`[worker] Heartbeat started (interval=10s, TTL=30s)`)

  // 优雅退出
  process.on('SIGINT', () => {
    console.log('[worker] SIGINT received, shutting down...')
    shuttingDown = true
  })
  process.on('SIGTERM', () => {
    console.log('[worker] SIGTERM received, shutting down...')
    shuttingDown = true
  })

  // 主循环
  const RECOVERY_INTERVAL_MS = 30_000 // 每 30 秒执行一次崩溃恢复
  let lastRecoveryAt = Date.now()
  while (!shuttingDown) {
    const claimed = await pollOnce()

    if (claimed === 0 && runningTotal === 0) {
      // 无任务且无运行中的任务，等待下次轮询
      await sleep(POLL_INTERVAL)
    } else if (claimed === 0) {
      // 有运行中的任务但无新领取，短间隔后继续
      await sleep(1000)
    } else {
      // 有新任务，短暂间隔后继续
      await sleep(500)
    }

    // 定期崩溃恢复：扫描超时的 running/retrying 任务。
    // 处理 Worker 未崩溃但 handler 挂起（如远端 API 无响应）导致的 stuck running 任务。
    if (Date.now() - lastRecoveryAt >= RECOVERY_INTERVAL_MS) {
      lastRecoveryAt = Date.now()
      try {
        const recovered = await recoverStaleTasks()
        if (recovered > 0) {
          console.log(`[worker] Periodic recovery: ${recovered} stale task(s)`)
        }
      } catch (err) {
        console.error('[worker] Periodic recovery error:', (err as Error).message)
      }
    }
  }

  // 等待运行中的任务完成（最多 30 秒）
  console.log(`[worker] Waiting for ${runningTotal} running tasks to complete...`)
  const shutdownStart = Date.now()
  while (runningTotal > 0 && Date.now() - shutdownStart < 30000) {
    await sleep(1000)
  }

  if (runningTotal > 0) {
    console.log(`[worker] ${runningTotal} tasks still running after 30s, forcing shutdown`)
  }

  // 关闭连接
  await stopHeartbeat(WORKER_ID)
  await closeEventConnections()
  await prisma.$disconnect()

  console.log('[worker] Shut down gracefully')
  process.exit(0)
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

// ─── 启动 ──────────────────────────────────────────────────────────

main().catch((error) => {
  console.error('[worker] Fatal error:', error)
  process.exit(1)
})
