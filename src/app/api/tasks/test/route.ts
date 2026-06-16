import { NextRequest, NextResponse } from 'next/server'
import { taskService } from '@/server/queues/task-queue.service'
import { emitTaskEvent, taskToUpdateEvent } from '@/server/workers/task-events'
import { isTestTaskEnabled } from '@/server/workers/handlers/test-noop.handler'

/**
 * POST /api/tasks/test
 * 创建测试 NOOP 任务（仅开发/测试环境可用）
 *
 * 生产环境返回 403。
 */
export async function POST(request: NextRequest) {
  if (!isTestTaskEnabled()) {
    return NextResponse.json({
      success: false,
      error: { code: 'TEST_TASKS_DISABLED', message: '测试任务在生产环境不可用' },
    }, { status: 403 })
  }

  try {
    const body = await request.json().catch(() => ({})) as { projectId?: string }
    const projectId = body.projectId || 'test-project'

    const task = await taskService.createTask({
      projectId,
      taskType: 'TEST_NOOP',
      input: { test: true, createdAt: new Date().toISOString() },
    })

    // 推送任务创建事件
    const created = await (await import('@/lib/prisma')).default.generationTask.findUnique({ where: { id: task.id } })
    if (created) {
      emitTaskEvent('task.created', taskToUpdateEvent(created)).catch(() => {})
    }

    return NextResponse.json({
      success: true,
      data: {
        taskId: task.id,
        status: 'pending',
        streamUrl: `/api/projects/${projectId}/tasks/stream`,
        message: '测试任务已创建，Worker 将异步执行',
      },
    })
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: { code: 'CREATE_FAILED', message: '创建测试任务失败' },
    }, { status: 500 })
  }
}
