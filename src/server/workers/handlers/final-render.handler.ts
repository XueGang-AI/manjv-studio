// ============================================
// FFmpeg Worker Handler — 最终成片合成
// ============================================
//
// 从 API Route 迁移到 Worker 的 FFmpeg 执行逻辑。
// 负责：加载已确认视频 → FFmpeg concat → 保存 FinalVideo → 更新项目状态
//
// 安全约束与原 API Route 一致：
// - FFmpeg 使用 spawn + 参数数组
// - 远程 URL 先下载再合成
// - ffprobe 预校验
// - 错误脱敏

import prisma from '@/lib/prisma'
import { ffmpegService, sanitizeError, RenderError } from '@/server/services/ffmpeg.service'
import { taskService } from '@/server/queues/task-queue.service'
import { emitTaskEvent, taskToUpdateEvent } from '../task-events'

export interface FinalRenderInput {
  episodeId: string
  aspectRatio?: string
}

/**
 * 执行最终成片合成
 *
 * 从 GenerationTask.input 读取参数，执行 FFmpeg 合成，更新数据库。
 * 成功或失败都会更新 task 状态并推送事件。
 */
export async function handleFinalRender(taskId: string): Promise<void> {
  // 幂等性检查：已完成任务不重复执行
  const existingTask = await prisma.generationTask.findUnique({ where: { id: taskId } })
  if (!existingTask) throw new Error('任务不存在')
  if (existingTask.status === 'success') {
    console.log(`[worker] Task ${taskId} already completed, skipping`)
    return
  }
  if (existingTask.status !== 'pending' && existingTask.status !== 'running' && existingTask.status !== 'retrying') {
    console.log(`[worker] Task ${taskId} in status ${existingTask.status}, skipping`)
    return
  }

  const task = await taskService.startTask(taskId)

  try {
    const input = (task.input || {}) as Record<string, unknown>
    const episodeId = input.episodeId as string
    const projectId = task.projectId
    const aspectRatio = (input.aspectRatio as string) || '9:16'

    if (!episodeId) {
      throw new Error('缺少 episodeId')
    }

    const project = await prisma.project.findUnique({ where: { id: projectId } })
    if (!project) throw new Error('项目不存在')

    const episode = await prisma.episode.findFirst({ where: { id: episodeId, projectId } })
    if (!episode) throw new Error('剧集不存在')

    // 加载所有已确认视频
    const shots = await prisma.shot.findMany({
      where: { episodeId, projectId },
      orderBy: { shotNo: 'asc' },
      include: { shotVideos: { where: { isConfirmed: true } } },
    })

    const confirmedVideos = shots.flatMap(s => s.shotVideos)
    if (confirmedVideos.length === 0) {
      throw new Error('没有已确认的视频片段')
    }

    // 更新项目状态
    await prisma.project.update({ where: { id: projectId }, data: { status: 'RENDERING' } })

    await emitTaskEvent('task.running', taskToUpdateEvent(task))

    // 进度回调：更新 task progress
    const updateProgress = async (progress: number) => {
      await taskService.updateProgress(taskId, progress)
      const updated = await prisma.generationTask.findUnique({ where: { id: taskId } })
      if (updated) {
        await emitTaskEvent('task.progress', taskToUpdateEvent(updated))
      }
    }

    await updateProgress(5)

    // 检查 FFmpeg 可用性
    const ffAvailable = await ffmpegService.checkAvailable()
    const outputFileName = `${projectId}_ep${episode.episodeNo}_${Date.now()}.mp4`

    let result: { success: boolean; outputPath?: string; duration?: number; error?: string }

    if (ffAvailable) {
      await updateProgress(10)
      result = await ffmpegService.concatVideos({
        shotVideos: confirmedVideos.map(v => ({
          videoUrl: v.videoUrl || '',
          duration: v.duration || 5,
        })),
        outputFileName,
        aspectRatio,
        fps: 25,
        addFadeTransition: confirmedVideos.length > 1,
      })
    } else {
      result = {
        success: true,
        outputPath: confirmedVideos[0]?.videoUrl || '',
        duration: confirmedVideos[0]?.duration || 5,
      }
    }

    if (!result.success) {
      throw new RenderError('RENDER_FAILED', result.error || '渲染失败')
    }

    await updateProgress(90)

    // 幂等性检查：是否已有成功产出的 FinalVideo
    const existingOutput = (task.output || {}) as Record<string, unknown>
    if (existingOutput.final_video_id) {
      console.log(`[worker:final-render] Task ${taskId} already produced FinalVideo ${existingOutput.final_video_id}, skipping`)
      return
    }

    // 保存 FinalVideo 记录
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

    // 创建版本快照
    const { versionService: vs } = await import('@/server/services/version.service')
    await vs.createVersion({
      projectId, entityType: 'FINAL_VIDEO', entityId: finalVideo.id,
      snapshot: { final_video_id: finalVideo.id, duration: result.duration, project_status: 'RENDERED' },
      changeType: 'GENERATE', description: '合成最终成片', sourceTaskId: taskId,
    })

    // 标记任务成功
    const completed = await taskService.completeTask(taskId, {
      final_video_id: finalVideo.id,
      duration: result.duration,
    })

    await emitTaskEvent('task.completed', taskToUpdateEvent(completed))

  } catch (error) {
    const sanitized = sanitizeError(error)
    const internalMsg = error instanceof RenderError ? error.internalDetail : (error as Error).message

    console.error(`[worker:final-render] Task ${taskId} failed: code=${sanitized.code}, internal=${internalMsg}`)

    // 回退项目状态
    try {
      await prisma.project.update({
        where: { id: task.projectId },
        data: { status: 'SHOT_VIDEO_CONFIRMED' },
      })
    } catch {
      // 项目状态回退失败不阻塞任务失败记录
    }

    // 标记任务失败
    const failed = await taskService.failTask(taskId, internalMsg?.substring(0, 500) || sanitized.message)

    await emitTaskEvent('task.failed', taskToUpdateEvent(failed))
  }
}
