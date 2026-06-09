import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { ffmpegService } from '@/server/services/ffmpeg.service'
import path from 'path'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; episodeId: string }> }
) {
  try {
    const { id: projectId, episodeId } = await params

    const project = await prisma.project.findUnique({ where: { id: projectId } })
    if (!project) return NextResponse.json({ success: false, error: '项目不存在' }, { status: 404 })

    const episode = await prisma.episode.findFirst({ where: { id: episodeId, projectId } })
    if (!episode) return NextResponse.json({ success: false, error: '剧集不存在' }, { status: 404 })

    // 获取所有已确认的视频片段
    const shots = await prisma.shot.findMany({
      where: { episodeId, projectId },
      orderBy: { shotNo: 'asc' },
      include: {
        shotVideos: { where: { isConfirmed: true } },
      },
    })

    const confirmedVideos = shots.flatMap(s => s.shotVideos)
    if (confirmedVideos.length === 0) {
      return NextResponse.json({ success: false, error: '没有已确认的视频片段' }, { status: 400 })
    }

    // 更新状态
    await prisma.project.update({ where: { id: projectId }, data: { status: 'RENDERING' } })

    const task = await prisma.generationTask.create({
      data: { projectId, episodeId, taskType: 'RENDER_FINAL_VIDEO',
        modelName: 'FFmpeg', status: 'running', input: { shot_count: confirmedVideos.length } },
    })

    try {
      const ffAvailable = await ffmpegService.checkAvailable()
      const outputFileName = `${projectId}_ep${episode.episodeNo}_${Date.now()}.mp4`
      const outputPath = path.join(ffmpegService['outputDir'], outputFileName)
      const aspectRatio = project.aspectRatio || '9:16'

      let result: { success: boolean; outputPath?: string; duration?: number; error?: string }

      const hasRemoteUrls = confirmedVideos.some(v => v.videoUrl?.startsWith('http'))

      if (ffAvailable && confirmedVideos.length > 1 && !hasRemoteUrls) {
        // 真实 FFmpeg 拼接本地文件
        result = await ffmpegService.concatVideos({
          shotVideos: confirmedVideos.map(v => ({
            videoUrl: v.videoUrl || '',
            duration: v.duration || 5,
          })),
          outputFileName,
          aspectRatio,
          fps: 25,
          addFadeTransition: true,
        })
      } else if (ffAvailable) {
        // 单视频或 Mock：生成占位视频
        result = await ffmpegService.generatePlaceholder(
          outputPath,
          episode.duration || confirmedVideos[0]?.duration || 90,
          aspectRatio,
        )
      } else {
        // FFmpeg 不可用，直接使用第一个视频
        result = { success: true, outputPath: confirmedVideos[0]?.videoUrl || '', duration: confirmedVideos[0]?.duration || 5 }
      }

      if (!result.success) {
        throw new Error(result.error || '渲染失败')
      }

      // 保存记录
      const finalVideo = await prisma.finalVideo.create({
        data: {
          episodeId, projectId,
          videoUrl: result.outputPath || '',
          duration: result.duration,
          aspectRatio,
          fps: 25,
          status: 'READY',
        },
      })

      // 更新项目状态
      await prisma.project.update({ where: { id: projectId }, data: { status: 'RENDERED' } })

      const { versionService: vs } = await import('@/server/services/version.service')
      await vs.createVersion({
        projectId, entityType: 'FINAL_VIDEO', entityId: finalVideo.id,
        snapshot: { final_video_id: finalVideo.id, duration: result.duration, project_status: 'RENDERED' },
        changeType: 'GENERATE', description: '合成最终成片', sourceTaskId: task.id,
      })
      await prisma.generationTask.update({
        where: { id: task.id },
        data: { status: 'success', output: { final_video_id: finalVideo.id, duration: result.duration } },
      })

      return NextResponse.json({
        success: true,
        data: {
          finalVideo,
          shotsUsed: confirmedVideos.length,
          duration: result.duration,
        },
      })
    } catch (genError) {
      const msg = (genError as Error).message
      await prisma.project.update({ where: { id: projectId }, data: { status: 'SHOT_VIDEO_CONFIRMED' } })
      await prisma.generationTask.update({ where: { id: task.id }, data: { status: 'failed', errorMessage: msg } })
      return NextResponse.json({ success: false, error: msg }, { status: 500 })
    }
  } catch (error) {
    console.error('Failed to render final video:', error)
    return NextResponse.json({ success: false, error: '渲染失败' }, { status: 500 })
  }
}
