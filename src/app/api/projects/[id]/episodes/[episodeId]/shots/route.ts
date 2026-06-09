import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'

/**
 * POST /api/projects/:id/episodes/:episodeId/shots
 * 新增一个镜头
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; episodeId: string }> }
) {
  try {
    const { id: projectId, episodeId } = await params
    const body = await request.json()

    const episode = await prisma.episode.findFirst({ where: { id: episodeId, projectId } })
    if (!episode) {
      return NextResponse.json({ success: false, error: '剧集不存在' }, { status: 404 })
    }

    // 获取最大 shot_no
    const lastShot = await prisma.shot.findFirst({
      where: { episodeId },
      orderBy: { shotNo: 'desc' },
    })
    const nextNo = (lastShot?.shotNo || 0) + 1

    const shot = await prisma.shot.create({
      data: {
        episodeId, projectId,
        shotNo: body.shot_no || nextNo,
        shotName: body.shot_name || `镜头 ${nextNo}`,
        startTime: body.start_time || 0,
        endTime: body.end_time || 10,
        sceneTime: body.scene_time || '',
        location: body.location || '',
        characters: body.characters || [],
        action: body.action || '',
        camera: body.camera || {},
        visual: body.visual || {},
        emotion: body.emotion || '',
        sfx: body.sfx || '',
        bgm: body.bgm || '',
        dialogue: body.dialogue || '',
        purpose: body.purpose || '',
      },
    })

    return NextResponse.json({ success: true, data: shot }, { status: 201 })
  } catch (error) {
    console.error('Failed to add shot:', error)
    return NextResponse.json({ success: false, error: '新增镜头失败' }, { status: 500 })
  }
}
