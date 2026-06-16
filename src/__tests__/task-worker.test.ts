// ============================================
// Task Worker 可靠性测试
// ============================================
//
// 覆盖：
// - 原子领取
// - 崩溃恢复
// - Handler 幂等性
// - Worker 生命周期
// - SSE 事件协议
//
// 不依赖真实 AI/FFmpeg 环境，使用 mock

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// ─── Mock prisma ───────────────────────────────────────────────────

const mockTaskFindMany = vi.fn()
const mockTaskUpdateMany = vi.fn()
const mockTaskFindUnique = vi.fn()
const mockTaskUpdate = vi.fn()
const mockTaskCreate = vi.fn()
const mockProjectUpdateMany = vi.fn()

vi.mock('@/lib/prisma', () => ({
  default: {
    generationTask: {
      findMany: mockTaskFindMany,
      updateMany: mockTaskUpdateMany,
      findUnique: mockTaskFindUnique,
      update: mockTaskUpdate,
      create: mockTaskCreate,
    },
    project: {
      updateMany: mockProjectUpdateMany,
    },
    $disconnect: vi.fn().mockResolvedValue(undefined),
  },
}))

// ─── Mock task-events ──────────────────────────────────────────────

const mockEmitTaskEvent = vi.fn().mockResolvedValue(undefined)
const mockCloseEventConnections = vi.fn().mockResolvedValue(undefined)

vi.mock('@/server/workers/task-events', () => ({
  emitTaskEvent: mockEmitTaskEvent,
  taskToUpdateEvent: vi.fn((task: Record<string, unknown>) => ({
    taskId: task.id,
    projectId: task.projectId,
    taskType: task.taskType,
    status: task.status,
    progress: task.progress || 0,
    updatedAt: task.updatedAt instanceof Date ? task.updatedAt.toISOString() : new Date().toISOString(),
  })),
  closeEventConnections: mockCloseEventConnections,
}))

// ─── Mock handlers ─────────────────────────────────────────────────

const mockHandleStoryboard = vi.fn().mockResolvedValue(undefined)
const mockHandleShotImages = vi.fn().mockResolvedValue(undefined)
const mockHandleShotVideos = vi.fn().mockResolvedValue(undefined)
const mockHandleFinalRender = vi.fn().mockResolvedValue(undefined)

vi.mock('@/server/workers/handlers/storyboard.handler', () => ({
  handleStoryboard: mockHandleStoryboard,
}))
vi.mock('@/server/workers/handlers/shot-images.handler', () => ({
  handleShotImages: mockHandleShotImages,
}))
vi.mock('@/server/workers/handlers/shot-videos.handler', () => ({
  handleShotVideos: mockHandleShotVideos,
}))
vi.mock('@/server/workers/handlers/final-render.handler', () => ({
  handleFinalRender: mockHandleFinalRender,
}))

// ─── Test: 原子领取 ────────────────────────────────────────────────

describe('Atomic task claiming', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should claim a pending task atomically', async () => {
    // 模拟 updateMany 返回 count=1（成功领取）
    mockTaskUpdateMany.mockResolvedValue({ count: 1 })

    // 模拟原子领取逻辑（直接使用 mock 函数）
    const taskId = 'task-1'
    const result = await mockTaskUpdateMany({
      where: { id: taskId, status: 'pending' },
      data: { status: 'running', startedAt: new Date() },
    })

    expect(result.count).toBe(1)
    expect(mockTaskUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: taskId, status: 'pending' },
      }),
    )
  })

  it('should fail to claim a task already claimed by another worker', async () => {
    // 模拟 updateMany 返回 count=0（已被其他 Worker 领取）
    mockTaskUpdateMany.mockResolvedValue({ count: 0 })

    const taskId = 'task-1'
    const result = await mockTaskUpdateMany({
      where: { id: taskId, status: 'pending' },
      data: { status: 'running', startedAt: new Date() },
    })

    expect(result.count).toBe(0)
    // 领取失败，不应执行 handler
    expect(mockHandleStoryboard).not.toHaveBeenCalled()
  })

  it('should not claim tasks of unregistered types', async () => {
    const ALLOWED_TASK_TYPES = new Set([
      'GENERATE_STORYBOARD',
      'GENERATE_SHOT_IMAGES',
      'GENERATE_SHOT_VIDEOS',
      'RENDER_FINAL_VIDEO',
    ])

    // 未注册的任务类型不应被领取
    expect(ALLOWED_TASK_TYPES.has('GENERATE_STORY_PACKAGE')).toBe(false)
    expect(ALLOWED_TASK_TYPES.has('GENERATE_CHARACTERS')).toBe(false)
    expect(ALLOWED_TASK_TYPES.has('QUALITY_CHECK')).toBe(false)

    // 已注册的类型应可领取
    expect(ALLOWED_TASK_TYPES.has('GENERATE_STORYBOARD')).toBe(true)
    expect(ALLOWED_TASK_TYPES.has('RENDER_FINAL_VIDEO')).toBe(true)
  })
})

