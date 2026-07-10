// ============================================
// 统一任务管理服务
// ============================================
import prisma from '@/lib/prisma'

type JsonValue = import('@prisma/client').Prisma.InputJsonValue

/** 任务类型枚举（从 queue.types.ts 合并） */
export enum TaskType {
  GENERATE_STORY_PACKAGE = 'GENERATE_STORY_PACKAGE',
  GENERATE_CHARACTERS = 'GENERATE_CHARACTERS',
  GENERATE_CHARACTER_IMAGES = 'GENERATE_CHARACTER_IMAGES',
  GENERATE_STORYBOARD = 'GENERATE_STORYBOARD',
  GENERATE_SCENE_REFERENCES = 'GENERATE_SCENE_REFERENCES',
  GENERATE_SHOT_IMAGES = 'GENERATE_SHOT_IMAGES',
  GENERATE_SHOT_VIDEOS = 'GENERATE_SHOT_VIDEOS',
  RENDER_FINAL_VIDEO = 'RENDER_FINAL_VIDEO',
  QUALITY_CHECK = 'QUALITY_CHECK',
}

export class TaskService {
  async createTask(data: {
    projectId: string; episodeId?: string; shotId?: string
    taskType: string; modelName?: string; input?: Record<string, unknown>
    maxRetries?: number
  }) {
    return prisma.generationTask.create({
      data: {
        projectId: data.projectId,
        episodeId: data.episodeId || null,
        shotId: data.shotId || null,
        taskType: data.taskType,
        modelName: data.modelName || '',
        status: 'pending',
        input: (data.input || {}) as unknown as JsonValue,
        maxRetries: data.maxRetries ?? this.defaultMaxRetries(data.taskType),
        retryCount: 0,
      },
    })
  }

  async startTask(taskId: string) {
    return prisma.generationTask.update({
      where: { id: taskId },
      data: { status: 'running', startedAt: new Date() },
    })
  }

  async completeTask(taskId: string, output?: Record<string, unknown>) {
    return prisma.generationTask.update({
      where: { id: taskId },
      data: {
        status: 'success',
        progress: 100,
        finishedAt: new Date(),
        output: (output || {}) as unknown as JsonValue,
      },
    })
  }

  async failTask(taskId: string, error: string) {
    return prisma.generationTask.update({
      where: { id: taskId },
      data: { status: 'failed', finishedAt: new Date(), errorMessage: error },
    })
  }

  async updateProgress(taskId: string, progress: number) {
    return prisma.generationTask.update({
      where: { id: taskId },
      data: { progress: Math.min(100, Math.max(0, progress)) },
    })
  }

  async retryTask(taskId: string) {
    const task = await prisma.generationTask.findUnique({ where: { id: taskId } })
    if (!task) throw new Error('任务不存在')
    if (task.status !== 'failed') throw new Error('只能重试失败的任务')
    if (task.retryCount >= task.maxRetries) throw new Error('已达到最大重试次数')

    // status='retrying' 让前端显示"重试中"，Worker 的 pollOnce/claimTask 会领取它。
    // startedAt 必须为 null：claimTask 领取时才会设置 startedAt，
    // 若在此设为 now，recoverStaleTasks 会误判任务已运行超时。
    return prisma.generationTask.update({
      where: { id: taskId },
      data: { status: 'retrying', retryCount: { increment: 1 }, errorMessage: null, startedAt: null, finishedAt: null },
    })
  }

  async cancelTask(taskId: string) {
    const task = await prisma.generationTask.findUnique({ where: { id: taskId } })
    if (!task) throw new Error('任务不存在')
    if (!['pending', 'running', 'retrying'].includes(task.status)) throw new Error('只能取消等待中或执行中的任务')

    return prisma.generationTask.update({
      where: { id: taskId },
      data: { status: 'cancelled', finishedAt: new Date() },
    })
  }

  /**
   * 硬删除任务及其日志。
   * 仅允许删除已终态的任务（success / failed / cancelled），活跃任务请先取消。
   */
  async deleteTask(taskId: string) {
    const task = await prisma.generationTask.findUnique({ where: { id: taskId } })
    if (!task) throw new Error('任务不存在')
    if (['pending', 'running', 'retrying'].includes(task.status)) {
      throw new Error('请先取消活跃任务，再删除')
    }
    // 先删日志，再删任务（避免外键约束问题）
    await prisma.taskLog.deleteMany({ where: { taskId } })
    return prisma.generationTask.delete({ where: { id: taskId } })
  }

  /**
   * 批量删除已终态的任务（success / failed / cancelled），保留活跃任务。
   * 返回删除数量。
   */
  async deleteFinishedTasks(projectId: string) {
    const result = await prisma.generationTask.findMany({
      where: {
        projectId,
        status: { in: ['success', 'failed', 'cancelled'] },
      },
      select: { id: true },
    })
    const ids = result.map(t => t.id)
    if (ids.length === 0) return { count: 0 }

    await prisma.taskLog.deleteMany({ where: { taskId: { in: ids } } })
    const deleted = await prisma.generationTask.deleteMany({
      where: { id: { in: ids } },
    })
    return { count: deleted.count }
  }

  async getTask(taskId: string) {
    return prisma.generationTask.findUnique({
      where: { id: taskId },
      include: { taskLogs: { orderBy: { createdAt: 'desc' }, take: 50 } },
    })
  }

  async getProjectTasks(projectId: string, limit = 50) {
    return prisma.generationTask.findMany({
      where: { projectId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    })
  }

  async getTaskLogs(taskId: string, limit = 100) {
    return prisma.taskLog.findMany({
      where: { taskId },
      orderBy: { createdAt: 'asc' },
      take: limit,
    })
  }

  async appendLog(taskId: string, level: string, message: string, detail?: Record<string, unknown>) {
    return prisma.taskLog.create({
      data: { taskId, level, message, detail: (detail || {}) as unknown as JsonValue, metadata: {} as unknown as JsonValue },
    })
  }

  async getAllTasks(limit = 50) {
    return prisma.generationTask.findMany({
      orderBy: { createdAt: 'desc' },
      take: limit,
    })
  }

  private defaultMaxRetries(taskType: string): number {
    if (taskType.includes('TEXT') || taskType.includes('STORY') || taskType.includes('CHARACTER') || taskType.includes('STORYBOARD')) return 3
    if (taskType.includes('IMAGE')) return 3
    if (taskType.includes('VIDEO')) return 2
    if (taskType.includes('RENDER')) return 1
    return 2
  }
}

export const taskService = new TaskService()
