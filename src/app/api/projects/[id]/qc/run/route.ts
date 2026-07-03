import { NextRequest, NextResponse } from 'next/server'
import { qcService } from '@/server/services/qc.service'
import prisma from '@/lib/prisma'

type JsonValue = import('@prisma/client').Prisma.InputJsonValue

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  let taskId: string | null = null
  try {
    const { id: projectId } = await params
    const body = await request.json().catch(() => ({}))
    const episodeId = body.episode_id as string | undefined

    const task = await prisma.generationTask.create({
      data: { projectId, taskType: 'QUALITY_CHECK', modelName: 'QC-Service', status: 'running', input: { episode_id: episodeId } as unknown as JsonValue },
    })
    taskId = task.id

    const results = await qcService.runQC(projectId, episodeId)
    await prisma.generationTask.update({
      where: { id: task.id },
      data: { status: 'success', output: { results } as unknown as JsonValue, finishedAt: new Date() },
    })

    return NextResponse.json({ success: true, data: { results, taskId: task.id } })
  } catch (error) {
    if (taskId) {
      await prisma.generationTask.update({
        where: { id: taskId },
        data: {
          status: 'failed',
          errorMessage: (error as Error).message.substring(0, 500),
          finishedAt: new Date(),
        },
      }).catch(() => null)
    }
    return NextResponse.json({ success: false, error: (error as Error).message }, { status: 500 })
  }
}
