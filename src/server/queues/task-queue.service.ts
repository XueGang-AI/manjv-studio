// ============================================
// 统一任务管理服务
// ============================================
import prisma from '@/lib/prisma'
import { TaskType } from './queue.types'

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
        input: data.input || {},
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
      data: { status: 'success', finishedAt: new Date(), output: output || {} },
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

    return prisma.generationTask.update({
      where: { id: taskId },
      data: { status: 'retrying', retryCount: { increment: 1 }, errorMessage: null, startedAt: new Date(), finishedAt: null },
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
      data: { taskId, level, message, detail: detail || {}, metadata: {} },
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
