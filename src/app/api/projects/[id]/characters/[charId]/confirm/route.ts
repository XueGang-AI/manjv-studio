import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'

/**
 * POST /api/projects/:id/characters/:charId/confirm
 * 确认单个角色
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; charId: string }> }
) {
  try {
    const { id: projectId, charId } = await params

    const existing = await prisma.character.findFirst({
      where: { id: charId, projectId },
    })
    if (!existing) {
      return NextResponse.json({ success: false, error: '角色不存在' }, { status: 404 })
    }

    await prisma.character.update({
      where: { id: charId },
      data: { confirmed: true },
    })

    // 检查是否所有最新版本角色都已确认
    const maxVersion = existing.version
    const allLatest = await prisma.character.findMany({
      where: { projectId, version: maxVersion },
    })
    const allConfirmed = allLatest.every(c => c.confirmed || c.id === charId)

    if (allConfirmed) {
      await prisma.project.update({
        where: { id: projectId },
        data: { status: 'CHARACTER_CONFIRMED' },
      })
      const { versionService: vs } = await import('@/server/services/version.service')
      await vs.createVersion({
        projectId, entityType: 'CHARACTER_SET', entityId: projectId,
        snapshot: { project_status: 'CHARACTER_CONFIRMED' },
        changeType: 'CONFIRM', description: '确认角色设定', isConfirmed: true,
      })
    }

    return NextResponse.json({
      success: true,
      data: {
        characterId: charId,
        confirmed: true,
        projectStatus: allConfirmed ? 'CHARACTER_CONFIRMED' : 'CHARACTER_PENDING_CONFIRM',
      },
    })
  } catch (error) {
    console.error('Failed to confirm character:', error)
    return NextResponse.json(
      { success: false, error: '确认角色失败' },
      { status: 500 }
    )
  }
}
