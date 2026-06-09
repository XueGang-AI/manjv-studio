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

    await prisma.shotVideo.updateMany({ where: { shotId: video.shotId, projectId }, data: { isSelected: false } })
    await prisma.shotVideo.update({ where: { id: videoId }, data: { isSelected: true } })

    return NextResponse.json({ success: true, data: { videoId, shotId: video.shotId, isSelected: true } })
  } catch (error) {
    console.error('Failed to select video:', error)
    return NextResponse.json({ success: false, error: '选择失败' }, { status: 500 })
  }
}
