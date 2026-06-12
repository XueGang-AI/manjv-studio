import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { adapterFactory } from '@/server/model-adapters/adapter.factory'
import { snapShotDuration } from '@/lib/utils'
import type { VideoGenerationRequest } from '@/server/model-adapters/types'

/**
 * POST — 重新创建单个镜头的视频任务（异步模式）
 * 与 generate 路由保持一致：创建远程异步任务 → 保存 remoteTaskId → 前端轮询
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; episodeId: string; shotId: string }> }
) {
  try {
    const { id: projectId, episodeId, shotId } = await params
    const shot = await prisma.shot.findFirst({ where: { id: shotId, episodeId, projectId } })
    if (!shot) return NextResponse.json({ success: false, error: '镜头不存在' }, { status: 404 })

    const project = await prisma.project.findUnique({ where: { id: projectId } })
    if (!project) return NextResponse.json({ success: false, error: '项目不存在' }, { status: 404 })

    const vidPrompt = await prisma.videoPrompt.findFirst({ where: { shotId }, orderBy: { createdAt: 'desc' } })
    const confirmedImage = await prisma.shotImage.findFirst({ where: { shotId, isConfirmed: true } })

    // 删除该镜头的旧视频记录
    await prisma.shotVideo.deleteMany({ where: { shotId, projectId } })

    const rawDuration = (shot.endTime || 10) - (shot.startTime || 0)
    // 按 provider 约束 snap duration，确保 DB 存储值与实际视频时长一致
    const duration = snapShotDuration(rawDuration, project.modelProvider)
    const modelProvider = project.modelProvider
    const modelName = modelProvider === 'ark'
      ? (process.env.ARK_VIDEO_MODEL || 'doubao-seedance-1-5-pro-251215')
      : (process.env.AGNES_VIDEO_MODEL || 'agnes-video-v2.0')
    const isMock = process.env.USE_MOCK_MODEL === 'true'

    const genReq: VideoGenerationRequest = {
      taskType: 'image_to_video',
      prompt: vidPrompt?.prompt || '',
      inputImage: confirmedImage?.imageUrl || undefined,
      duration,
      aspectRatio: (project.aspectRatio || '9:16') as '9:16',
      motionStrength: (vidPrompt?.motionStrength as 'low'|'medium'|'high') || 'medium',
      fps: 24,
      voiceText: (shot.dialogue as string) || undefined,
      generateAudio: true,
    }

    const videoAdapter = adapterFactory.getVideoAdapter(modelProvider)

    if (isMock) {
      // Mock 模式：同步生成
      const response = await videoAdapter.generate(genReq)
      const created = await Promise.all(response.videos.map(v =>
        prisma.shotVideo.create({
          data: {
            shotId, projectId, inputImageUrl: confirmedImage?.imageUrl || '',
            videoUrl: v.url, prompt: vidPrompt?.prompt || '',
            seed: String(v.params?.seed || ''),
            modelName,
            referenceImages: confirmedImage ? [{ image_url: confirmedImage.imageUrl }] : [],
            duration: v.duration || duration,
            params: { aspect_ratio: project.aspectRatio },
            isSelected: false, isConfirmed: false,
          },
        })
      ))
      return NextResponse.json({ success: true, data: { shotId, videos: created, count: created.length } })
    }

    // 真实模式：创建异步任务 + 保存 remote 状态
    const createResult = await videoAdapter.createVideoTask(genReq)

    const created = await prisma.shotVideo.create({
      data: {
        shotId, projectId,
        inputImageUrl: confirmedImage?.imageUrl || '',
        videoUrl: '',
        prompt: vidPrompt?.prompt || '',
        seed: '',
        modelName,
        referenceImages: confirmedImage ? [{ image_url: confirmedImage.imageUrl }] : [],
        duration,
        params: { aspect_ratio: project.aspectRatio, generation_method: 'async_task' },
        remoteTaskId: createResult.taskId,
        remoteStatus: createResult.status,
        remoteResponseJson: createResult.createResponse as Record<string, unknown>,
        lastPolledAt: new Date(),
        isSelected: false, isConfirmed: false,
      },
    })

    // 确保项目状态为 SHOT_VIDEO_GENERATING
    if (project.status !== 'SHOT_VIDEO_GENERATING') {
      await prisma.project.update({ where: { id: projectId }, data: { status: 'SHOT_VIDEO_GENERATING' } })
    }

    return NextResponse.json({
      success: true,
      data: { shotId, videos: [created], count: 1, isAsync: true },
    })
  } catch (error) {
    console.error('Failed to regenerate videos:', error)
    return NextResponse.json({ success: false, error: '重新生成失败' }, { status: 500 })
  }
}
