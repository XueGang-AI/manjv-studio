import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'

/**
 * POST /api/projects/:id/story/:storyPackageId/confirm
 * 确认故事方案
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; storyPackageId: string }> }
) {
  try {
    const { id: projectId, storyPackageId } = await params

    // 验证 storyPackage 存在且属于该项目
    const existing = await prisma.storyPackage.findFirst({
      where: { id: storyPackageId, projectId },
    })

    if (!existing) {
      return NextResponse.json(
        { success: false, error: '故事方案不存在' },
        { status: 404 }
      )
    }

    // 将该项目的所有 story packages 取消确认
    await prisma.storyPackage.updateMany({
      where: { projectId },
      data: { confirmed: false },
    })

    // 确认指定版本
    await prisma.storyPackage.update({
      where: { id: storyPackageId },
      data: { confirmed: true },
    })

    // 创建版本记录
    const { versionService: vs } = await import('@/server/services/version.service')
    await vs.createVersion({
      projectId, entityType: 'STORY_PACKAGE', entityId: projectId,
      snapshot: { story_package_id: storyPackageId, project_status: 'STORY_CONFIRMED' },
      changeType: 'CONFIRM', description: '确认故事方案', isConfirmed: true,
    })

    // 更新项目状态
    await prisma.project.update({
      where: { id: projectId },
      data: { status: 'STORY_CONFIRMED' },
    })

    return NextResponse.json({
      success: true,
      data: {
        storyPackageId,
        confirmed: true,
        projectStatus: 'STORY_CONFIRMED',
      },
    })
  } catch (error) {
    console.error('Failed to confirm story:', error)
    return NextResponse.json(
      { success: false, error: '确认故事方案失败' },
      { status: 500 }
    )
  }
}