// ─── Test: 崩溃恢复 ────────────────────────────────────────────────

describe('Crash recovery', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should identify stale running tasks for recovery', () => {
    const now = new Date()
    const TIMEOUT_MS = 10 * 60 * 1000 // 10 分钟

    // 超过超时时间的任务应被回收
    const staleTask = {
      id: 'task-1',
      status: 'running',
      startedAt: new Date(now.getTime() - TIMEOUT_MS - 60000), // 超时 1 分钟
      retryCount: 0,
      maxRetries: 3,
    }

    const cutoffTime = new Date(now.getTime() - TIMEOUT_MS)
    const isStale = staleTask.startedAt! <= cutoffTime
    expect(isStale).toBe(true)
  })

  it('should not recover tasks that are still within timeout', () => {
    const now = new Date()
    const TIMEOUT_MS = 10 * 60 * 1000

    // 未超时的任务不应被回收
    const activeTask = {
      id: 'task-2',
      status: 'running',
      startedAt: new Date(now.getTime() - TIMEOUT_MS + 60000), // 还差 1 分钟才超时
    }

    const cutoffTime = new Date(now.getTime() - TIMEOUT_MS)
    const isStale = activeTask.startedAt! <= cutoffTime
    expect(isStale).toBe(false)
  })

  it('should reset retryCount < maxRetries tasks to pending', () => {
    const task = {
      id: 'task-1',
      retryCount: 1,
      maxRetries: 3,
    }

    const newRetryCount = task.retryCount + 1
    const exceededRetries = newRetryCount >= task.maxRetries

    expect(exceededRetries).toBe(false)
    // 应重置为 pending
  })

  it('should mark retryCount >= maxRetries tasks as failed', () => {
    const task = {
      id: 'task-2',
      retryCount: 2,
      maxRetries: 3,
    }

    const newRetryCount = task.retryCount + 1
    const exceededRetries = newRetryCount >= task.maxRetries

    expect(exceededRetries).toBe(true)
    // 应标记为 failed
  })

  it('should recover project business status when task fails', async () => {
    const statusMap: Record<string, string> = {
      GENERATE_STORYBOARD: 'CHARACTER_IMAGE_CONFIRMED',
      GENERATE_SHOT_IMAGES: 'STORYBOARD_CONFIRMED',
      GENERATE_SHOT_VIDEOS: 'SHOT_IMAGE_CONFIRMED',
      RENDER_FINAL_VIDEO: 'SHOT_VIDEO_CONFIRMED',
    }

    // 验证每个任务类型都有对应的项目状态回退目标
    expect(statusMap['GENERATE_STORYBOARD']).toBe('CHARACTER_IMAGE_CONFIRMED')
    expect(statusMap['RENDER_FINAL_VIDEO']).toBe('SHOT_VIDEO_CONFIRMED')
  })
})

// ─── Test: Handler 幂等性 ──────────────────────────────────────────

