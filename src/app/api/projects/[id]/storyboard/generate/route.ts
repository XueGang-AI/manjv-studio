import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { taskService } from '@/server/queues/task-queue.service'
import { emitTaskEvent, taskToUpdateEvent } from '@/server/workers/task-events'
import { getRuntimeModelName } from '@/server/model-adapters/model-config'

/**
 * POST /api/projects/:id/storyboard/generate
 * 创建分镜生成任务（Worker 异步执行）
 *
 * 改造点：
 * - API 只做前置校验 + 创建 pending 任务
 * - 不再在 API 中调用 AI 适配器
 * - Worker 拾取任务后执行实际生成逻辑
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

    // 检查前置条件
    if (project.status !== 'CHARACTER_IMAGE_CONFIRMED' &&
        project.status !== 'STORYBOARD_PENDING_CONFIRM' &&
        project.status !== 'STORYBOARD_CONFIRMED') {
      return NextResponse.json({
        success: false,
        error: '请先完成故事方案、角色设定和标准角色图确认',
      }, { status: 400 })
    }

    // 检查是否有正在执行的分镜生成任务
    const activeTask = await prisma.generationTask.findFirst({
      where: {
        projectId,
        taskType: 'GENERATE_STORYBOARD',
        status: { in: ['pending', 'running'] },
      },
    })
    if (activeTask) {
      return NextResponse.json({
        success: false,
        error: '已有分镜生成任务正在执行中',
      }, { status: 409 })
    }

    // 验证前置数据
    const storyPackage = await prisma.storyPackage.findFirst({
      where: { projectId, confirmed: true },
      orderBy: { version: 'desc' },
    })
    if (!storyPackage) {
      return NextResponse.json({ success: false, error: '请先确认故事方案' }, { status: 400 })
    }

    // 创建 pending 任务，Worker 将拾取执行
    const task = await taskService.createTask({
      projectId,
      taskType: 'GENERATE_STORYBOARD',
      modelName: getRuntimeModelName('text'),
      input: { project_id: projectId, episode_number: 1 },
    })

    // 推送任务创建事件
    const created = await prisma.generationTask.findUnique({ where: { id: task.id } })
    if (created) emitTaskEvent('task.created', taskToUpdateEvent(created)).catch(() => {})

    return NextResponse.json({
      success: true,
      data: {
        taskId: task.id,
        status: 'pending',
        streamUrl: `/api/projects/${projectId}/tasks/stream`,
        message: '分镜生成任务已创建，Worker 将异步执行',
      },
    })
  } catch (error) {
    console.error('Failed to create storyboard task:', error)
    return NextResponse.json({ success: false, error: '创建分镜生成任务失败' }, { status: 500 })
  }
}
