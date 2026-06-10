import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { adapterFactory } from '@/server/model-adapters/adapter.factory'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; episodeId: string; videoId: string }> }
) {
  try {
    const { id: projectId, videoId } = await params

    const video = await prisma.shotVideo.findFirst({
      where: { id: videoId, projectId },
    })

    if (!video) {
      return NextResponse.json({ success: false, error: '视频记录不存在' }, { status: 404 })
    }

    if (!video.remoteTaskId) {
      return NextResponse.json({ success: false, error: '该视频没有远端任务 ID' }, { status: 400 })
    }

    // 获取真实视频适配器（忽略 Mock 开关，这里始终用真实 API 轮询）
    const videoAdapter = adapterFactory.getVideoAdapter()
    const pollResult = await videoAdapter.pollVideoTask(video.remoteTaskId)

    // 更新数据库记录
    const updateData: Record<string, unknown> = {
      remoteStatus: pollResult.status,
      remoteProgress: pollResult.progress ?? null,
      remoteResponseJson: pollResult.response,
      lastPolledAt: new Date(),
    }

    if (pollResult.videoUrl) {
      updateData.videoUrl = pollResult.videoUrl
    }
    if (pollResult.duration) {
      updateData.duration = pollResult.duration
    }

    await prisma.shotVideo.update({
      where: { id: videoId },
      data: updateData,
    })

    return NextResponse.json({
      success: true,
      data: {
        videoId,
        remoteTaskId: video.remoteTaskId,
        remoteStatus: pollResult.status,
        remoteProgress: pollResult.progress,
        videoUrl: pollResult.videoUrl || video.videoUrl,
        duration: pollResult.duration || video.duration,
        lastPolledAt: updateData.lastPolledAt,
      },
    })
  } catch (error) {
    console.error('Failed to check video task:', error)
    return NextResponse.json({ success: false, error: '检查任务失败' }, { status: 500 })
  }
}
