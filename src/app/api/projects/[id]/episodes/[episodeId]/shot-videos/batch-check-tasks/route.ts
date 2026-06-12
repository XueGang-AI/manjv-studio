import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { adapterFactory } from '@/server/model-adapters/adapter.factory'

/**
 * POST — 批量轮询该 episode 下所有未完成的远端视频任务
 *
 * 遍历 remote_status 非终态（completed/succeeded/failed/error/cancelled）的 shot_videos，
 * 逐个调用 videoAdapter.pollVideoTask()，更新数据库，返回汇总结果。
 *
 * 请求体（可选）：
 *   { maxConcurrent?: number }  — 并发轮询上限，默认 5
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; episodeId: string }> }
) {
  try {
    const { id: projectId, episodeId } = await params
    const body = await request.json().catch(() => ({})) as { maxConcurrent?: number }
    const maxConcurrent = Math.min(body.maxConcurrent || 5, 10)

    // 查找该项目 + episode 下所有非终态的远端视频任务
    const terminalStatuses = ['completed', 'succeeded', 'success', 'failed', 'error', 'cancelled']
    const pendingVideos = await prisma.shotVideo.findMany({
      where: {
        projectId,
        shot: { episodeId },
        remoteTaskId: { not: null },
        // remoteStatus 为空 或 不在终态列表中
        OR: [
          { remoteStatus: null },
          { remoteStatus: '' },
          { NOT: { remoteStatus: { in: terminalStatuses } } },
        ],
      },
    })

    if (pendingVideos.length === 0) {
      return NextResponse.json({
        success: true,
        data: { checked: 0, completed: 0, failed: 0, pending: 0, results: [] },
      })
    }

    // 获取项目的 modelProvider
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: { modelProvider: true },
    })
    if (!project) {
      return NextResponse.json({ success: false, error: '项目不存在' }, { status: 404 })
    }

    const videoAdapter = adapterFactory.getVideoAdapter(project.modelProvider)

    // 分批并发轮询
    const results: Array<{
      videoId: string
      remoteTaskId: string
      remoteStatus: string
      videoUrl?: string
      duration?: number
      error?: string
    }> = []

    let completed = 0
    let failed = 0
    let stillPending = 0

    for (let i = 0; i < pendingVideos.length; i += maxConcurrent) {
      const batch = pendingVideos.slice(i, i + maxConcurrent)
      const pollPromises = batch.map(async (video) => {
        try {
          const pollResult = await videoAdapter.pollVideoTask(video.remoteTaskId!)

          // 更新数据库
          const updateData: Record<string, unknown> = {
            remoteStatus: pollResult.status,
            remoteProgress: typeof pollResult.progress === 'number' ? Math.round(pollResult.progress) : null,
            remoteResponseJson: pollResult.response as object,
            lastPolledAt: new Date(),
          }
          if (pollResult.videoUrl) updateData.videoUrl = pollResult.videoUrl
          if (pollResult.duration) updateData.duration = pollResult.duration

          await prisma.shotVideo.update({
            where: { id: video.id },
            data: updateData,
          })

          const isCompleted = ['completed', 'succeeded', 'success'].includes(pollResult.status)
          const isFailed = ['failed', 'error', 'cancelled'].includes(pollResult.status)

          const result = {
            videoId: video.id,
            remoteTaskId: video.remoteTaskId!,
            remoteStatus: pollResult.status,
            videoUrl: pollResult.videoUrl || video.videoUrl || undefined,
            duration: pollResult.duration || video.duration || undefined,
            error: pollResult.error || undefined,
          }

          if (isCompleted) return { result, category: 'completed' as const }
          if (isFailed) return { result, category: 'failed' as const }
          return { result, category: 'pending' as const }
        } catch (err) {
          // 单个轮询失败不影响其他
          console.error(`[batch-check] poll failed for ${video.remoteTaskId}:`, err)
          return {
            result: {
              videoId: video.id,
              remoteTaskId: video.remoteTaskId!,
              remoteStatus: video.remoteStatus || 'unknown',
              error: (err as Error).message,
            },
            category: 'pending' as const,
          }
        }
      })

      const batchResults = await Promise.all(pollPromises)
      for (const br of batchResults) {
        results.push(br.result)
        if (br.category === 'completed') completed++
        else if (br.category === 'failed') failed++
        else stillPending++
      }
    }

    // 如果本轮有任务到达终态，检查是否所有该 episode 的视频都已终态
    // 无论成功还是失败，都应推进项目状态，避免用户永久卡住
    if (completed > 0 || failed > 0) {
      const allVideos = await prisma.shotVideo.findMany({
        where: { projectId, shot: { episodeId } },
      })
      const allDone = allVideos.every(v =>
        ['completed', 'succeeded', 'success', 'failed', 'error', 'cancelled'].includes(v.remoteStatus || '')
      )
      if (allDone) {
        const hasAnySuccess = allVideos.some(v =>
          ['completed', 'succeeded', 'success'].includes(v.remoteStatus || '')
        )
        // 只要有成功的就推进到 PENDING_CONFIRM；全部失败也推进，用户可重新生成
        await prisma.project.update({
          where: { id: projectId },
          data: { status: 'SHOT_VIDEO_PENDING_CONFIRM' },
        })
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        checked: results.length,
        completed,
        failed,
        pending: stillPending,
        results,
      },
    })
  } catch (error) {
    console.error('Failed to batch check video tasks:', error)
    return NextResponse.json({ success: false, error: '批量检查任务失败' }, { status: 500 })
  }
}
