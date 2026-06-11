import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'

/**
 * POST /api/projects/:id/character-images/batch-confirm
 * Body: { characterId?: string } — 不传则确认所有角色的所有已选图
 * 一键确认指定角色（或全部角色）的所有已选/未确认图片
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: projectId } = await params
    const body = await request.json().catch(() => ({}))
    const characterId = body.characterId as string | undefined

    const project = await prisma.project.findUnique({ where: { id: projectId } })
    if (!project) {
      return NextResponse.json({ success: false, error: '项目不存在' }, { status: 404 })
    }

    // 查询待确认的图片：已选中但未确认，或未选中也未确认（允许直接确认）
    const where: Record<string, unknown> = {
      projectId,
      isConfirmed: false,
    }
    if (characterId) {
      where.characterId = characterId
    }

    const imagesToConfirm = await prisma.characterImage.findMany({
      where,
      orderBy: { referenceType: 'asc' },
    })

    if (imagesToConfirm.length === 0) {
      return NextResponse.json({
        success: true,
        data: { confirmedCount: 0, message: '没有需要确认的图片' },
      })
    }

    // 按 referenceType 分组，每组只保留一张（最新的）
    const byType = new Map<string, typeof imagesToConfirm[0]>()
    for (const img of imagesToConfirm) {
      const key = img.referenceType || '__unknown__'
      const existing = byType.get(key)
      if (!existing || img.createdAt > existing.createdAt) {
        byType.set(key, img)
      }
    }

    const toConfirm = Array.from(byType.values())
    const confirmedIds: string[] = []

    // 逐张确认（处理同 referenceType 冲突）
    for (const img of toConfirm) {
      await prisma.characterImage.update({
        where: { id: img.id },
        data: { isConfirmed: true, isSelected: true },
      })

      // 同 referenceType 其他已确认图取消
      if (img.referenceType) {
        await prisma.characterImage.updateMany({
          where: {
            characterId: img.characterId, projectId,
            referenceType: img.referenceType,
            id: { not: img.id },
          },
          data: { isConfirmed: false },
        })
      }

      // 更新 primary 标记
      if (img.referenceType === 'front_full_body') {
        await prisma.characterImage.updateMany({
          where: { characterId: img.characterId, projectId, id: { not: img.id } },
          data: { isPrimary: false },
        })
        await prisma.characterImage.update({
          where: { id: img.id },
          data: { isPrimary: true },
        })
      }

      confirmedIds.push(img.id)
    }

    // 检查所有角色是否都有确认图
    const characters = await prisma.character.findMany({
      where: { projectId, confirmed: true },
    })
    const allCharIds = characters.map(c => c.id)
    let allConfirmed = true
    for (const cid of allCharIds) {
      const hasConfirmed = await prisma.characterImage.findFirst({
        where: { characterId: cid, projectId, isConfirmed: true },
      })
      if (!hasConfirmed) { allConfirmed = false; break }
    }

    if (allConfirmed) {
      await prisma.project.update({
        where: { id: projectId },
        data: { status: 'CHARACTER_IMAGE_CONFIRMED' },
      })
    }

    const confirmedTypes = toConfirm.map(i => i.referenceType).filter(Boolean)

    return NextResponse.json({
      success: true,
      data: {
        confirmedCount: confirmedIds.length,
        confirmedTypes,
        allCharactersConfirmed: allConfirmed,
        characterId: characterId || 'all',
      },
    })
  } catch (error) {
    console.error('Failed to batch confirm images:', error)
    return NextResponse.json({ success: false, error: '批量确认失败' }, { status: 500 })
  }
}
