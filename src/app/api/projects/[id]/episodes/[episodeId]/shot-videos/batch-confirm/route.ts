import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import {
  analyzePersistedVideoVisualQuality,
  hasBlockingVisualIssues,
  toStoredVisualQuality,
} from '@/server/services/media-visual-qc.service'

type JsonValue = import('@prisma/client').Prisma.InputJsonValue

type ShotVideoCandidate = {
  id: string
  videoUrl: string | null
  storageObjectKey: string | null
  duration: number | null
  params: unknown
}

function mergeVisualQualityParams(params: unknown, visualQuality: ReturnType<typeof toStoredVisualQuality>): JsonValue {
  const base = params && typeof params === 'object' && !Array.isArray(params)
    ? params as Record<string, unknown>
    : {}
  return { ...base, visual_quality: visualQuality } as unknown as JsonValue
}

async function isShotVideoVisuallyUsable(candidate: ShotVideoCandidate): Promise<boolean> {
  if (!candidate.videoUrl) return false
  try {
    const visualQuality = await analyzePersistedVideoVisualQuality(
      candidate.storageObjectKey,
      candidate.videoUrl,
      { duration: candidate.duration, sampleIntervalSeconds: 1, maxSamples: 40 },
    )
    if (!visualQuality) return true
    const storedVisualQuality = toStoredVisualQuality(visualQuality)
    await prisma.shotVideo.update({
      where: { id: candidate.id },
      data: { params: mergeVisualQualityParams(candidate.params, storedVisualQuality) },
    })
    return !hasBlockingVisualIssues(visualQuality)
  } catch (error) {
    console.warn(`[shot-videos/batch-confirm] visual QC unavailable for ${candidate.id}: ${(error as Error).message}`)
    return true
  }
}

/**
 * POST /api/projects/:id/episodes/:episodeId/shot-videos/batch-confirm
 * 一键确认全部镜头视频 — 每个镜头确认其已选中的视频
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; episodeId: string }> }
) {
  try {
    const { id: projectId, episodeId } = await params

    const project = await prisma.project.findUnique({ where: { id: projectId } })
    if (!project) return NextResponse.json({ success: false, error: '项目不存在' }, { status: 404 })

    const shots = await prisma.shot.findMany({
      where: { episodeId, projectId },
      include: {
        shotVideos: { where: { isSelected: true }, take: 1 },
      },
    })

    if (shots.length === 0) {
      return NextResponse.json({ success: false, error: '没有镜头' }, { status: 400 })
    }

    let confirmedCount = 0
    let skippedCount = 0
    let blockedVisualQualityCount = 0

    for (const shot of shots) {
      const selected = shot.shotVideos[0]
      if (!selected) {
        skippedCount++
        continue
      }
      if (selected.isConfirmed) {
        skippedCount++
        continue
      }
      if (!selected.videoUrl) {
        skippedCount++
        continue
      }
      if (!await isShotVideoVisuallyUsable(selected)) {
        blockedVisualQualityCount++
        skippedCount++
        continue
      }

      // 取消该镜头其他视频的确认状态，确认当前选中的
      await prisma.shotVideo.updateMany({
        where: { shotId: shot.id, projectId, id: { not: selected.id } },
        data: { isConfirmed: false },
      })
      await prisma.shotVideo.update({
        where: { id: selected.id },
        data: { isConfirmed: true },
      })
      confirmedCount++
    }

    // 更新项目状态
    if (confirmedCount > 0 && blockedVisualQualityCount === 0 && confirmedCount + skippedCount === shots.length) {
      await prisma.project.update({
        where: { id: projectId },
        data: { status: 'SHOT_VIDEO_CONFIRMED' },
      })

      const { versionService: vs } = await import('@/server/services/version.service')
      await vs.createVersion({
        projectId,
        entityType: 'SHOT_VIDEO_SET',
        entityId: episodeId,
        snapshot: { project_status: 'SHOT_VIDEO_CONFIRMED', confirmed_count: confirmedCount },
        changeType: 'CONFIRM',
        description: `批量确认 ${confirmedCount} 个视频片段`,
        isConfirmed: true,
      })
    }

    return NextResponse.json({
      success: true,
      data: {
        confirmed: confirmedCount,
        skipped: skippedCount,
        blockedVisualQuality: blockedVisualQualityCount,
        total: shots.length,
        projectStatus: blockedVisualQualityCount === 0 && confirmedCount + skippedCount === shots.length
          ? 'SHOT_VIDEO_CONFIRMED'
          : 'SHOT_VIDEO_PENDING_CONFIRM',
      },
    })
  } catch (error) {
    console.error('Failed to batch confirm videos:', error)
    return NextResponse.json({ success: false, error: '批量确认失败' }, { status: 500 })
  }
}
