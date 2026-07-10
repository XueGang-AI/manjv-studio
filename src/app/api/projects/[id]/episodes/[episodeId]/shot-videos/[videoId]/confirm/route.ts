import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import {
  analyzePersistedVideoVisualQuality,
  hasBlockingVisualIssues,
  toStoredVisualQuality,
} from '@/server/services/media-visual-qc.service'

type JsonValue = import('@prisma/client').Prisma.InputJsonValue

function mergeVisualQualityParams(params: unknown, visualQuality: ReturnType<typeof toStoredVisualQuality>): JsonValue {
  const base = params && typeof params === 'object' && !Array.isArray(params)
    ? params as Record<string, unknown>
    : {}
  return { ...base, visual_quality: visualQuality } as unknown as JsonValue
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; episodeId: string; videoId: string }> }
) {
  try {
    const { id: projectId, episodeId, videoId } = await params
    const video = await prisma.shotVideo.findFirst({ where: { id: videoId, projectId } })
    if (!video) return NextResponse.json({ success: false, error: '视频不存在' }, { status: 404 })
    if (!video.isSelected) return NextResponse.json({ success: false, error: '请先选择该视频' }, { status: 400 })
    if (!video.videoUrl) return NextResponse.json({ success: false, error: '视频尚未生成完成' }, { status: 400 })

    try {
      const visualQuality = await analyzePersistedVideoVisualQuality(
        video.storageObjectKey,
        video.videoUrl,
        { duration: video.duration, sampleIntervalSeconds: 1, maxSamples: 40 },
      )
      if (visualQuality) {
        const storedVisualQuality = toStoredVisualQuality(visualQuality)
        await prisma.shotVideo.update({
          where: { id: videoId },
          data: { params: mergeVisualQualityParams(video.params, storedVisualQuality) },
        })
        if (hasBlockingVisualIssues(visualQuality)) {
          return NextResponse.json({
            success: false,
            error: '视频片段存在大面积黑边或无效画面区域，请重生成后再确认',
            data: { videoId, shotId: video.shotId, visualQuality: storedVisualQuality },
          }, { status: 422 })
        }
      }
    } catch (error) {
      console.warn(`[shot-videos/confirm] visual QC unavailable for ${videoId}: ${(error as Error).message}`)
    }

    await prisma.shotVideo.updateMany({ where: { shotId: video.shotId, projectId, id: { not: videoId } }, data: { isConfirmed: false } })
    await prisma.shotVideo.update({ where: { id: videoId }, data: { isConfirmed: true } })

    const shots = await prisma.shot.findMany({ where: { episodeId, projectId } })
    let allConfirmed = true
    for (const shot of shots) {
      const has = await prisma.shotVideo.findFirst({ where: { shotId: shot.id, projectId, isConfirmed: true } })
      if (!has) { allConfirmed = false; break }
    }

    // Do not regress a later-stage project (e.g. re-confirm after render/release).
    const STATUS_RANK: Record<string, number> = {
      SHOT_VIDEO_PENDING_CONFIRM: 1,
      SHOT_VIDEO_CONFIRMED: 2,
      RENDERING: 3,
      RENDERED: 4,
      FINAL_CONFIRMED: 5,
    }
    const project = await prisma.project.findUnique({ where: { id: projectId }, select: { status: true } })
    const currentStatus = project?.status || 'SHOT_VIDEO_PENDING_CONFIRM'
    const nextStatus = allConfirmed ? 'SHOT_VIDEO_CONFIRMED' : 'SHOT_VIDEO_PENDING_CONFIRM'
    const shouldAdvanceStatus = (STATUS_RANK[nextStatus] || 0) >= (STATUS_RANK[currentStatus] || 0)
      || !STATUS_RANK[currentStatus]

    let projectStatus = currentStatus
    if (shouldAdvanceStatus && nextStatus !== currentStatus) {
      await prisma.project.update({ where: { id: projectId }, data: { status: nextStatus } })
      projectStatus = nextStatus
    }
    if (allConfirmed && shouldAdvanceStatus) {
      const { versionService: vs } = await import('@/server/services/version.service')
      await vs.createVersion({
        projectId, entityType: 'SHOT_VIDEO_SET', entityId: episodeId,
        snapshot: { project_status: projectStatus, confirmed_video_id: videoId },
        changeType: 'CONFIRM', description: '确认视频片段', isConfirmed: true,
      })
    }

    return NextResponse.json({
      success: true,
      data: {
        videoId,
        shotId: video.shotId,
        isConfirmed: true,
        allConfirmed,
        projectStatus,
      },
    })
  } catch (error) {
    console.error('Failed to confirm video:', error)
    return NextResponse.json({ success: false, error: '确认失败' }, { status: 500 })
  }
}
