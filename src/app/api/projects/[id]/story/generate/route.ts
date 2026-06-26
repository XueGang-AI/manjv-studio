import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { getRuntimeModelName } from '@/server/model-adapters/model-config'
import { taskService } from '@/server/queues/task-queue.service'
import { emitTaskEvent, taskToUpdateEvent } from '@/server/workers/task-events'

/**
 * POST /api/projects/:id/story/generate
 * 创建故事方案生成任务（Worker 异步执行）
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: projectId } = await params

    const project = await prisma.project.findUnique({ where: { id: projectId } })
    if (!project) {
      return NextResponse.json({ success: false, error: '项目不存在' }, { status: 404 })
    }

    const activeTask = await prisma.generationTask.findFirst({
      where: {
        projectId,
        taskType: 'GENERATE_STORY_PACKAGE',
        status: { in: ['pending', 'running', 'retrying'] },
      },
    })
    if (activeTask || project.status === 'STORY_GENERATING') {
      return NextResponse.json({ success: false, error: '故事方案正在生成中，请稍候' }, { status: 409 })
    }

    await prisma.project.update({
      where: { id: projectId },
      data: { status: 'STORY_GENERATING' },
    })

    const task = await taskService.createTask({
      projectId,
      taskType: 'GENERATE_STORY_PACKAGE',
      modelName: getRuntimeModelName('text'),
      input: { project_id: projectId },
    })

    const created = await prisma.generationTask.findUnique({ where: { id: task.id } })
    if (created) emitTaskEvent('task.created', taskToUpdateEvent(created)).catch(() => {})

    return NextResponse.json({
      success: true,
      data: {
        taskId: task.id,
        status: 'pending',
        streamUrl: `/api/projects/${projectId}/tasks/stream`,
        message: '故事方案生成任务已创建，Worker 将异步执行',
      },
    })
  } catch (error) {
    console.error('Failed to create story task:', error)
    return NextResponse.json({ success: false, error: '创建故事方案任务失败' }, { status: 500 })
  }
}
