import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'

/**
 * GET /api/projects/:id/episodes/:episodeId/storyboard
 * 获取分镜脚本完整数据
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; episodeId: string }> }
) {
  try {
    const { id: projectId, episodeId } = await params

    const episode = await prisma.episode.findFirst({
      where: { id: episodeId, projectId },
      include: {
        shots: {
          orderBy: { shotNo: 'asc' },
          include: {
            imagePrompts: true,
            videoPrompts: true,
          },
        },
        voiceScripts: { take: 1, orderBy: { createdAt: 'desc' } },
      },
    })

    if (!episode) {
      return NextResponse.json({ success: false, error: '剧集不存在' }, { status: 404 })
    }

    return NextResponse.json({
      success: true,
      data: episode,
    })
  } catch (error) {
    console.error('Failed to fetch storyboard:', error)
    return NextResponse.json({ success: false, error: '获取分镜失败' }, { status: 500 })
  }
}

/**
 * PATCH /api/projects/:id/episodes/:episodeId/storyboard
 * 更新剧集基础信息
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; episodeId: string }> }
) {
  try {
    const { id: projectId, episodeId } = await params
    const body = await request.json()

    const existing = await prisma.episode.findFirst({ where: { id: episodeId, projectId } })
    if (!existing) {
      return NextResponse.json({ success: false, error: '剧集不存在' }, { status: 404 })
    }

    const updateData: Record<string, unknown> = {}
    const bodyMap: Record<string, string> = {
      title: 'title', duration: 'duration', core_task: 'coreTask',
      emotion_curve: 'emotionCurve', opening_hook: 'openingHook', ending_hook: 'endingHook',
    }

    for (const [snake, camel] of Object.entries(bodyMap)) {
      if (body[snake] !== undefined || body[camel] !== undefined) {
        updateData[camel] = body[snake] ?? body[camel]
      }
    }

    const updated = await prisma.episode.update({ where: { id: episodeId }, data: updateData })

    return NextResponse.json({ success: true, data: updated })
  } catch (error) {
    console.error('Failed to update episode:', error)
    return NextResponse.json({ success: false, error: '更新剧集失败' }, { status: 500 })
  }
}
