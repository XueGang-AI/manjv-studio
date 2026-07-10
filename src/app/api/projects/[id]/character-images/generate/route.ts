import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { getRuntimeModelName } from '@/server/model-adapters/model-config'
import { taskService } from '@/server/queues/task-queue.service'
import { emitTaskEvent, taskToUpdateEvent } from '@/server/workers/task-events'

type RefType =
  | 'front_full_body'
  | 'front_half_body'
  | 'left_side'
  | 'right_side'
  | 'back_view'
  | 'expression'
  | 'outfit'
  | 'prop'
  | 'weapon'
  | 'pose'

/**
 * POST /api/projects/:id/character-images/generate?mode=quick|consistency
 * 创建角色参考图生成任务（Worker 异步执行）
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: projectId } = await params
    const url = new URL(request.url)
    const mode = url.searchParams.get('mode') || 'consistency'
    const types: RefType[] = mode === 'consistency'
      ? ['front_full_body', 'front_half_body', 'left_side', 'right_side', 'back_view']
      : ['front_full_body']

    const project = await prisma.project.findUnique({ where: { id: projectId } })
    if (!project) {
      return NextResponse.json({ success: false, error: '项目不存在' }, { status: 404 })
    }

    const characters = await prisma.character.findMany({
      where: { projectId, confirmed: true },
      select: { id: true },
    })
    if (characters.length === 0) {
      return NextResponse.json({ success: false, error: '没有已确认的角色，请先确认角色设定卡' }, { status: 400 })
    }

    const activeTask = await prisma.generationTask.findFirst({
      where: {
        projectId,
        taskType: 'GENERATE_CHARACTER_IMAGES',
        status: { in: ['pending', 'running', 'retrying'] },
      },
    })
    if (activeTask) {
      return NextResponse.json({ success: false, error: '已有角色图生成任务正在执行中' }, { status: 409 })
    }

    await prisma.project.update({
      where: { id: projectId },
      data: { status: 'CHARACTER_IMAGE_GENERATING' },
    })

    const task = await taskService.createTask({
      projectId,
      taskType: 'GENERATE_CHARACTER_IMAGES',
      modelName: getRuntimeModelName('image'),
      input: {
        project_id: projectId,
        character_count: characters.length,
        mode,
        reference_types: types,
      },
    })

    const created = await prisma.generationTask.findUnique({ where: { id: task.id } })
    if (created) emitTaskEvent('task.created', taskToUpdateEvent(created)).catch(() => {})

    return NextResponse.json({
      success: true,
      data: {
        taskId: task.id,
        status: 'pending',
        streamUrl: `/api/projects/${projectId}/tasks/stream`,
        message: '角色图生成任务已创建，Worker 将异步执行',
      },
    })
  } catch (error) {
    console.error('Failed to create character-images task:', error)
    return NextResponse.json({ success: false, error: '创建角色图任务失败' }, { status: 500 })
  }
}
