import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { taskService } from '@/server/queues/task-queue.service'
import { emitTaskEvent, taskToUpdateEvent } from '@/server/workers/task-events'
import { getRuntimeModelName } from '@/server/model-adapters/model-config'

/**
 * POST /api/projects/:id/episodes/:episodeId/shot-videos/generate
 * 创建视频生成任务（Worker 异步执行）
 *
 * 改造点：
 * - API 只做前置校验 + 创建 pending 任务
 * - 不再在 API 中调用视频适配器
 * - Worker 拾取任务后执行实际生成逻辑（含异步轮询）
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

    // 检查是否有正在执行的视频生成任务
    const activeTask = await prisma.generationTask.findFirst({
      where: {
        projectId,
        episodeId,
        taskType: 'GENERATE_SHOT_VIDEOS',
        status: { in: ['pending', 'running'] },
      },
    })
    if (activeTask) {
      return NextResponse.json({
        success: false,
        error: '已有视频生成任务正在执行中',
      }, { status: 409 })
    }

    const shots = await prisma.shot.findMany({
      where: { episodeId, projectId },
      orderBy: { shotNo: 'asc' },
      include: {
        shotImages: { where: { isConfirmed: true }, take: 1 },
      },
    })

    if (shots.length === 0) return NextResponse.json({ success: false, error: '没有镜头' }, { status: 400 })

    // 检查所有镜头都有确认图
    const missingImages = shots.filter(s => !s.shotImages[0])
    if (missingImages.length > 0) {
      return NextResponse.json({
        success: false,
        error: `镜头 #${missingImages.map(s => s.shotNo).join(', ')} 缺少已确认的分镜图`,
      }, { status: 400 })
    }

    // 创建 pending 任务
    const task = await taskService.createTask({
      projectId,
      episodeId,
      taskType: 'GENERATE_SHOT_VIDEOS',
      modelName: getRuntimeModelName('video'),
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
        message: '视频生成任务已创建，Worker 将异步执行',
      },
    })
  } catch (error) {
    console.error('Failed to create shot-videos task:', error)
    return NextResponse.json({ success: false, error: '创建视频生成任务失败' }, { status: 500 })
  }
}
