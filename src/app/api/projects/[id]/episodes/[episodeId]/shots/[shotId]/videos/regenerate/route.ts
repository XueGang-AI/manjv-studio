import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { adapterFactory } from '@/server/model-adapters/adapter.factory'
import { snapShotDuration } from '@/lib/utils'
import type { VideoGenerationRequest } from '@/server/model-adapters/types'
import { checkImageAccessible } from '@/server/services/media-resource-check'

type JsonValue = import('@prisma/client').Prisma.InputJsonValue

// ─── 服务端校验常量 ────────────────────────────────────────────
// motionStrength 业务允许值：来自 IVideoAdapter 类型 'low' | 'medium' | 'high'
// （src/server/model-adapters/types.ts:63），storyboard/shot-videos handler 均用此范围。
const ALLOWED_MOTION = ['low', 'medium', 'high'] as const
// prompt 最大长度：与项目既有约定一致（story_summary 上限 2000 字，src/lib/validators.ts:66）。
const PROMPT_MAX_LENGTH = 2000

// 远端任务未终态：存在这些状态的 ShotVideo 视为"当前尝试进行中"，拒绝重复提交
const INFLIGHT_REMOTE_STATUS = new Set([
  'queued', 'pending', 'waiting',
  'processing', 'running', 'in_progress', 'generating',
])

interface RegenerateBody {
  prompt?: unknown
  motionStrength?: unknown
}

function parseBody(body: unknown): { userPrompt: string; userMotion: 'low' | 'medium' | 'high' | undefined } | { error: string } {
  if (body === null || typeof body !== 'object') {
    return { userPrompt: '', userMotion: undefined }
  }
  const b = body as RegenerateBody

  let userPrompt = ''
  if (b.prompt !== undefined) {
    if (typeof b.prompt !== 'string') return { error: 'prompt 必须为字符串' }
    const trimmed = b.prompt.trim()
    if (trimmed.length === 0) return { error: 'prompt 不能为空' }
    if (trimmed.length > PROMPT_MAX_LENGTH) return { error: `prompt 不能超过 ${PROMPT_MAX_LENGTH} 个字符` }
    userPrompt = trimmed
  }

  let userMotion: 'low' | 'medium' | 'high' | undefined
  if (b.motionStrength !== undefined) {
    if (typeof b.motionStrength !== 'string' || !ALLOWED_MOTION.includes(b.motionStrength as (typeof ALLOWED_MOTION)[number])) {
      return { error: 'motionStrength 必须为 low / medium / high 之一' }
    }
    userMotion = b.motionStrength as 'low' | 'medium' | 'high'
  }

  return { userPrompt, userMotion }
}

function safeError(message: string, status = 500) {
  return NextResponse.json({ success: false, error: message }, { status })
}

