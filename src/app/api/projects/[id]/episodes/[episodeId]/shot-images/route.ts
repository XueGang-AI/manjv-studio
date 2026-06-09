import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'

/**
 * GET /api/projects/:id/episodes/:episodeId/shot-images
 * 获取所有分镜候选图（按镜头分组）
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; episodeId: string }> }
) {
  try {
    const { id: projectId, episodeId } = await params

    const episode = await prisma.episode.findFirst({ where: { id: episodeId, projectId } })
    if (!episode) {
      return NextResponse.json({ success: false, error: '剧集不存在' }, { status: 404 })
    }

    const project = await prisma.project.findUnique({ where: { id: projectId } })
    const shots = await prisma.shot.findMany({
      where: { episodeId, projectId },
      orderBy: { shotNo: 'asc' },
      include: {
        imagePrompts: { take: 1, orderBy: { createdAt: 'desc' } },
        shotImages: { orderBy: { createdAt: 'desc' } },
      },
    })

    const grouped = shots.map(shot => ({
      shot: {
        id: shot.id, shotNo: shot.shotNo, shotName: shot.shotName,
        startTime: shot.startTime, endTime: shot.endTime,
        location: shot.location, characters: shot.characters,
        action: shot.action, imagePrompt: shot.imagePrompts[0] || null,
      },
      images: shot.shotImages,
      selectedImage: shot.shotImages.find(i => i.isSelected) || null,
      confirmed: shot.shotImages.some(i => i.isConfirmed),
    }))

    const allConfirmed = grouped.length > 0 && grouped.every(g => g.confirmed)

    return NextResponse.json({
      success: true,
      data: { projectId, episodeId, projectStatus: project?.status || '', shots: grouped, allConfirmed },
    })
  } catch (error) {
    console.error('Failed to fetch shot images:', error)
    return NextResponse.json({ success: false, error: '获取分镜图失败' }, { status: 500 })
  }
}
