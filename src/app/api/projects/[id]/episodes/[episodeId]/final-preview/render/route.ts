import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { taskService } from '@/server/queues/task-queue.service'
import { emitTaskEvent, taskToUpdateEvent } from '@/server/workers/task-events'

/**
 * POST — 创建最终成片合成任务（Worker 异步执行）
 *
 * 改造点：
 * - API 只做前置校验 + 创建 pending 任务
 * - 不再在 API 中调用 FFmpeg
 * - Worker 拾取任务后执行实际合成逻辑
 *
 * 安全约束保留：
 * - 检测已有 RENDERING 状态，防止并发重复提交
 * - Worker 中 FFmpeg 仍使用安全加固的 spawn + 参数数组
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; episodeId: string }> }
) {
  try {
    const { id: projectId, episodeId } = await params

    const project = await prisma.project.findUnique({ where: { id: projectId } })
    if (!project) return NextResponse.json({ success: false, error: '项目不存在' }, { status: 404 })

    // 防止并发渲染
    if (project.status === 'RENDERING') {
      return NextResponse.json({
        success: false,
        error: { code: 'RENDER_ALREADY_RUNNING', message: '当前已有合成任务正在执行，请等待完成后再试' },
      }, { status: 409 })
    }

    // 检查是否有正在执行的渲染任务
    const activeTask = await prisma.generationTask.findFirst({
      where: {
        projectId,
        episodeId,
        taskType: 'RENDER_FINAL_VIDEO',
        status: { in: ['pending', 'running'] },
      },
    })
    if (activeTask) {
      return NextResponse.json({
        success: false,
        error: { code: 'RENDER_ALREADY_RUNNING', message: '已有渲染任务正在执行中' },
      }, { status: 409 })
    }

    const episode = await prisma.episode.findFirst({ where: { id: episodeId, projectId } })
    if (!episode) return NextResponse.json({ success: false, error: '剧集不存在' }, { status: 404 })

    // 验证前置数据
    const shots = await prisma.shot.findMany({
      where: { episodeId, projectId },
      orderBy: { shotNo: 'asc' },
      include: {
        shotVideos: { where: { isConfirmed: true } },
      },
    })

    const confirmedVideos = shots.flatMap(s => s.shotVideos)
    if (confirmedVideos.length === 0) {
      return NextResponse.json({ success: false, error: '没有已确认的视频片段' }, { status: 400 })
    }

    // 创建 pending 任务
    const task = await taskService.createTask({
      projectId,
      episodeId,
      taskType: 'RENDER_FINAL_VIDEO',
      modelName: 'FFmpeg',
      input: { episodeId, aspectRatio: project.aspectRatio || '9:16', shot_count: confirmedVideos.length },
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
        message: '成片合成任务已创建，Worker 将异步执行',
      },
    })
  } catch (error) {
    console.error('Failed to create render task:', error)
    return NextResponse.json({
      success: false,
      error: { code: 'RENDER_FAILED', message: '创建渲染任务失败，请稍后重试' },
    }, { status: 500 })
  }
}