/**
 * POST — 重新创建单个镜头的视频任务（候选版本模式）
 *
 * Phase 5 可靠性收口：
 * - **候选版本模式**：不删除旧 ShotVideo（含 selected/confirmed）。新视频作为候选追加。
 *   远端失败时旧视频仍可播放/下载/继续使用。
 * - **事务边界**：短事务1（upsert VideoPrompt + 创建 queued ShotVideo 候选）→
 *   事务外远端调用 → 短事务2（写 remoteTaskId 或标记失败）。
 *   远端 HTTP 不在事务中。
 * - **幂等**：若该 shot 已有未终态（queued/running）ShotVideo，返回该尝试，不重复提交远端任务。
 * - **前置资源校验**：调 Ark 前校验 confirmedImage 可访问（HEAD/Range GET），
 *   403/过期/404 提前返回业务错误，避免付费生成失败。
 * - **VideoPrompt**：findFirst→update/create，无唯一约束（并发风险见报告）。
 * - 错误响应脱敏，不泄漏堆栈/密钥/远端响应/完整签名 URL。
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; episodeId: string; shotId: string }> }
) {
  try {
    const { id: projectId, episodeId, shotId } = await params

    // ─── 归属校验：shot 必须属于 episode 且属于 project ───
    const shot = await prisma.shot.findFirst({ where: { id: shotId, episodeId, projectId } })
    if (!shot) return safeError('镜头不存在', 404)

    const project = await prisma.project.findUnique({ where: { id: projectId } })
    if (!project) return safeError('项目不存在', 404)

    // ─── 解析并校验 body ───
    let rawBody: unknown = null
    try {
      const text = await request.text()
      if (text) rawBody = JSON.parse(text)
    } catch {
      rawBody = null
    }
    const parsed = parseBody(rawBody)
    if ('error' in parsed) return safeError(parsed.error, 400)
    const { userPrompt, userMotion } = parsed

    // ─── VideoPrompt + confirmedImage 查询 ───
    const vidPrompt = await prisma.videoPrompt.findFirst({ where: { shotId }, orderBy: { createdAt: 'desc' } })
    const confirmedImage = await prisma.shotImage.findFirst({ where: { shotId, isConfirmed: true } })

    const effectivePrompt = userPrompt || vidPrompt?.prompt || ''
    const effectiveMotion = userMotion || (vidPrompt?.motionStrength as 'low' | 'medium' | 'high' | undefined) || 'medium'

    // ─── 幂等：检查是否有未终态的当前尝试 ───
    // 若该 shot 已有 queued/running 的 ShotVideo，返回该尝试，不重复提交远端任务。
    const inflight = await prisma.shotVideo.findFirst({
      where: { shotId, projectId, remoteStatus: { in: [...INFLIGHT_REMOTE_STATUS] } },
      orderBy: { createdAt: 'desc' },
    })
    if (inflight) {
      return NextResponse.json({
        success: true,
        data: {
          shotId,
          videos: [inflight],
          count: 1,
          isAsync: true,
          reused: true, // 标识：返回的是已有进行中尝试，未重复提交
        },
      })
    }

    const rawDuration = (shot.endTime || 10) - (shot.startTime || 0)
    const duration = snapShotDuration(rawDuration, project.modelProvider)
    const modelProvider = project.modelProvider
    const modelName = modelProvider === 'ark'
      ? (process.env.ARK_VIDEO_MODEL || 'doubao-seedance-1-5-pro-251215')
      : (process.env.AGNES_VIDEO_MODEL || 'agnes-video-v2.0')
    const isMock = process.env.USE_MOCK_MODEL === 'true'

    // ─── 前置资源校验（真实模式，非 mock）───
    // confirmedImage 是 Ark TOS 短期签名 URL，过期会 403。
    // 调 Ark 前校验可访问，避免付费生成因输入图片失效而失败。
    if (!isMock && confirmedImage?.imageUrl) {
      const check = await checkImageAccessible(confirmedImage.imageUrl)
      if (!check.accessible) {
        return safeError(check.reason || '输入图片暂不可访问', 422)
      }
    }

    const genReq: VideoGenerationRequest = {
      taskType: 'image_to_video',
      prompt: effectivePrompt,
      inputImage: confirmedImage?.imageUrl || undefined,
      duration,
      aspectRatio: (project.aspectRatio || '9:16') as '9:16',
      motionStrength: effectiveMotion,
      fps: 24,
      voiceText: (shot.dialogue as string) || undefined,
      generateAudio: true,
    }

    const videoAdapter = adapterFactory.getVideoAdapter(modelProvider)

    // ─── Mock 模式：同步生成（不走候选事务，保持简单） ───
    if (isMock) {
      // 短事务：upsert VideoPrompt + 创建候选 ShotVideo（成功）
      const created = await prisma.$transaction(async (tx) => {
        if (userPrompt) {
          if (vidPrompt) {
            await tx.videoPrompt.update({
              where: { id: vidPrompt.id },
              data: { prompt: userPrompt, ...(userMotion ? { motionStrength: userMotion } : {}) },
            })
          } else {
            await tx.videoPrompt.create({
              data: {
                shotId, projectId, prompt: userPrompt, duration: rawDuration,
                motionStrength: userMotion || 'medium',
                params: { fps: 24 } as unknown as JsonValue, confirmed: false,
              },
            })
          }
        }
        const response = await videoAdapter.generate(genReq)
        const newVideo = await tx.shotVideo.create({
          data: {
            shotId, projectId, inputImageUrl: confirmedImage?.imageUrl || '',
            videoUrl: response.videos[0]?.url || '',
            prompt: effectivePrompt,
            seed: String(response.videos[0]?.params?.seed || ''),
            modelName,
            referenceImages: confirmedImage ? [{ image_url: confirmedImage.imageUrl }] : [] as unknown as JsonValue,
            duration: response.videos[0]?.duration || duration,
            params: { aspect_ratio: project.aspectRatio } as unknown as JsonValue,
            isSelected: false, isConfirmed: false,
            // mock 同步完成，标记为已完成
            remoteStatus: 'completed',
          },
        })
        return newVideo
      })
      return NextResponse.json({ success: true, data: { shotId, videos: [created], count: 1 } })
    }

    // ─── 真实模式：短事务1 - upsert VideoPrompt + 创建 queued 候选 ShotVideo ───
    // 此时新 ShotVideo remoteStatus='queued'，videoUrl=''。旧视频未删除，仍可用。
    const candidate = await prisma.$transaction(async (tx) => {
      if (userPrompt) {
        if (vidPrompt) {
          await tx.videoPrompt.update({
            where: { id: vidPrompt.id },
            data: { prompt: userPrompt, ...(userMotion ? { motionStrength: userMotion } : {}) },
          })
        } else {
          await tx.videoPrompt.create({
            data: {
              shotId, projectId, prompt: userPrompt, duration: rawDuration,
              motionStrength: userMotion || 'medium',
              params: { fps: 24 } as unknown as JsonValue, confirmed: false,
            },
          })
        }
      }
      return tx.shotVideo.create({
        data: {
          shotId, projectId,
          inputImageUrl: confirmedImage?.imageUrl || '',
          videoUrl: '',
          prompt: effectivePrompt,
          seed: '',
          modelName,
          referenceImages: confirmedImage ? [{ image_url: confirmedImage.imageUrl }] : [] as unknown as JsonValue,
          duration,
          params: { aspect_ratio: project.aspectRatio, generation_method: 'async_task' } as unknown as JsonValue,
          // 标记为排队中：作为"当前尝试"。旧视频不受影响。
          remoteStatus: 'queued',
          remoteResponseJson: {} as unknown as JsonValue,
          lastPolledAt: new Date(),
          isSelected: false, isConfirmed: false,
        },
      })
    })

    // ─── 事务外：调用远端视频 API（耗时，不放事务） ───
    try {
      const createResult = await videoAdapter.createVideoTask(genReq)

      // ─── 短事务2：成功 → 写 remoteTaskId/状态 ───
      const updated = await prisma.shotVideo.update({
        where: { id: candidate.id },
        data: {
          remoteTaskId: createResult.taskId,
          remoteStatus: createResult.status,
          remoteResponseJson: createResult.createResponse as unknown as JsonValue,
          lastPolledAt: new Date(),
        },
      })

      // 确保项目状态为 SHOT_VIDEO_GENERATING
      if (project.status !== 'SHOT_VIDEO_GENERATING') {
        await prisma.project.update({ where: { id: projectId }, data: { status: 'SHOT_VIDEO_GENERATING' } })
      }

      return NextResponse.json({
        success: true,
        data: { shotId, videos: [updated], count: 1, isAsync: true },
      })
    } catch (remoteErr) {
      // ─── 短事务2：失败 → 标记该候选为 failed，保留记录与旧视频 ───
      // 旧 ShotVideo 未被删除，仍可播放/下载/继续使用。
      await prisma.shotVideo.update({
        where: { id: candidate.id },
        data: {
          remoteStatus: 'failed',
          remoteResponseJson: { errorCategory: remoteErr instanceof Error ? remoteErr.constructor.name : 'UnknownError' } as unknown as JsonValue,
          lastPolledAt: new Date(),
        },
      })
      const errCategory = remoteErr instanceof Error ? remoteErr.constructor.name : 'UnknownError'
      console.error(`[regenerate-videos] remote failed: ${errCategory}`)
      // 返回当前失败尝试信息（不暴露远端细节），前端可显示"本次重新生成失败"且旧视频仍在
      return NextResponse.json({
        success: false,
        error: '视频生成失败，请稍后重试。已有视频仍可使用。',
        data: { shotId, failedAttemptId: candidate.id },
      }, { status: 502 })
    }
  } catch (error) {
    const errCategory = error instanceof Error ? error.constructor.name : 'UnknownError'
    console.error(`[regenerate-videos] failed: ${errCategory}`)
    return safeError('重新生成失败，请稍后重试')
  }
}
