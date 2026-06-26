import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { qcService } from '@/server/services/qc.service'

/**
 * POST /api/projects/:id/episodes/:episodeId/automation/auto-confirm
 * 规则 QC 达标后自动确认当前已有资产。
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; episodeId: string }> }
) {
  try {
    const { id: projectId, episodeId } = await params
    const body = await request.json().catch(() => ({}))
    const threshold = typeof body.threshold === 'number' ? body.threshold : 85

    const project = await prisma.project.findUnique({ where: { id: projectId } })
    if (!project) return NextResponse.json({ success: false, error: '项目不存在' }, { status: 404 })

    const episode = await prisma.episode.findFirst({ where: { id: episodeId, projectId } })
    if (!episode) return NextResponse.json({ success: false, error: '剧集不存在' }, { status: 404 })

    const qcResults = await qcService.runQC(projectId, episodeId)
    const gatedResults = qcResults.filter(result =>
      !result.summary.includes('暂无视频数据') &&
      !result.summary.includes('尚无成片') &&
      !result.summary.includes('未指定剧集')
    )
    const minScore = gatedResults.length ? Math.min(...gatedResults.map(result => result.score)) : 0
    const averageScore = qcResults.length
      ? Math.round(qcResults.reduce((sum, result) => sum + result.score, 0) / qcResults.length)
      : 0

    if (minScore < threshold) {
      return NextResponse.json({
        success: true,
        data: {
          confirmed: false,
          threshold,
          minScore,
          averageScore,
          qcResults,
          gatedResults,
          reason: 'QC 分数未达到自动确认阈值',
        },
      })
    }

    const characterImages = await confirmCharacterImages(projectId)
    const shotImages = await confirmShotImages(projectId, episodeId)
    const shotVideos = await confirmShotVideos(projectId, episodeId)

    return NextResponse.json({
      success: true,
      data: {
        confirmed: true,
        threshold,
        minScore,
        averageScore,
        qcResults,
        gatedResults,
        characterImages,
        shotImages,
        shotVideos,
      },
    })
  } catch (error) {
    console.error('Failed to auto-confirm episode:', error)
    return NextResponse.json({ success: false, error: '自动确认失败' }, { status: 500 })
  }
}

async function confirmCharacterImages(projectId: string) {
  const characters = await prisma.character.findMany({
    where: { projectId, confirmed: true },
    select: { id: true },
  })

  let confirmed = 0
  let missing = 0

  for (const character of characters) {
    let target = await prisma.characterImage.findFirst({
      where: { projectId, characterId: character.id, isConfirmed: true },
    })
    if (!target) {
      target = await prisma.characterImage.findFirst({
        where: { projectId, characterId: character.id, isSelected: true },
        orderBy: { createdAt: 'desc' },
      })
    }
    if (!target) {
      target = await prisma.characterImage.findFirst({
        where: { projectId, characterId: character.id },
        orderBy: { createdAt: 'asc' },
      })
    }
    if (!target) {
      missing++
      continue
    }

    await prisma.characterImage.update({
      where: { id: target.id },
      data: { isSelected: true, isConfirmed: true, isPrimary: target.referenceType === 'front_full_body' || target.isPrimary },
    })
    confirmed++
  }

  if (characters.length > 0 && missing === 0) {
    await prisma.project.updateMany({
      where: { id: projectId, status: { in: ['CHARACTER_IMAGE_GENERATING', 'CHARACTER_IMAGE_PENDING_CONFIRM'] } },
      data: { status: 'CHARACTER_IMAGE_CONFIRMED' },
    })
  }

  return { confirmed, missing, total: characters.length }
}

async function confirmShotImages(projectId: string, episodeId: string) {
  const shots = await prisma.shot.findMany({
    where: { projectId, episodeId },
    select: { id: true, shotNo: true },
    orderBy: { shotNo: 'asc' },
  })

  let confirmed = 0
  let missing = 0

  for (const shot of shots) {
    let target = await prisma.shotImage.findFirst({
      where: { projectId, shotId: shot.id, isConfirmed: true },
    })
    if (!target) {
      target = await prisma.shotImage.findFirst({
        where: { projectId, shotId: shot.id, isSelected: true },
        orderBy: { createdAt: 'desc' },
      })
    }
    if (!target) {
      target = await prisma.shotImage.findFirst({
        where: { projectId, shotId: shot.id },
        orderBy: { createdAt: 'asc' },
      })
    }
    if (!target) {
      missing++
      continue
    }

    await prisma.shotImage.updateMany({
      where: { projectId, shotId: shot.id, id: { not: target.id } },
      data: { isSelected: false, isConfirmed: false },
    })
    await prisma.shotImage.update({
      where: { id: target.id },
      data: { isSelected: true, isConfirmed: true },
    })
    confirmed++
  }

  if (shots.length > 0 && missing === 0) {
    await prisma.project.updateMany({
      where: { id: projectId, status: { in: ['STORYBOARD_CONFIRMED', 'SHOT_IMAGE_GENERATING', 'SHOT_IMAGE_PENDING_CONFIRM'] } },
      data: { status: 'SHOT_IMAGE_CONFIRMED' },
    })
  }

  return { confirmed, missing, total: shots.length }
}

async function confirmShotVideos(projectId: string, episodeId: string) {
  const shots = await prisma.shot.findMany({
    where: { projectId, episodeId },
    select: { id: true, shotNo: true },
    orderBy: { shotNo: 'asc' },
  })

  let confirmed = 0
  let missing = 0

  for (const shot of shots) {
    let target = await prisma.shotVideo.findFirst({
      where: { projectId, shotId: shot.id, isConfirmed: true },
    })
    if (!target) {
      target = await prisma.shotVideo.findFirst({
        where: { projectId, shotId: shot.id, isSelected: true, videoUrl: { not: '' } },
        orderBy: { createdAt: 'desc' },
      })
    }
    if (!target) {
      target = await prisma.shotVideo.findFirst({
        where: { projectId, shotId: shot.id, videoUrl: { not: '' } },
        orderBy: { createdAt: 'asc' },
      })
    }
    if (!target) {
      missing++
      continue
    }

    await prisma.shotVideo.updateMany({
      where: { projectId, shotId: shot.id, id: { not: target.id } },
      data: { isSelected: false, isConfirmed: false },
    })
    await prisma.shotVideo.update({
      where: { id: target.id },
      data: { isSelected: true, isConfirmed: true },
    })
    confirmed++
  }

  if (shots.length > 0 && missing === 0) {
    await prisma.project.updateMany({
      where: { id: projectId, status: { in: ['SHOT_VIDEO_GENERATING', 'SHOT_VIDEO_PENDING_CONFIRM'] } },
      data: { status: 'SHOT_VIDEO_CONFIRMED' },
    })
  }

  return { confirmed, missing, total: shots.length }
}
