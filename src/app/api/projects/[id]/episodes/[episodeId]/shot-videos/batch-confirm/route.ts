import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'

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
    if (confirmedCount > 0 && confirmedCount + skippedCount === shots.length) {
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
        total: shots.length,
        projectStatus: confirmedCount + skippedCount === shots.length
          ? 'SHOT_VIDEO_CONFIRMED'
          : 'SHOT_VIDEO_PENDING_CONFIRM',
      },
    })
  } catch (error) {
    console.error('Failed to batch confirm videos:', error)
    return NextResponse.json({ success: false, error: '批量确认失败' }, { status: 500 })
  }
}
