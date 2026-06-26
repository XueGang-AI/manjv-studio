import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { taskService } from '@/server/queues/task-queue.service'
import { emitTaskEvent, taskToUpdateEvent } from '@/server/workers/task-events'
import { getRuntimeModelName } from '@/server/model-adapters/model-config'

/**
 * POST /api/projects/:id/episodes/:episodeId/scene-references/generate
 * 创建场景参考图生成任务（Worker 异步执行）
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

    const shots = await prisma.shot.findMany({
      where: { episodeId, projectId },
      select: { id: true },
      take: 1,
    })
    if (shots.length === 0) {
      return NextResponse.json({ success: false, error: '没有镜头数据' }, { status: 400 })
    }

    const activeTask = await prisma.generationTask.findFirst({
      where: {
        projectId,
        episodeId,
        taskType: 'GENERATE_SCENE_REFERENCES',
        status: { in: ['pending', 'running', 'retrying'] },
      },
    })
    if (activeTask) {
      return NextResponse.json({
        success: false,
        error: '已有场景参考图任务正在执行中',
      }, { status: 409 })
    }

    const task = await taskService.createTask({
      projectId,
      episodeId,
      taskType: 'GENERATE_SCENE_REFERENCES',
      modelName: getRuntimeModelName('image'),
      input: { episodeId },
    })

    const created = await prisma.generationTask.findUnique({ where: { id: task.id } })
    if (created) emitTaskEvent('task.created', taskToUpdateEvent(created)).catch(() => {})

    return NextResponse.json({
      success: true,
      data: {
        taskId: task.id,
        status: 'pending',
        streamUrl: `/api/projects/${projectId}/tasks/stream`,
        message: '场景参考图任务已创建，Worker 将异步执行',
      },
    })
  } catch (error) {
    console.error('Failed to create scene reference task:', error)
    return NextResponse.json({ success: false, error: '创建场景参考图任务失败' }, { status: 500 })
  }
}
