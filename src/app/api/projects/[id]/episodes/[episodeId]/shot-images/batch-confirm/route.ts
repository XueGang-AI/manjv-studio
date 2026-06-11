import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'

/**
 * POST /api/projects/:id/episodes/:eid/shot-images/batch-confirm
 * 一键确认所有镜头：每个镜头选第一张候选图自动确认
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; episodeId: string }> }
) {
  try {
    const { id: projectId, episodeId } = await params

    const shots = await prisma.shot.findMany({
      where: { episodeId, projectId },
      select: { id: true, shotNo: true },
      orderBy: { shotNo: 'asc' },
    })

    if (shots.length === 0) {
      return NextResponse.json({ success: false, error: '没有镜头' }, { status: 400 })
    }

    const confirmed: Array<{ shotNo: number; imageId: string }> = []

    for (const shot of shots) {
      // 优先选已确认的，其次选已选中的，否则选第一张
      let target = await prisma.shotImage.findFirst({
        where: { shotId: shot.id, projectId, isConfirmed: true },
      })
      if (!target) {
        target = await prisma.shotImage.findFirst({
          where: { shotId: shot.id, projectId, isSelected: true },
        })
      }
      if (!target) {
        target = await prisma.shotImage.findFirst({
          where: { shotId: shot.id, projectId },
          orderBy: { createdAt: 'asc' },
        })
      }
      if (!target) continue

      // 同一镜头其他图取消确认
      await prisma.shotImage.updateMany({
        where: { shotId: shot.id, projectId, id: { not: target.id } },
        data: { isConfirmed: false, isSelected: false },
      })
      await prisma.shotImage.update({
        where: { id: target.id },
        data: { isConfirmed: true, isSelected: true },
      })

      confirmed.push({ shotNo: shot.shotNo, imageId: target.id })
    }

    await prisma.project.update({
      where: { id: projectId },
      data: { status: 'SHOT_IMAGE_CONFIRMED' },
    })

    return NextResponse.json({
      success: true,
      data: { confirmedCount: confirmed.length, confirmed },
    })
  } catch (error) {
    console.error('Failed to batch confirm shot images:', error)
    return NextResponse.json({ success: false, error: '批量确认失败' }, { status: 500 })
  }
}
