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
      data: {
        projectId, episodeId, taskType: 'GENERATE_SHOT_VIDEOS',
        modelName: process.env.AGNES_VIDEO_MODEL || 'Agnes-Video-2.0', status: 'running',
        input: { shot_count: shots.length },
      },
    })

    try {
      const videoAdapter = adapterFactory.getVideoAdapter()
      const aspectRatio = (project.aspectRatio || '9:16') as '9:16'
      const allResults: Array<{ shotId: string; shotNo: number; videos: unknown[] }> = []
      const isMock = process.env.USE_MOCK_MODEL === 'true'

      for (const shot of shots) {
        const vidPrompt = shot.videoPrompts[0]
        const confirmedImage = shot.shotImages[0]
        let prompt = vidPrompt?.prompt || ''

        // 后备 prompt：当 storyboard 未生成 video_prompt 时，从镜头数据构建
        if (!prompt.trim()) {
          const parts: string[] = []
          if (shot.action) parts.push(String(shot.action))
          if (shot.visual && typeof shot.visual === 'object') {
            const v = shot.visual as Record<string, unknown>
            if (v.description) parts.push(String(v.description))
            if (v.style) parts.push(String(v.style))
          }
          if (shot.camera && typeof shot.camera === 'object') {
            const c = shot.camera as Record<string, unknown>
            if (c.movement) parts.push(`Camera: ${c.movement}`)
            if (c.angle) parts.push(`Angle: ${c.angle}`)
          }
          if (shot.emotion) parts.push(`Mood: ${shot.emotion}`)
          if (shot.location) parts.push(`Location: ${shot.location}`)
          if (parts.length === 0) {
            parts.push('Cinematic slow push-in, gentle motion, Korean manhwa style, high quality, no text, no watermark')
          }
          prompt = parts.join('. ') + ', Korean manhwa style, cinematic lighting, smooth motion, no text, no watermark'
        }

        const duration = (shot.endTime || 10) - (shot.startTime || 0)

        const genReq: VideoGenerationRequest = {
          taskType: 'image_to_video',
          prompt,
          inputImage: confirmedImage?.imageUrl || undefined,
          duration: Math.min(duration, 15),
          aspectRatio,
          motionStrength: (vidPrompt?.motionStrength as 'low' | 'medium' | 'high') || 'medium',
          fps: 24,
          voiceText: (shot.dialogue as string) || undefined,
          generateAudio: !!(shot.dialogue),
        }

        // 真实模式：创建异步任务 + 保存 remote 状态
        if (!isMock) {
          const createResult = await videoAdapter.createVideoTask(genReq)

          const created = await Promise.all([
            // 第一候选：保存远端任务信息，等待轮询
            prisma.shotVideo.create({
              data: {
                shotId: shot.id, projectId,
                inputImageUrl: confirmedImage?.imageUrl || '',
                videoUrl: '', // 尚未完成
                prompt,
                seed: '',
                modelName: process.env.AGNES_VIDEO_MODEL || 'Agnes-Video-2.0',
                referenceImages: confirmedImage ? [{ image_url: confirmedImage.imageUrl }] : [],
                duration,
                params: { aspect_ratio: aspectRatio, generation_method: 'async_task' },
                remoteTaskId: createResult.taskId,
                remoteStatus: createResult.status,
                remoteResponseJson: createResult.createResponse,
                lastPolledAt: new Date(),
                isSelected: false, isConfirmed: false,
              },
            }),
            // 第二候选：同一个 task_id（Agnes Video 每次只返回一个 task）
            prisma.shotVideo.create({
              data: {
                shotId: shot.id, projectId,
                inputImageUrl: confirmedImage?.imageUrl || '',
                videoUrl: '',
                prompt,
                seed: '',
                modelName: process.env.AGNES_VIDEO_MODEL || 'Agnes-Video-2.0',
                referenceImages: confirmedImage ? [{ image_url: confirmedImage.imageUrl }] : [],
                duration,
                params: { aspect_ratio: aspectRatio, generation_method: 'async_task', is_duplicate: true },
                remoteTaskId: createResult.taskId,
                remoteStatus: createResult.status,
                remoteResponseJson: createResult.createResponse,
                lastPolledAt: new Date(),
                isSelected: false, isConfirmed: false,
              },
            }),
          ])

          allResults.push({ shotId: shot.id, shotNo: shot.shotNo, videos: created })
        } else {
          // Mock 模式：同步生成
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
      }

      // 项目状态更新
      const newStatus = isMock ? 'SHOT_VIDEO_PENDING_CONFIRM' : 'SHOT_VIDEO_GENERATING'
      await prisma.project.update({ where: { id: projectId }, data: { status: newStatus } })

      const { versionService: vs } = await import('@/server/services/version.service')
      await vs.createVersion({
        projectId, entityType: 'SHOT_VIDEO_SET', entityId: episodeId,
        snapshot: { total_videos: allResults.reduce((s, r) => s + r.videos.length, 0), project_status: newStatus, is_async: !isMock },
        changeType: 'GENERATE', description: `生成 ${shots.length} 个镜头视频${isMock ? '' : '(异步任务)'}`, sourceTaskId: task.id,
      })

      await prisma.generationTask.update({
        where: { id: task.id },
        data: { status: 'success', output: { total_videos: allResults.reduce((s, r) => s + r.videos.length, 0), is_async: !isMock } },
      })

      return NextResponse.json({
        success: true,
        data: {
          shots: allResults,
          totalVideos: allResults.reduce((s, r) => s + r.videos.length, 0),
          isAsync: !isMock,
          message: isMock ? undefined : '视频异步任务已创建，系统将自动轮询状态。您也可以稍后手动检查。',
        },
      })
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
