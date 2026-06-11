import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { adapterFactory } from '@/server/model-adapters/adapter.factory'
import type { VideoGenerationRequest } from '@/server/model-adapters/types'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; episodeId: string; shotId: string }> }
) {
  try {
    const { id: projectId, episodeId, shotId } = await params
    const shot = await prisma.shot.findFirst({ where: { id: shotId, episodeId, projectId } })
    if (!shot) return NextResponse.json({ success: false, error: '镜头不存在' }, { status: 404 })

    const project = await prisma.project.findUnique({ where: { id: projectId } })
    const vidPrompt = await prisma.videoPrompt.findFirst({ where: { shotId }, orderBy: { createdAt: 'desc' } })
    const confirmedImage = await prisma.shotImage.findFirst({ where: { shotId, isConfirmed: true } })

    await prisma.shotVideo.deleteMany({ where: { shotId, projectId } })

    const duration = Math.min((shot.endTime || 10) - (shot.startTime || 0), 15)
    const genReq: VideoGenerationRequest = {
      taskType: 'image_to_video',
      prompt: vidPrompt?.prompt || '',
      inputImage: confirmedImage?.imageUrl || undefined,
      duration,
      aspectRatio: (project?.aspectRatio || '9:16') as '9:16',
      motionStrength: (vidPrompt?.motionStrength as 'low'|'medium'|'high') || 'medium',
      fps: 24,
      voiceText: (shot.dialogue as string) || undefined,
      generateAudio: true,
    }

    const response = await adapterFactory.getVideoAdapter().generate(genReq)
    const created = await Promise.all(response.videos.map(v =>
      prisma.shotVideo.create({
        data: {
          shotId, projectId, inputImageUrl: confirmedImage?.imageUrl || '',
          videoUrl: v.url, prompt: vidPrompt?.prompt || '',
          seed: String(v.params?.seed || ''),
          modelName: process.env.AGNES_VIDEO_MODEL || 'Agnes-Video-2.0',
          referenceImages: confirmedImage ? [{ image_url: confirmedImage.imageUrl }] : [],
          duration: v.duration || duration,
          params: { aspect_ratio: project?.aspectRatio },
          isSelected: false, isConfirmed: false,
        },
      })
    ))

    return NextResponse.json({ success: true, data: { shotId, videos: created, count: created.length } })
  } catch (error) {
    console.error('Failed to regenerate videos:', error)
    return NextResponse.json({ success: false, error: '重新生成失败' }, { status: 500 })
  }
}
