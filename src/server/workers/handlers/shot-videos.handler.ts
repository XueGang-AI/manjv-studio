// ============================================
// Shot Videos Worker Handler — 视频片段生成
// ============================================
//
// 从 API Route 迁移到 Worker 的视频生成逻辑。
// 负责：加载镜头 → 调用视频适配器 → 保存 ShotVideo
//
// 支持 Mock 同步模式 和 真实异步模式（创建远端任务 + Worker 内轮询）

import prisma from '@/lib/prisma'
import { adapterFactory } from '@/server/model-adapters/adapter.factory'
import { getRuntimeModelName } from '@/server/model-adapters/model-config'
import { snapShotDuration } from '@/lib/utils'
import { taskService } from '@/server/queues/task-queue.service'
import { emitTaskEvent, taskToUpdateEvent } from '../task-events'
import { resolveImageUrlForModel, resolveStructuredReferenceImagesForModel } from '@/server/services/media-reference-url'
import type { VideoGenerationRequest } from '@/server/model-adapters/types'

type JsonValue = import('@prisma/client').Prisma.InputJsonValue

export interface ShotVideosInput {
  episodeId: string
}

type ShotVideoPromptContext = {
  shotNo: number
  shotName?: string | null
  action?: string | null
  details?: string | null
  camera?: unknown
  visual?: unknown
  emotion?: string | null
  location?: string | null
  sceneTime?: string | null
  dialogue?: string | null
}

/** 异步视频任务轮询间隔 (ms) */
const REMOTE_POLL_INTERVAL = 10_000
/** 异步视频任务轮询最大等待时间 (ms) — 30 分钟 */
const REMOTE_POLL_TIMEOUT = 30 * 60 * 1000
/** 异步视频任务终态 */
const TERMINAL_STATUSES = ['completed', 'succeeded', 'success', 'done', 'failed', 'error', 'cancelled', 'timeout']

/**
 * 执行视频片段生成
 */
