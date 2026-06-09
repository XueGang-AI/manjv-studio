import { NextRequest, NextResponse } from 'next/server'
import { qcService } from '@/server/services/qc.service'
import prisma from '@/lib/prisma'

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: projectId } = await params
    const body = await request.json().catch(() => ({}))
    const episodeId = body.episode_id as string | undefined

    const task = await prisma.generationTask.create({
      data: { projectId, taskType: 'QUALITY_CHECK', modelName: 'QC-Service', status: 'running', input: { episode_id: episodeId } },
    })

    const results = await qcService.runQC(projectId, episodeId)
    await prisma.generationTask.update({ where: { id: task.id }, data: { status: 'success', output: { results } } })

    return NextResponse.json({ success: true, data: { results, taskId: task.id } })
  } catch (error) {
    return NextResponse.json({ success: false, error: (error as Error).message }, { status: 500 })
  }
}
