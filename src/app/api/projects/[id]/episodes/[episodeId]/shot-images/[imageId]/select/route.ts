import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'

/**
 * POST /api/projects/:id/episodes/:eid/shot-images/:imageId/select
 * 选择该图片作为镜头最终图
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; episodeId: string; imageId: string }> }
) {
  try {
    const { id: projectId, episodeId, imageId } = await params

    const image = await prisma.shotImage.findFirst({ where: { id: imageId, projectId } })
    if (!image) return NextResponse.json({ success: false, error: '图片不存在' }, { status: 404 })

    // 同一镜头其他图取消
    await prisma.shotImage.updateMany({ where: { shotId: image.shotId, projectId }, data: { isSelected: false } })
    await prisma.shotImage.update({ where: { id: imageId }, data: { isSelected: true } })

    return NextResponse.json({ success: true, data: { imageId, shotId: image.shotId, isSelected: true } })
  } catch (error) {
    console.error('Failed to select shot image:', error)
    return NextResponse.json({ success: false, error: '选择失败' }, { status: 500 })
  }
}
