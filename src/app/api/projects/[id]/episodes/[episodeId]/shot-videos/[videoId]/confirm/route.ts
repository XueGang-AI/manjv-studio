import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; episodeId: string; videoId: string }> }
) {
  try {
    const { id: projectId, episodeId, videoId } = await params
    const video = await prisma.shotVideo.findFirst({ where: { id: videoId, projectId } })
    if (!video) return NextResponse.json({ success: false, error: '视频不存在' }, { status: 404 })
    if (!video.isSelected) return NextResponse.json({ success: false, error: '请先选择该视频' }, { status: 400 })

    await prisma.shotVideo.updateMany({ where: { shotId: video.shotId, projectId, id: { not: videoId } }, data: { isConfirmed: false } })
    await prisma.shotVideo.update({ where: { id: videoId }, data: { isConfirmed: true } })

    const shots = await prisma.shot.findMany({ where: { episodeId, projectId } })
    let allConfirmed = true
    for (const shot of shots) {
      const has = await prisma.shotVideo.findFirst({ where: { shotId: shot.id, projectId, isConfirmed: true } })
      if (!has) { allConfirmed = false; break }
    }

    if (allConfirmed) {
      await prisma.project.update({ where: { id: projectId }, data: { status: 'SHOT_VIDEO_CONFIRMED' } })
      const { versionService: vs } = await import('@/server/services/version.service')
      await vs.createVersion({
        projectId, entityType: 'SHOT_VIDEO_SET', entityId: episodeId,
        snapshot: { project_status: 'SHOT_VIDEO_CONFIRMED', confirmed_video_id: videoId },
        changeType: 'CONFIRM', description: '确认视频片段', isConfirmed: true,
      })
    }

    return NextResponse.json({
      success: true,
      data: { videoId, shotId: video.shotId, isConfirmed: true, allConfirmed,
        projectStatus: allConfirmed ? 'SHOT_VIDEO_CONFIRMED' : 'SHOT_VIDEO_PENDING_CONFIRM' },
    })
  } catch (error) {
    console.error('Failed to confirm video:', error)
    return NextResponse.json({ success: false, error: '确认失败' }, { status: 500 })
  }
}
