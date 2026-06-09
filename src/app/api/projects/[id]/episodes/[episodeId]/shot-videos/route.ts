import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; episodeId: string }> }
) {
  try {
    const { id: projectId, episodeId } = await params

    const project = await prisma.project.findUnique({ where: { id: projectId } })
    const shots = await prisma.shot.findMany({
      where: { episodeId, projectId },
      orderBy: { shotNo: 'asc' },
      include: {
        videoPrompts: { take: 1, orderBy: { createdAt: 'desc' } },
        shotImages: { where: { isConfirmed: true }, take: 1 },
        shotVideos: { orderBy: { createdAt: 'desc' } },
      },
    })

    const grouped = shots.map(shot => ({
      shot: {
        id: shot.id, shotNo: shot.shotNo, shotName: shot.shotName,
        startTime: shot.startTime, endTime: shot.endTime,
        videoPrompt: shot.videoPrompts[0] || null,
        confirmedImage: shot.shotImages[0] || null,
      },
      videos: shot.shotVideos,
      selectedVideo: shot.shotVideos.find(v => v.isSelected) || null,
      confirmed: shot.shotVideos.some(v => v.isConfirmed),
    }))

    const allConfirmed = grouped.length > 0 && grouped.every(g => g.confirmed)

    return NextResponse.json({
      success: true,
      data: { projectId, episodeId, projectStatus: project?.status || '', shots: grouped, allConfirmed },
    })
  } catch (error) {
    console.error('Failed to fetch shot videos:', error)
    return NextResponse.json({ success: false, error: '获取视频失败' }, { status: 500 })
  }
}
