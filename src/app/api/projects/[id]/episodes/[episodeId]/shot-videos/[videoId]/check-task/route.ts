import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { adapterFactory } from '@/server/model-adapters/adapter.factory'
import { persistVideoFromUrl, resolveMediaReadUrl } from '@/server/services/media-persist'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; episodeId: string; videoId: string }> }
) {
  try {
    const { id: projectId, episodeId, videoId } = await params

    const video = await prisma.shotVideo.findFirst({
      where: { id: videoId, projectId },
    })

    if (!video) {
      return NextResponse.json({ success: false, error: '视频记录不存在' }, { status: 404 })
    }

    if (!video.remoteTaskId) {
      return NextResponse.json({ success: false, error: '该视频没有远端任务 ID' }, { status: 400 })
    }

    // 必须用项目当前的 modelProvider 选择对应适配器。
    // 必须保留项目上下文，避免历史任务检查时丢失适配器语义。
    // （忽略 Mock 开关：远端真任务不存在于 mock 模式中，这里始终用真实 API 轮询）
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: { modelProvider: true },
    })
    if (!project) {
      return NextResponse.json({ success: false, error: '项目不存在' }, { status: 404 })
    }

    const videoAdapter = adapterFactory.getVideoAdapter(project.modelProvider)
    const pollResult = await videoAdapter.pollVideoTask(video.remoteTaskId)

    // 更新数据库记录
    const updateData: Record<string, unknown> = {
      remoteStatus: pollResult.status,
      remoteProgress: typeof pollResult.progress === 'number' ? Math.round(pollResult.progress) : null,
      remoteResponseJson: pollResult.response,
      lastPolledAt: new Date(),
    }

    if (pollResult.videoUrl) {
      if (video.storageObjectKey) {
        updateData.videoUrl = await resolveMediaReadUrl(video.storageObjectKey, video.videoUrl)
      } else {
        const persisted = await persistVideoFromUrl(
          pollResult.videoUrl,
          projectId,
          `episodes/${episodeId}/shots/${video.shotId}`,
        )
        updateData.videoUrl = persisted.readUrl
        updateData.storageObjectKey = persisted.storageObjectKey
        updateData.storageProvider = persisted.storageProvider
        updateData.sourceVideoUrl = persisted.sourceUrl
      }
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
        videoUrl: String(updateData.videoUrl || video.videoUrl || ''),
        duration: pollResult.duration || video.duration,
        lastPolledAt: updateData.lastPolledAt,
      },
    })
  } catch (error) {
    console.error('Failed to check video task:', error)
    const msg = (error as Error)?.message || '检查任务失败'
    return NextResponse.json({ success: false, error: `检查任务失败: ${msg}` }, { status: 500 })
  }
}
