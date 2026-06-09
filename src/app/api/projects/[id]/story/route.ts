import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'

/**
 * GET /api/projects/:id/story
 * 获取项目的所有故事方案版本
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    const project = await prisma.project.findUnique({ where: { id } })
    if (!project) {
      return NextResponse.json({ success: false, error: '项目不存在' }, { status: 404 })
    }

    const storyPackages = await prisma.storyPackage.findMany({
      where: { projectId: id },
      orderBy: { version: 'desc' },
    })

    return NextResponse.json({
      success: true,
      data: {
        projectId: id,
        projectStatus: project.status,
        packages: storyPackages,
        latest: storyPackages[0] || null,
      },
    })
  } catch (error) {
    console.error('Failed to fetch story:', error)
    return NextResponse.json(
      { success: false, error: '获取故事方案失败' },
      { status: 500 }
    )
  }
}
