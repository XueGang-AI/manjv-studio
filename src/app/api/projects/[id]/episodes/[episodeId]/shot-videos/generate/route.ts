import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { adapterFactory } from '@/server/model-adapters/adapter.factory'
import type { VideoGenerationRequest } from '@/server/model-adapters/types'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; episodeId: string }> }
) {
  try {
    const { id: projectId, episodeId } = await params

    const project = await prisma.project.findUnique({ where: { id: projectId } })
    if (!project) return NextResponse.json({ success: false, error: '项目不存在' }, { status: 404 })

    const episode = await prisma.episode.findFirst({ where: { id: episodeId, projectId } })
    if (!episode || !episode.confirmed) {
      return NextResponse.json({ success: false, error: '请先确认分镜脚本' }, { status: 400 })
    }

    const shots = await prisma.shot.findMany({
      where: { episodeId, projectId },
      orderBy: { shotNo: 'asc' },
      include: {
        videoPrompts: { take: 1, orderBy: { createdAt: 'desc' } },
        shotImages: { where: { isConfirmed: true }, take: 1 },
      },
    })

    if (shots.length === 0) return NextResponse.json({ success: false, error: '没有镜头' }, { status: 400 })

    // 检查所有镜头都有确认图
    const missingImages = shots.filter(s => !s.shotImages[0])
    if (missingImages.length > 0) {
      return NextResponse.json({
        success: false,
        error: `镜头 #${missingImages.map(s => s.shotNo).join(', ')} 缺少已确认的分镜图`,
      }, { status: 400 })
    }

    await prisma.project.update({ where: { id: projectId }, data: { status: 'SHOT_VIDEO_GENERATING' } })
    const task = await prisma.generationTask.create({
      data: { projectId, episodeId, taskType: 'GENERATE_SHOT_VIDEOS',
        modelName: process.env.AGNES_VIDEO_MODEL || 'Agnes-Video-2.0', status: 'running',
        input: { shot_count: shots.length } },
    })

    try {
      const videoAdapter = adapterFactory.getVideoAdapter()
      const aspectRatio = (project.aspectRatio || '9:16') as '9:16'
      const allResults: Array<{ shotId: string; shotNo: number; videos: unknown[] }> = []

      for (const shot of shots) {
        const vidPrompt = shot.videoPrompts[0]
        const confirmedImage = shot.shotImages[0]
        const prompt = vidPrompt?.prompt || ''
        const duration = (shot.endTime || 10) - (shot.startTime || 0)

        const genReq: VideoGenerationRequest = {
          taskType: 'image_to_video',
          prompt,
          inputImage: confirmedImage?.imageUrl || undefined,
          duration: Math.min(duration, 15),
          aspectRatio,
          motionStrength: (vidPrompt?.motionStrength as 'low' | 'medium' | 'high') || 'medium',
          fps: 24,
        }

        const response = await videoAdapter.generate(genReq)

        const created = await Promise.all(response.videos.map(v =>
          prisma.shotVideo.create({
            data: {
              shotId: shot.id, projectId,
              inputImageUrl: confirmedImage?.imageUrl || '',
              videoUrl: v.url, prompt,
              seed: String(v.params?.seed || ''),
              modelName: process.env.AGNES_VIDEO_MODEL || 'Agnes-Video-2.0',
              referenceImages: confirmedImage ? [{ image_url: confirmedImage.imageUrl }] : [],
              duration: v.duration || duration,
              params: { ...v.params, aspect_ratio: aspectRatio },
              isSelected: false, isConfirmed: false,
            },
          })
        ))

        allResults.push({ shotId: shot.id, shotNo: shot.shotNo, videos: created })
      }

      await prisma.project.update({ where: { id: projectId }, data: { status: 'SHOT_VIDEO_PENDING_CONFIRM' } })
      const { versionService: vs } = await import('@/server/services/version.service')
      await vs.createVersion({
        projectId, entityType: 'SHOT_VIDEO_SET', entityId: episodeId,
        snapshot: { total_videos: allResults.reduce((s,r)=>s+r.videos.length,0), project_status: 'SHOT_VIDEO_PENDING_CONFIRM' },
        changeType: 'GENERATE', description: `生成 ${shots.length} 个镜头视频`, sourceTaskId: task.id,
      })
      await prisma.generationTask.update({
        where: { id: task.id },
        data: { status: 'success', output: { total_videos: allResults.reduce((s, r) => s + r.videos.length, 0) } },
      })

      return NextResponse.json({ success: true, data: { shots: allResults, totalVideos: allResults.reduce((s, r) => s + r.videos.length, 0) } })
    } catch (genError) {
      const msg = (genError as Error).message
      await prisma.project.update({ where: { id: projectId }, data: { status: 'SHOT_IMAGE_CONFIRMED' } })
      await prisma.generationTask.update({ where: { id: task.id }, data: { status: 'failed', errorMessage: msg } })
      return NextResponse.json({ success: false, error: msg }, { status: 500 })
    }
  } catch (error) {
    console.error('Failed to generate videos:', error)
    return NextResponse.json({ success: false, error: '生成视频失败' }, { status: 500 })
  }
}