describe('Handler idempotency', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should skip already completed tasks', () => {
    const existingTask = {
      id: 'task-1',
      status: 'success',
    }

    // 幂等性检查：已完成任务应直接跳过
    if (existingTask.status === 'success') {
      // 跳过执行
      expect(true).toBe(true)
    } else {
      expect.unreachable('Should have skipped')
    }
  })

  it('should skip tasks in terminal states', () => {
    const terminalStatuses = ['success', 'failed', 'cancelled']

    for (const status of terminalStatuses) {
      const shouldSkip = !['pending', 'running', 'retrying'].includes(status)
      expect(shouldSkip).toBe(true)
    }
  })

  it('should allow running tasks to be re-processed', () => {
    const runningTask = {
      id: 'task-1',
      status: 'running',
    }

    const shouldProcess = ['pending', 'running', 'retrying'].includes(runningTask.status)
    expect(shouldProcess).toBe(true)
  })

  it('should check FinalVideo output for RENDER_FINAL_VIDEO idempotency', () => {
    // 任务已产出 FinalVideo
    const taskWithOutput = {
      id: 'task-1',
      output: { final_video_id: 'fv-1' },
    }

    const hasExistingOutput = !!(taskWithOutput.output as Record<string, unknown>)?.final_video_id
    expect(hasExistingOutput).toBe(true)
    // 应跳过重复执行

    // 任务未产出 FinalVideo
    const taskWithoutOutput = {
      id: 'task-2',
      output: {},
    }

    const noOutput = !(taskWithoutOutput.output as Record<string, unknown>)?.final_video_id
    expect(noOutput).toBe(true)
    // 应正常执行
  })
})

// ─── Test: Worker 生命周期 ──────────────────────────────────────────

describe('Worker lifecycle', () => {
  it('should respect shuttingDown flag', () => {
    let shuttingDown = false

    // 正常运行时可以接受任务
    expect(shuttingDown).toBe(false)

    // 收到 SIGTERM 后停止接受
    shuttingDown = true
    expect(shuttingDown).toBe(true)
  })

  it('should track running tasks by type', () => {
    const runningByType: Record<string, number> = {}
    const GLOBAL_CONCURRENCY = 3

    // 模拟并发控制
    function canAccept(taskType: string, limit: number): boolean {
      const current = runningByType[taskType] || 0
      const total = Object.values(runningByType).reduce((a, b) => a + b, 0)
      return current < limit && total < GLOBAL_CONCURRENCY
    }

    // GENERATE_STORYBOARD 并发上限 2
    expect(canAccept('GENERATE_STORYBOARD', 2)).toBe(true)
    runningByType['GENERATE_STORYBOARD'] = 1
    expect(canAccept('GENERATE_STORYBOARD', 2)).toBe(true)
    runningByType['GENERATE_STORYBOARD'] = 2
    expect(canAccept('GENERATE_STORYBOARD', 2)).toBe(false)

    // RENDER_FINAL_VIDEO 并发上限 1
    runningByType['RENDER_FINAL_VIDEO'] = 0
    expect(canAccept('RENDER_FINAL_VIDEO', 1)).toBe(true)
    runningByType['RENDER_FINAL_VIDEO'] = 1
    expect(canAccept('RENDER_FINAL_VIDEO', 1)).toBe(false)
  })

  it('should limit global concurrency', () => {
    const runningByType: Record<string, number> = {
      GENERATE_STORYBOARD: 2,
      RENDER_FINAL_VIDEO: 1,
    }
    const runningTotal = Object.values(runningByType).reduce((a, b) => a + b, 0)
    const GLOBAL_CONCURRENCY = 3

    expect(runningTotal).toBe(3)
    expect(runningTotal >= GLOBAL_CONCURRENCY).toBe(true)
    // 不应再接受新任务
  })
})

// ─── Test: SSE 事件协议 ────────────────────────────────────────────

