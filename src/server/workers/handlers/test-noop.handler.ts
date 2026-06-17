// ============================================
// TEST_NOOP Handler — 仅用于开发和测试
// ============================================
//
// 非生产环境可用的测试任务，按真实流程更新进度。
// 不调用 AI、不调用 FFmpeg、不写业务数据。
//
// 启用条件：ENABLE_TEST_TASKS=true 或 NODE_ENV=test
// 生产环境不得创建或执行该任务。

import prisma from '@/lib/prisma'
import { taskService } from '@/server/queues/task-queue.service'
import { emitTaskEvent, taskToUpdateEvent } from '../task-events'

/** 是否允许测试任务 */
export function isTestTaskEnabled(): boolean {
  return process.env.ENABLE_TEST_TASKS === 'true' || process.env.NODE_ENV === 'test'
}

/**
 * 执行测试 NOOP 任务
 *
 * 生命周期：pending → running → progress 25 → 50 → 75 → success
 * 每步间隔 500ms，总计约 2.5 秒。
 */
export async function handleTestNoop(taskId: string): Promise<void> {
  // 安全检查：生产环境禁止执行
  if (!isTestTaskEnabled()) {
    console.error(`[worker:test-noop] Task ${taskId} rejected: test tasks disabled in production`)
    await prisma.generationTask.update({
      where: { id: taskId },
      data: {
        status: 'failed',
        errorMessage: 'TEST_NOOP 任务在生产环境不可用',
        finishedAt: new Date(),
      },
    })
    return
  }

  // 幂等性检查
  const existingTask = await prisma.generationTask.findUnique({ where: { id: taskId } })
  if (!existingTask) throw new Error('任务不存在')
  if (existingTask.status === 'success') {
    console.log(`[worker:test-noop] Task ${taskId} already completed, skipping`)
    return
  }
  if (existingTask.status !== 'pending' && existingTask.status !== 'running' && existingTask.status !== 'retrying') {
    console.log(`[worker:test-noop] Task ${taskId} in status ${existingTask.status}, skipping`)
    return
  }

  const task = await taskService.startTask(taskId)

  try {
    await emitTaskEvent('task.running', taskToUpdateEvent(task))

    // 模拟进度推进
    const steps = [25, 50, 75]
    for (const progress of steps) {
      await sleep(500)
      await taskService.updateProgress(taskId, progress)
      const updated = await prisma.generationTask.findUnique({ where: { id: taskId } })
      if (updated) {
        await emitTaskEvent('task.progress', taskToUpdateEvent(updated))
      }
    }

    await sleep(500)

    // 完成
    const completed = await taskService.completeTask(taskId, {
      message: 'TEST_NOOP completed successfully',
      steps: 4,
    })

    await emitTaskEvent('task.completed', taskToUpdateEvent(completed))

    console.log(`[worker:test-noop] Task ${taskId} completed`)
  } catch (error) {
    const errorMsg = (error as Error).message
    console.error(`[worker:test-noop] Task ${taskId} failed:`, errorMsg)
    const failed = await taskService.failTask(taskId, errorMsg)
    await emitTaskEvent('task.failed', taskToUpdateEvent(failed))
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}
