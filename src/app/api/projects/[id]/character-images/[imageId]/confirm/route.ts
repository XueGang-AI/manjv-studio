import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'

/**
 * POST /api/projects/:id/character-images/:imageId/confirm
 * 确认该角色的标准图（需先选中）
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

    if (!image.isSelected) {
      return NextResponse.json({
        success: false, error: '请先选择该图片为标准角色图',
      }, { status: 400 })
    }

    // 确认当前图片
    await prisma.characterImage.update({
      where: { id: imageId },
      data: { isConfirmed: true },
    })

    // 同一角色的其他候选图取消确认
    await prisma.characterImage.updateMany({
      where: { characterId: image.characterId, projectId, id: { not: imageId } },
      data: { isConfirmed: false },
    })

    // 检查是否所有角色都有确认的标准图
    const characters = await prisma.character.findMany({
      where: { projectId, confirmed: true },
    })
    const allCharIds = characters.map(c => c.id)
    let allConfirmed = true
    for (const cid of allCharIds) {
      const hasConfirmed = await prisma.characterImage.findFirst({
        where: { characterId: cid, projectId, isConfirmed: true },
      })
      if (!hasConfirmed) {
        allConfirmed = false
        break
      }
    }

    if (allConfirmed) {
      await prisma.project.update({
        where: { id: projectId },
        data: { status: 'CHARACTER_IMAGE_CONFIRMED' },
      })
    }

    return NextResponse.json({
      success: true,
      data: {
        imageId,
        characterId: image.characterId,
        isConfirmed: true,
        allCharactersConfirmed: allConfirmed,
        projectStatus: allConfirmed ? 'CHARACTER_IMAGE_CONFIRMED' : projectStatus(projectId),
      },
    })
  } catch (error) {
    console.error('Failed to confirm image:', error)
    return NextResponse.json({ success: false, error: '确认图片失败' }, { status: 500 })
  }
}

async function projectStatus(projectId: string): Promise<string> {
  const p = await prisma.project.findUnique({ where: { id: projectId }, select: { status: true } })
  return p?.status || ''
}
