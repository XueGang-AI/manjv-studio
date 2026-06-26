import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { getRuntimeModelName } from '@/server/model-adapters/model-config'
import { taskService } from '@/server/queues/task-queue.service'
import { emitTaskEvent, taskToUpdateEvent } from '@/server/workers/task-events'

/**
 * POST /api/projects/:id/characters/generate
 * 创建角色设定生成任务（Worker 异步执行）
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

    if (project.status !== 'STORY_CONFIRMED' && project.status !== 'CHARACTER_PENDING_CONFIRM' && project.status !== 'CHARACTER_CONFIRMED') {
      return NextResponse.json({ success: false, error: '请先确认故事方案后再生成角色设定' }, { status: 400 })
    }

    const storyPackage = await prisma.storyPackage.findFirst({
      where: { projectId, confirmed: true },
      orderBy: { version: 'desc' },
    })
    if (!storyPackage) {
      return NextResponse.json({ success: false, error: '请先确认故事方案后再生成角色设定' }, { status: 400 })
    }

    const activeTask = await prisma.generationTask.findFirst({
      where: {
        projectId,
        taskType: 'GENERATE_CHARACTERS',
        status: { in: ['pending', 'running', 'retrying'] },
      },
    })
    if (activeTask) {
      return NextResponse.json({ success: false, error: '已有角色设定生成任务正在执行中' }, { status: 409 })
    }

    await prisma.project.update({
      where: { id: projectId },
      data: { status: 'CHARACTER_GENERATING' },
    })

    const task = await taskService.createTask({
      projectId,
      taskType: 'GENERATE_CHARACTERS',
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
        message: '角色设定生成任务已创建，Worker 将异步执行',
      },
    })
  } catch (error) {
    console.error('Failed to create characters task:', error)
    return NextResponse.json({ success: false, error: '创建角色设定任务失败' }, { status: 500 })
  }
}
