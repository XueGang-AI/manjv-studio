import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'

/**
 * POST /api/projects/:id/character-images/:imageId/confirm
 * 确认该图片为标准参考图（支持多张不同 reference_type 同时确认）
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

    // ⭐ 多参考图模式：不再取消同一角色其他 reference_type 的已确认图
    // 旧逻辑只保留 1 张 confirmed，新逻辑允许多张（每种 reference_type 一张）
    // 仅取消同一 reference_type 的其他 confirmed 图
    if (image.referenceType) {
      await prisma.characterImage.updateMany({
        where: {
          characterId: image.characterId, projectId,
          referenceType: image.referenceType,
          id: { not: imageId },
        },
        data: { isConfirmed: false },
      })
    } else {
      // 旧数据兼容：没有 reference_type 时，保持旧行为（只保留 1 张 confirmed）
      await prisma.characterImage.updateMany({
        where: { characterId: image.characterId, projectId, id: { not: imageId } },
        data: { isConfirmed: false },
      })
    }

    // 更新 isPrimary：每角色只有一张 primary
    if (image.isSelected) {
      await prisma.characterImage.updateMany({
        where: { characterId: image.characterId, projectId, id: { not: imageId } },
        data: { isPrimary: false },
      })
    }

    // 检查是否所有角色都有确认图
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
        referenceType: image.referenceType,
        allCharactersConfirmed: allConfirmed,
      },
    })
  } catch (error) {
    console.error('Failed to confirm image:', error)
    return NextResponse.json({ success: false, error: '确认图片失败' }, { status: 500 })
  }
}
