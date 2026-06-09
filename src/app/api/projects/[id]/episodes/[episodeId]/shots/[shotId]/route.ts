import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'

/**
 * PATCH /api/projects/:id/episodes/:episodeId/shots/:shotId
 * 更新单个镜头
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; episodeId: string; shotId: string }> }
) {
  try {
    const { id: projectId, episodeId, shotId } = await params
    const body = await request.json()

    const existing = await prisma.shot.findFirst({ where: { id: shotId, episodeId, projectId } })
    if (!existing) {
      return NextResponse.json({ success: false, error: '镜头不存在' }, { status: 404 })
    }

    const updateData: Record<string, unknown> = {}
    const fieldMap: Record<string, string> = {
      shot_no: 'shotNo', shot_name: 'shotName',
      start_time: 'startTime', end_time: 'endTime',
      scene_time: 'sceneTime', location: 'location',
      characters: 'characters', action: 'action',
      camera: 'camera', visual: 'visual',
      emotion: 'emotion', sfx: 'sfx', bgm: 'bgm',
      dialogue: 'dialogue', purpose: 'purpose',
      technical_notes: 'technicalNotes',
    }

    for (const [snake, camel] of Object.entries(fieldMap)) {
      if (body[snake] !== undefined) {
        const val = body[snake]
        updateData[camel] = typeof val === 'string' ? val : val
      }
    }

    const shot = await prisma.shot.update({ where: { id: shotId }, data: updateData })
    return NextResponse.json({ success: true, data: shot })
  } catch (error) {
    console.error('Failed to update shot:', error)
    return NextResponse.json({ success: false, error: '更新镜头失败' }, { status: 500 })
  }
}

/**
 * DELETE /api/projects/:id/episodes/:episodeId/shots/:shotId
 * 删除单个镜头
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; episodeId: string; shotId: string }> }
) {
  try {
    const { id: projectId, episodeId, shotId } = await params

    const existing = await prisma.shot.findFirst({ where: { id: shotId, episodeId, projectId } })
    if (!existing) {
      return NextResponse.json({ success: false, error: '镜头不存在' }, { status: 404 })
    }

    // 删除关联数据
    await prisma.imagePrompt.deleteMany({ where: { shotId } })
    await prisma.videoPrompt.deleteMany({ where: { shotId } })
    await prisma.shot.delete({ where: { id: shotId } })

    return NextResponse.json({ success: true, message: '镜头已删除' })
  } catch (error) {
    console.error('Failed to delete shot:', error)
    return NextResponse.json({ success: false, error: '删除镜头失败' }, { status: 500 })
  }
}