export async function handleShotVideos(taskId: string): Promise<void> {
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
    const projectId = task.projectId
    const input = (task.input || {}) as Record<string, unknown>
    const episodeId = input.episodeId as string

    if (!episodeId) throw new Error('缺少 episodeId')

    const project = await prisma.project.findUnique({ where: { id: projectId } })
    if (!project) throw new Error('项目不存在')

    const episode = await prisma.episode.findFirst({ where: { id: episodeId, projectId } })
    if (!episode || !episode.confirmed) throw new Error('请先确认分镜脚本')

    const shots = await prisma.shot.findMany({
      where: { episodeId, projectId },
      orderBy: { shotNo: 'asc' },
      include: {
        videoPrompts: { take: 1, orderBy: { createdAt: 'desc' } },
        shotImages: { where: { isConfirmed: true }, take: 1 },
        shotVideos: { orderBy: { createdAt: 'desc' } },
      },
    })

    if (shots.length === 0) throw new Error('没有镜头')

    const missingImages = shots.filter(s => !s.shotImages[0])
    if (missingImages.length > 0) {
      throw new Error(`镜头 #${missingImages.map(s => s.shotNo).join(', ')} 缺少已确认的分镜图`)
    }

    // 更新项目状态
    await prisma.project.update({ where: { id: projectId }, data: { status: 'SHOT_VIDEO_GENERATING' } })
    await emitTaskEvent('task.running', taskToUpdateEvent(task))

    const videoAdapter = adapterFactory.getVideoAdapter(project.modelProvider)
    const aspectRatio = (project.aspectRatio || '9:16') as '9:16'
    const isMock = process.env.USE_MOCK_MODEL === 'true'

    // ─── 阶段 1：为每个镜头创建视频生成任务 ─────────────────────────
    //
    // 幂等性保护：
    // - 如果镜头已有 ShotVideo 且带 remoteTaskId，说明远端任务已提交
    // - 不重复提交远端任务，直接跳过该镜头
    // - Worker 重启后通过崩溃恢复重新领取，只提交缺少远端任务的镜头

    const allResults: Array<{ shotId: string; shotNo: number; videos: unknown[] }> = []

    for (let i = 0; i < shots.length; i++) {
      const shot = shots[i]

      // 幂等性保护：已有远端任务的镜头不重复提交
      const existingVideo = shot.shotVideos.find(sv => sv.remoteTaskId)
      if (existingVideo && !isMock) {
        console.log(`[worker:shot-videos] Shot #${shot.shotNo}: remote task ${existingVideo.remoteTaskId} already exists, skipping creation`)
        allResults.push({ shotId: shot.id, shotNo: shot.shotNo, videos: [existingVideo] })
        continue
      }

      const vidPrompt = shot.videoPrompts[0]
      const confirmedImage = shot.shotImages[0]
      let prompt = vidPrompt?.prompt || ''

      // 后备 prompt
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

      const modelName = getRuntimeModelName('video')
      const rawDuration = (shot.endTime || 10) - (shot.startTime || 0)
      const duration = snapShotDuration(rawDuration, modelName)

      // ─── 确定 inputImage URL（Phase 6+：智能回退）───
      // 优先级：
      //   1. imageUrl 为公网绝对 URL → 直接使用（生产 OSS/S3 签名 URL）
      //   2. imageUrl 为相对路径 → 尝试 sourceUrl（供应商原始 URL）
      //   3. sourceUrl 不可达 → 读取本地文件转 base64 data URI（Ark 支持）
      const inputImageUrl = await resolveImageUrlForModel({
        imageUrl: confirmedImage?.imageUrl,
        sourceUrl: confirmedImage?.sourceUrl,
        storageObjectKey: confirmedImage?.storageObjectKey,
      })
      const inheritedReferenceImages = Array.isArray(confirmedImage?.referenceImages)
        ? confirmedImage.referenceImages
        : []
      const referenceImageUrls = await resolveStructuredReferenceImagesForModel(inheritedReferenceImages, 4)
      const sentReferenceImageUrls = inputImageUrl ? [] : referenceImageUrls

      const motionStrength = normalizeMotionStrength(
        (vidPrompt?.motionStrength as 'low' | 'medium' | 'high') || 'medium',
        {
          shotNo: shot.shotNo,
          shotName: shot.shotName,
          action: shot.action,
          details: shot.details,
          camera: shot.camera,
          visual: shot.visual,
          emotion: shot.emotion,
          location: shot.location,
          sceneTime: shot.sceneTime,
          dialogue: shot.dialogue,
        },
      )
      prompt = buildSeedanceConsistencyPrompt(prompt, {
        shotNo: shot.shotNo,
        shotName: shot.shotName,
        action: shot.action,
        details: shot.details,
        camera: shot.camera,
        visual: shot.visual,
        emotion: shot.emotion,
        location: shot.location,
        sceneTime: shot.sceneTime,
        dialogue: shot.dialogue,
      }, duration, motionStrength)

      const negativePrompt = [
        vidPrompt?.negativePrompt,
        'identity change, face morphing, different hairstyle, different outfit, age change, unstable background, room layout change, camera cut, scene jump, extra main character, warped hands, bad fingers, body distortion, flickering, fake subtitles, garbled Chinese text, watermark, logo',
      ].filter(Boolean).join(', ')

      const genReq: VideoGenerationRequest = {
        taskType: 'image_to_video',
        prompt,
        negativePrompt,
        inputImage: inputImageUrl,
        referenceImages: sentReferenceImageUrls,
        duration,
        aspectRatio,
        motionStrength,
        fps: 24,
        voiceText: (shot.dialogue as string) || undefined,
        generateAudio: true,
      }

      if (!isMock) {
        // 真实模式：创建异步任务
        const createResult = await videoAdapter.createVideoTask(genReq)

        // 自动选中：若该镜头尚无已选/已确认视频，首个候选自动成为选中项
        const autoSelect = !shot.shotVideos.some(sv => sv.isSelected || sv.isConfirmed)

        const created = await prisma.shotVideo.create({
          data: {
            shotId: shot.id, projectId,
            inputImageUrl: confirmedImage?.imageUrl || '',
            videoUrl: '',
            prompt,
            seed: '',
            modelName,
            referenceImages: confirmedImage
              ? [{ image_url: confirmedImage.imageUrl, reference_type: 'input_image' }, ...inheritedReferenceImages] as unknown as JsonValue
              : [] as unknown as JsonValue,
            duration,
            params: {
              aspect_ratio: aspectRatio,
              generation_method: 'async_task',
              seedance_input_mode: inputImageUrl ? 'first_frame' : 'reference_media',
              available_reference_image_count: referenceImageUrls.length,
              sent_reference_image_count: sentReferenceImageUrls.length,
            } as unknown as JsonValue,
            remoteTaskId: createResult.taskId,
            remoteStatus: createResult.status,
            remoteResponseJson: createResult.createResponse as unknown as JsonValue,
            lastPolledAt: new Date(),
            isSelected: autoSelect, isConfirmed: false,
          },
        })

        allResults.push({ shotId: shot.id, shotNo: shot.shotNo, videos: [created] })
      } else {
        // Mock 模式：同步生成
        const response = await videoAdapter.generate(genReq)

        // 自动选中：首个候选，除非该镜头已有已选/已确认视频
        const autoSelect = !shot.shotVideos.some(sv => sv.isSelected || sv.isConfirmed)

        const created = await Promise.all(response.videos.map((v, idx) =>
          prisma.shotVideo.create({
            data: {
              shotId: shot.id, projectId,
              inputImageUrl: confirmedImage?.imageUrl || '',
              videoUrl: v.url, prompt,
              seed: String(v.params?.seed || ''),
              modelName,
              referenceImages: confirmedImage
                ? [{ image_url: confirmedImage.imageUrl, reference_type: 'input_image' }, ...inheritedReferenceImages] as unknown as JsonValue
                : [] as unknown as JsonValue,
              duration: v.duration || duration,
              params: {
                ...v.params,
                aspect_ratio: aspectRatio,
                seedance_input_mode: inputImageUrl ? 'first_frame' : 'reference_media',
                available_reference_image_count: referenceImageUrls.length,
                sent_reference_image_count: sentReferenceImageUrls.length,
              } as unknown as JsonValue,
              isSelected: idx === 0 && autoSelect, isConfirmed: false,
            },
          })
        ))

        allResults.push({ shotId: shot.id, shotNo: shot.shotNo, videos: created })
      }

      // 更新进度
      const progress = Math.round(((i + 1) / shots.length) * 50)
      await taskService.updateProgress(taskId, progress)
      const updated = await prisma.generationTask.findUnique({ where: { id: taskId } })
      if (updated) await emitTaskEvent('task.progress', taskToUpdateEvent(updated))
    }

    // ─── 阶段 2：Mock 模式直接完成；真实模式进入轮询 ───────────────

    if (isMock) {
      // Mock 模式：已完成
      await prisma.project.update({ where: { id: projectId }, data: { status: 'SHOT_VIDEO_PENDING_CONFIRM' } })

      const { versionService: vs } = await import('@/server/services/version.service')
      await vs.createVersion({
        projectId, entityType: 'SHOT_VIDEO_SET', entityId: episodeId,
        snapshot: { total_videos: allResults.reduce((s, r) => s + r.videos.length, 0), project_status: 'SHOT_VIDEO_PENDING_CONFIRM', is_async: false },
        changeType: 'GENERATE', description: `生成 ${shots.length} 个镜头视频`, sourceTaskId: taskId,
      })

      const completed = await taskService.completeTask(taskId, {
        total_videos: allResults.reduce((s, r) => s + r.videos.length, 0),
        is_async: false,
      })
      await emitTaskEvent('task.completed', taskToUpdateEvent(completed))
      return
    }

    // ─── 真实模式：轮询远端任务直到全部终态 ─────────────────────────

    await taskService.updateProgress(taskId, 55)
    const pollStart = Date.now()

    while (Date.now() - pollStart < REMOTE_POLL_TIMEOUT) {
      // 查找所有非终态的远端视频
      const pendingVideos = await prisma.shotVideo.findMany({
        where: {
          projectId,
          shot: { episodeId },
          remoteTaskId: { not: null },
          OR: [
            { remoteStatus: null },
            { remoteStatus: '' },
            { NOT: { remoteStatus: { in: TERMINAL_STATUSES } } },
          ],
        },
      })

      if (pendingVideos.length === 0) break // 全部完成

      // 批量轮询
      for (const video of pendingVideos) {
        try {
          const pollResult = await videoAdapter.pollVideoTask(video.remoteTaskId!)

          const updateData: Record<string, unknown> = {
            remoteStatus: pollResult.status,
            remoteProgress: typeof pollResult.progress === 'number' ? Math.round(pollResult.progress) : null,
            remoteResponseJson: pollResult.response as object,
            lastPolledAt: new Date(),
          }
          if (pollResult.videoUrl) updateData.videoUrl = pollResult.videoUrl
          if (pollResult.duration) updateData.duration = pollResult.duration

          await prisma.shotVideo.update({
            where: { id: video.id },
            data: updateData,
          })
        } catch (err) {
          console.error(`[worker:shot-videos] Poll failed for ${video.remoteTaskId}:`, err)
        }
      }

      // 计算进度
      const allVideos = await prisma.shotVideo.findMany({
        where: { projectId, shot: { episodeId } },
      })
      const doneCount = allVideos.filter(v => TERMINAL_STATUSES.includes(v.remoteStatus || '')).length
      const progress = Math.round(55 + (doneCount / allVideos.length) * 40)
      await taskService.updateProgress(taskId, progress)

      const taskNow = await prisma.generationTask.findUnique({ where: { id: taskId } })
      if (taskNow) await emitTaskEvent('task.progress', taskToUpdateEvent(taskNow))

      // 等待下次轮询
      await sleep(REMOTE_POLL_INTERVAL)
    }

    // 检查最终状态
    const finalVideos = await prisma.shotVideo.findMany({
      where: { projectId, shot: { episodeId } },
    })

    const allDone = finalVideos.every(v => TERMINAL_STATUSES.includes(v.remoteStatus || ''))
    const hasAnySuccess = finalVideos.some(v => ['completed', 'succeeded', 'success'].includes(v.remoteStatus || ''))

    if (allDone) {
      const newStatus = hasAnySuccess ? 'SHOT_VIDEO_PENDING_CONFIRM' : 'SHOT_VIDEO_GENERATING'
      await prisma.project.update({ where: { id: projectId }, data: { status: newStatus } })

      const { versionService: vs } = await import('@/server/services/version.service')
      await vs.createVersion({
        projectId, entityType: 'SHOT_VIDEO_SET', entityId: episodeId,
        snapshot: { total_videos: finalVideos.length, project_status: newStatus, is_async: true },
        changeType: 'GENERATE', description: `视频异步任务完成 (${finalVideos.length} 个)`, sourceTaskId: taskId,
      })

      const completed = await taskService.completeTask(taskId, {
        total_videos: finalVideos.length,
        is_async: true,
        all_done: allDone,
        has_success: hasAnySuccess,
      })
      await emitTaskEvent('task.completed', taskToUpdateEvent(completed))
    } else {
      // 超时但未全部完成
      await prisma.project.update({ where: { id: projectId }, data: { status: 'SHOT_VIDEO_GENERATING' } })
      const failed = await taskService.failTask(taskId, '视频生成超时，部分任务未完成')
      await emitTaskEvent('task.failed', taskToUpdateEvent(failed))
    }

  } catch (error) {
    const errorMsg = (error as Error).message
    console.error(`[worker:shot-videos] Task ${taskId} failed:`, errorMsg)

    try {
      await prisma.project.update({ where: { id: task.projectId }, data: { status: 'SHOT_IMAGE_CONFIRMED' } })
    } catch { /* ignore */ }

    const failed = await taskService.failTask(taskId, errorMsg)
    await emitTaskEvent('task.failed', taskToUpdateEvent(failed))
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function buildSeedanceConsistencyPrompt(
  basePrompt: string,
  shot: ShotVideoPromptContext,
  duration: number,
  motionStrength: 'low' | 'medium' | 'high',
): string {
  const cameraText = typeof shot.camera === 'object' && shot.camera ? JSON.stringify(shot.camera) : ''
  const visualText = typeof shot.visual === 'object' && shot.visual ? JSON.stringify(shot.visual) : ''
  const storyAction = shot.action || shot.details || basePrompt
  const dialogue = shot.dialogue ? `对白/旁白只表达为自然口型或音频，不要生成屏幕字幕：${shot.dialogue}` : '无屏幕字幕。'

  return [
    basePrompt,
    '',
    '[Seedance 一致性硬约束]',
    'Use the input image as the exact first frame and the only visual anchor. Preserve the same character identity, face shape, hairstyle, outfit, accessories, body proportions, lighting, color palette, and environment layout for the entire clip.',
    'Do not change the character into another person. Do not change hair, clothes, age, face, room structure, desk/screen positions, or background props. Do not add new main characters.',
    'No cutaway, no scene transition, no camera jump, no comic panels, no poster layout. Keep one continuous shot.',
    'Do not create readable on-screen text, fake subtitles, garbled Chinese characters, watermarks, or logos. If a screen is visible, show abstract UI blocks, warning icons, charts, or progress bars only.',
    '',
    '[镜头动作]',
    `镜头 #${shot.shotNo}${shot.shotName ? `：${shot.shotName}` : ''}，时长 ${duration}s，动作强度 ${motionStrength}。`,
    `地点：${[shot.location, shot.sceneTime].filter(Boolean).join(' · ') || '延续首帧场景'}。`,
    `动作：${storyAction}。情绪：${shot.emotion || '克制、清晰'}。`,
    `镜头：${cameraText || 'very subtle push-in or stable handheld micro motion'}。视觉：${visualText || 'stable cinematic manhwa frame'}。`,
    dialogue,
    'Motion should be subtle and readable: slight head turn, eye movement, breathing, hand movement, screen glow, gentle camera push-in. Avoid large body motion that changes anatomy.',
  ].join('\n')
}

function normalizeMotionStrength(
  requested: 'low' | 'medium' | 'high',
  shot: ShotVideoPromptContext,
): 'low' | 'medium' | 'high' {
  const text = [
    shot.shotName,
    shot.action,
    shot.details,
    shot.emotion,
    shot.location,
    shot.sceneTime,
    typeof shot.camera === 'object' && shot.camera ? JSON.stringify(shot.camera) : '',
  ].filter(Boolean).join(' ')

  if (/特写|近景|凝视|盯着|看屏幕|思考|对话|会议|汇报|投屏|证据|暂停按钮/.test(text)) {
    return 'low'
  }

  if (requested === 'high' && !/奔跑|追逐|打斗|爆炸|冲撞|摔倒|逃离/.test(text)) {
    return 'medium'
  }

  return requested
}
