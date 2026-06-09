import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'

/**
 * POST /api/projects/:id/character-images/:imageId/select
 * 选择该图片作为标准角色图（同一角色其他图取消选中）
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; imageId: string }> }
) {
  try {
    const { id: projectId, imageId } = await params

    const image = await prisma.characterImage.findFirst({
      where: { id: imageId, projectId },
    })
    if (!image) {
      return NextResponse.json({ success: false, error: '图片不存在' }, { status: 404 })
    }

    // 同一角色其他图取消选中
    await prisma.characterImage.updateMany({
      where: { characterId: image.characterId, projectId },
      data: { isSelected: false },
    })

    // 选中当前图片
    await prisma.characterImage.update({
      where: { id: imageId },
      data: { isSelected: true },
    })

    return NextResponse.json({
      success: true,
      data: { imageId, characterId: image.characterId, isSelected: true },
    })
  } catch (error) {
    console.error('Failed to select image:', error)
    return NextResponse.json({ success: false, error: '选择图片失败' }, { status: 500 })
  }
}
