import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'

/**
 * POST /api/projects/:id/episodes/:episodeId/storyboard/confirm
 * 确认分镜脚本
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; episodeId: string }> }
) {
  try {
    const { id: projectId, episodeId } = await params

    const episode = await prisma.episode.findFirst({
      where: { id: episodeId, projectId },
      include: { shots: true },
    })

    if (!episode) {
      return NextResponse.json({ success: false, error: '剧集不存在' }, { status: 404 })
    }

    if (episode.shots.length === 0) {
      return NextResponse.json({ success: false, error: '分镜没有镜头，无法确认' }, { status: 400 })
    }

    // 确认 episode 和所有 shots
    await prisma.episode.update({ where: { id: episodeId }, data: { confirmed: true } })
    await prisma.shot.updateMany({ where: { episodeId }, data: { confirmed: true } })
    await prisma.imagePrompt.updateMany({
      where: { shot: { episodeId } }, data: { confirmed: true },
    })
    await prisma.videoPrompt.updateMany({
      where: { shot: { episodeId } }, data: { confirmed: true },
    })

    await prisma.project.update({
      where: { id: projectId }, data: { status: 'STORYBOARD_CONFIRMED' },
    })
    const { versionService: vs } = await import('@/server/services/version.service')
    await vs.createVersion({
      projectId, entityType: 'STORYBOARD', entityId: episodeId,
      snapshot: { episode_id: episodeId, project_status: 'STORYBOARD_CONFIRMED' },
      changeType: 'CONFIRM', description: '确认分镜脚本', isConfirmed: true,
    })

    return NextResponse.json({
      success: true,
      data: { episodeId, confirmed: true, projectStatus: 'STORYBOARD_CONFIRMED' },
    })
  } catch (error) {
    console.error('Failed to confirm storyboard:', error)
    return NextResponse.json({ success: false, error: '确认分镜失败' }, { status: 500 })
  }
}
