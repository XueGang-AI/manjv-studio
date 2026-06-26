import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { taskService } from '@/server/queues/task-queue.service'
import { emitTaskEvent, taskToUpdateEvent } from '@/server/workers/task-events'
import { getRuntimeModelName } from '@/server/model-adapters/model-config'

/**
 * POST /api/projects/:id/episodes/:episodeId/shot-images/generate
 * 创建分镜图生成任务（Worker 异步执行）
 *
 * 改造点：
 * - API 只做前置校验 + 创建 pending 任务
 * - 不再在 API 中调用 AI 适配器
 * - Worker 拾取任务后执行实际生成逻辑
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; episodeId: string }> }
) {
  try {
    const { id: projectId, episodeId } = await params

    const project = await prisma.project.findUnique({ where: { id: projectId } })
    if (!project) return NextResponse.json({ success: false, error: '项目不存在' }, { status: 404 })

    const episode = await prisma.episode.findFirst({ where: { id: episodeId, projectId } })
    if (!episode || !episode.confirmed) {
      return NextResponse.json({ success: false, error: '请先确认分镜脚本' }, { status: 400 })
    }

    // 检查是否有正在执行的生成任务
    const activeTask = await prisma.generationTask.findFirst({
      where: {
        projectId,
        episodeId,
        taskType: 'GENERATE_SHOT_IMAGES',
        status: { in: ['pending', 'running'] },
      },
    })
    if (activeTask) {
      return NextResponse.json({
        success: false,
        error: '已有分镜图生成任务正在执行中',
      }, { status: 409 })
    }

    // 验证前置数据
    const charImages = await prisma.characterImage.findMany({
      where: { projectId, isConfirmed: true, isSelected: true },
    })
    if (charImages.length === 0) {
      return NextResponse.json({
        success: false,
        error: '请先为角色生成标准图（选择并确认至少一张角色图）',
      }, { status: 400 })
    }

    const sceneReferenceCount = await prisma.sceneImage.count({
      where: {
        projectId,
        isConfirmed: true,
        isSelected: true,
        scene: { episodeId },
      },
    })
    if (sceneReferenceCount === 0) {
      return NextResponse.json({
        success: false,
        error: '请先生成场景参考图',
      }, { status: 400 })
    }

    const shots = await prisma.shot.findMany({
      where: { episodeId, projectId },
      orderBy: { shotNo: 'asc' },
    })
    if (shots.length === 0) {
      return NextResponse.json({ success: false, error: '没有镜头数据' }, { status: 400 })
    }

    // 创建 pending 任务
    const task = await taskService.createTask({
      projectId,
      episodeId,
      taskType: 'GENERATE_SHOT_IMAGES',
      modelName: getRuntimeModelName('image'),
      input: { episodeId, shot_count: shots.length },
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
        message: '分镜图生成任务已创建，Worker 将异步执行',
      },
    })
  } catch (error) {
    console.error('Failed to create shot-images task:', error)
    return NextResponse.json({ success: false, error: '创建分镜图生成任务失败' }, { status: 500 })
  }
}
