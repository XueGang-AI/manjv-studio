import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'

/**
 * GET /api/projects/:id/characters
 * 获取项目的所有角色（最新版本）
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: projectId } = await params

    const project = await prisma.project.findUnique({ where: { id: projectId } })
    if (!project) {
      return NextResponse.json({ success: false, error: '项目不存在' }, { status: 404 })
    }

    // 获取所有角色，按版本分组，只返回最新版本
    const allCharacters = await prisma.character.findMany({
      where: { projectId },
      orderBy: [{ version: 'desc' }, { createdAt: 'desc' }],
    })

    // 获取最大版本号
    const maxVersion = allCharacters.length > 0 ? allCharacters[0].version : 0

    // 只返回最新版本的角色
    const latestCharacters = allCharacters.filter(c => c.version === maxVersion)

    return NextResponse.json({
      success: true,
      data: {
        projectId,
        projectStatus: project.status,
        version: maxVersion,
        characters: latestCharacters,
        totalVersions: maxVersion,
      },
    })
  } catch (error) {
    console.error('Failed to fetch characters:', error)
    return NextResponse.json(
      { success: false, error: '获取角色列表失败' },
      { status: 500 }
    )
  }
}
