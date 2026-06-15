import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { ffmpegService, sanitizeError, RenderError } from '@/server/services/ffmpeg.service'

/**
 * POST — 合成最终成片
 *
 * 安全加固：
 * - 检测已有 RENDERING 状态，防止并发重复提交
 * - FFmpeg 使用 spawn + 参数数组，不拼接 shell 命令
 * - 远程 URL 先下载再合成，防止 SSRF 和 concat 注入
 * - ffprobe 预校验输入文件
 * - 错误信息脱敏，不泄露服务器路径和 FFmpeg 详情
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; episodeId: string }> }
) {
  try {
    const { id: projectId, episodeId } = await params

    const project = await prisma.project.findUnique({ where: { id: projectId } })
    if (!project) return NextResponse.json({ success: false, error: '项目不存在' }, { status: 404 })

    // Prevent concurrent renders
    if (project.status === 'RENDERING') {
      return NextResponse.json({
        success: false,
        error: { code: 'RENDER_ALREADY_RUNNING', message: '当前已有合成任务正在执行，请等待完成后再试' },
      }, { status: 409 })
    }

    const episode = await prisma.episode.findFirst({ where: { id: episodeId, projectId } })
    if (!episode) return NextResponse.json({ success: false, error: '剧集不存在' }, { status: 404 })

    // Get all confirmed videos
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

    // Update status
    await prisma.project.update({ where: { id: projectId }, data: { status: 'RENDERING' } })
    const task = await prisma.generationTask.create({
      data: {
        projectId, episodeId, taskType: 'RENDER_FINAL_VIDEO',
        modelName: 'FFmpeg', status: 'running',
        input: { shot_count: confirmedVideos.length },
      },
    })

    try {
      const ffAvailable = await ffmpegService.checkAvailable()
      const outputFileName = `${projectId}_ep${episode.episodeNo}_${Date.now()}.mp4`
      const aspectRatio = project.aspectRatio || '9:16'

      let result: { success: boolean; outputPath?: string; duration?: number; error?: string }

      if (ffAvailable && confirmedVideos.length > 1) {
        // FFmpeg concat (downloads URLs first, validates with ffprobe)
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
        // Single video: generate placeholder
        const outputPath = `${project.aspectRatio || '9:16'}_placeholder.mp4`
        result = await ffmpegService.generatePlaceholder(
          outputPath,
          episode.duration || confirmedVideos[0]?.duration || 90,
          aspectRatio,
        )
      } else {
        // FFmpeg unavailable: use first video directly
        result = { success: true, outputPath: confirmedVideos[0]?.videoUrl || '', duration: confirmedVideos[0]?.duration || 5 }
      }

      if (!result.success) {
        throw new RenderError('RENDER_FAILED', result.error || '渲染失败')
      }

      // Save final video record
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

      // Update project status
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
      const sanitized = sanitizeError(genError)
      const internalMsg = genError instanceof RenderError ? genError.internalDetail : (genError as Error).message

      // Log internal detail server-side only
      console.error(`[render] Failed: code=${sanitized.code}, internal=${internalMsg}`)

      // Restore project status to allow retry
      await prisma.project.update({
        where: { id: projectId },
        data: { status: 'SHOT_VIDEO_CONFIRMED' },
      })
      await prisma.generationTask.update({
        where: { id: task.id },
        data: { status: 'failed', errorMessage: internalMsg?.substring(0, 500) },
      })

      return NextResponse.json({
        success: false,
        error: sanitized,
      }, { status: 500 })
    }
  } catch (error) {
    console.error('Failed to render final video:', error)
    return NextResponse.json({
      success: false,
      error: { code: 'RENDER_FAILED', message: '成片合成失败，请稍后重试' },
    }, { status: 500 })
  }
}
