import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'

/**
 * POST /api/projects/:id/episodes/:eid/shot-images/:imageId/confirm
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; episodeId: string; imageId: string }> }
) {
  try {
    const { id: projectId, episodeId, imageId } = await params

    const image = await prisma.shotImage.findFirst({ where: { id: imageId, projectId } })
    if (!image) return NextResponse.json({ success: false, error: '图片不存在' }, { status: 404 })
    if (!image.isSelected) return NextResponse.json({ success: false, error: '请先选择该图片为最终图' }, { status: 400 })

    // 确认该图，同一镜头其他图取消确认
    await prisma.shotImage.updateMany({ where: { shotId: image.shotId, projectId, id: { not: imageId } }, data: { isConfirmed: false } })
    await prisma.shotImage.update({ where: { id: imageId }, data: { isConfirmed: true } })

    // 检查所有镜头是否都有确认图
    const shots = await prisma.shot.findMany({ where: { episodeId, projectId } })
    let allConfirmed = true
    for (const shot of shots) {
      const has = await prisma.shotImage.findFirst({ where: { shotId: shot.id, projectId, isConfirmed: true } })
      if (!has) { allConfirmed = false; break }
    }

    if (allConfirmed) {
      await prisma.project.update({ where: { id: projectId }, data: { status: 'SHOT_IMAGE_CONFIRMED' } })
      const { versionService: vs } = await import('@/server/services/version.service')
      await vs.createVersion({
        projectId, entityType: 'SHOT_IMAGE_SET', entityId: episodeId,
        snapshot: { project_status: 'SHOT_IMAGE_CONFIRMED', confirmed_image_id: imageId },
        changeType: 'CONFIRM', description: '确认分镜图', isConfirmed: true,
      })
    }

    return NextResponse.json({
      success: true,
      data: { imageId, shotId: image.shotId, isConfirmed: true, allConfirmed,
        projectStatus: allConfirmed ? 'SHOT_IMAGE_CONFIRMED' : 'SHOT_IMAGE_PENDING_CONFIRM' },
    })
  } catch (error) {
    console.error('Failed to confirm shot image:', error)
    return NextResponse.json({ success: false, error: '确认失败' }, { status: 500 })
  }
}