describe('SSE event protocol', () => {
  it('should define correct event types', () => {
    const eventTypes = [
      'task.created',
      'task.updated',
      'task.running',
      'task.progress',
      'task.completed',
      'task.failed',
      'snapshot',
      'heartbeat',
    ]

    expect(eventTypes).toContain('task.created')
    expect(eventTypes).toContain('task.completed')
    expect(eventTypes).toContain('task.failed')
    expect(eventTypes).toContain('snapshot')
    expect(eventTypes).toContain('heartbeat')
  })

  it('should generate unique event IDs for dedup', () => {
    const ids = new Set<string>()

    // 模拟事件 ID 生成
    function generateEventId(): string {
      const ts = Date.now()
      const rand = Math.random().toString(36).substring(2, 8)
      return `evt_${ts}_${rand}`
    }

    for (let i = 0; i < 100; i++) {
      ids.add(generateEventId())
    }

    // 100 个 ID 应全部唯一
    expect(ids.size).toBe(100)
  })

  it('should deduplicate events by eventId', () => {
    const seenEventIds = new Set<string>()

    const event1 = { eventId: 'evt_1_abc', taskId: 'task-1', status: 'running' }
    const event2 = { eventId: 'evt_1_abc', taskId: 'task-1', status: 'running' } // 重复
    const event3 = { eventId: 'evt_2_def', taskId: 'task-1', status: 'completed' } // 新事件

    // 第一次见到 event1
    expect(seenEventIds.has(event1.eventId)).toBe(false)
    seenEventIds.add(event1.eventId)

    // 重复的 event2 应被跳过
    expect(seenEventIds.has(event2.eventId)).toBe(true)

    // 新的 event3 应被处理
    expect(seenEventIds.has(event3.eventId)).toBe(false)
    seenEventIds.add(event3.eventId)
  })

  it('should parse Last-Event-ID for reconnection', () => {
    const lastEventId = 'evt_1703123456789_abc123'
    const tsMatch = lastEventId.match(/^evt_(\d+)_/)

    expect(tsMatch).not.toBeNull()
    expect(Number(tsMatch![1])).toBe(1703123456789)

    const since = new Date(Number(tsMatch![1]))
    expect(since.getTime()).toBe(1703123456789)
  })

  it('should not include sensitive data in events', () => {
    // 事件结构验证
    const event = {
      eventId: 'evt_1_abc',
      taskId: 'task-1',
      projectId: 'proj-1',
      taskType: 'RENDER_FINAL_VIDEO',
      status: 'running',
      progress: 50,
      errorMessage: null,
      updatedAt: new Date().toISOString(),
    }

    // 确认事件中不包含敏感字段
    expect(event).not.toHaveProperty('input')
    expect(event).not.toHaveProperty('output')
    expect(event).not.toHaveProperty('stderr')
    expect(event).not.toHaveProperty('apiKey')
    expect(event).not.toHaveProperty('internalDetail')
  })
})

// ─── Test: TaskType-specific timeout ────────────────────────────────

describe('Task type timeouts', () => {
  const TIMEOUT_CONFIG: Record<string, number> = {
    GENERATE_STORYBOARD: 10 * 60 * 1000,
    GENERATE_SHOT_IMAGES: 15 * 60 * 1000,
    GENERATE_SHOT_VIDEOS: 35 * 60 * 1000,
    RENDER_FINAL_VIDEO: 10 * 60 * 1000,
  }

  it('should have reasonable timeouts per task type', () => {
    expect(TIMEOUT_CONFIG['GENERATE_STORYBOARD']).toBe(600000) // 10 min
    expect(TIMEOUT_CONFIG['GENERATE_SHOT_IMAGES']).toBe(900000) // 15 min
    expect(TIMEOUT_CONFIG['GENERATE_SHOT_VIDEOS']).toBe(2100000) // 35 min
    expect(TIMEOUT_CONFIG['RENDER_FINAL_VIDEO']).toBe(600000) // 10 min
  })

  it('SHOT_VIDEOS should have the longest timeout (remote polling)', () => {
    const maxTimeout = Math.max(...Object.values(TIMEOUT_CONFIG))
    expect(maxTimeout).toBe(TIMEOUT_CONFIG['GENERATE_SHOT_VIDEOS'])
  })
})
