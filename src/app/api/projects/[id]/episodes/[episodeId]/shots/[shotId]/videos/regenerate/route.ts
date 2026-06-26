import { NextRequest, NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'
import prisma from '@/lib/prisma'
import { adapterFactory } from '@/server/model-adapters/adapter.factory'
import { getRuntimeModelName, RUNTIME_MODEL_PROVIDER } from '@/server/model-adapters/model-config'
import { snapShotDuration } from '@/lib/utils'
import type { VideoGenerationRequest } from '@/server/model-adapters/types'
import { checkImageAccessible } from '@/server/services/media-resource-check'
import { getReadUrl } from '@/server/services/media-persist'
import { UPLOAD_DIR } from '@/server/services/ffmpeg-utils'
import { resolveStructuredReferenceImagesForModel } from '@/server/services/media-reference-url'

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
  clientRequestId?: unknown
}

function parseBody(body: unknown): { userPrompt: string; userMotion: 'low' | 'medium' | 'high' | undefined; clientRequestId: string | null } | { error: string } {
  if (body === null || typeof body !== 'object') {
    return { userPrompt: '', userMotion: undefined, clientRequestId: null }
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

  // clientRequestId：业务幂等键（Phase 6）。可选，字符串，trim 后非空。
  // 旧客户端不传 → null（兼容，唯一约束含 NULL 不冲突）。
  let clientRequestId: string | null = null
  if (b.clientRequestId !== undefined && b.clientRequestId !== null) {
    if (typeof b.clientRequestId !== 'string') {
      return { error: 'clientRequestId 必须为字符串' }
    }
    const trimmed = b.clientRequestId.trim()
    if (trimmed.length === 0 || trimmed.length > 128) {
      return { error: 'clientRequestId 格式无效' }
    }
    clientRequestId = trimmed
  }

  return { userPrompt, userMotion, clientRequestId }
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
    const { userPrompt, userMotion, clientRequestId } = parsed

    // ─── clientRequestId 业务幂等（Phase 6）───
    // 同一 clientRequestId 重复请求返回已有尝试，不重复提交远端任务/不重复收费。
    // 旧客户端不传 → null，跳过此检查（兼容）。
    if (clientRequestId) {
      const existing = await prisma.shotVideo.findFirst({
        where: { projectId, shotId, clientRequestId },
        orderBy: { createdAt: 'desc' },
      })
      if (existing) {
        return NextResponse.json({
          success: true,
          data: {
            shotId,
            videos: [existing],
            count: 1,
            isAsync: true,
            reused: true,
          },
        })
      }
    }

    // ─── VideoPrompt + confirmedImage 查询 ───
    const confirmedImage = await prisma.shotImage.findFirst({ where: { shotId, isConfirmed: true } })

    const effectiveMotion = userMotion || 'medium'
    // effectivePrompt 在 upsert 后确定（无 userPrompt 时用 VideoPrompt 现有值）

    // ─── 幂等：检查是否有未终态的当前尝试（无 clientRequestId 时回退保护）───
    if (!clientRequestId) {
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
            reused: true,
          },
        })
      }
    }

    const rawDuration = (shot.endTime || 10) - (shot.startTime || 0)
    const duration = snapShotDuration(rawDuration, RUNTIME_MODEL_PROVIDER)
    const modelProvider = RUNTIME_MODEL_PROVIDER
    const modelName = getRuntimeModelName('video')
    const isMock = process.env.USE_MOCK_MODEL === 'true'

    // ─── VideoPrompt upsert（Phase 6：@@unique([shotId]) 原子 upsert）───
    // 用户提供了 prompt → 更新；否则读取现有 prompt 作为 effectivePrompt。
    // upsert 在事务内与候选 ShotVideo 一起创建（见下）。
    const vidPrompt = await prisma.videoPrompt.findFirst({ where: { shotId }, orderBy: { createdAt: 'desc' } })
    const effectivePrompt = userPrompt || vidPrompt?.prompt || ''

    // ─── 确定 inputImage URL（Phase 6+：智能回退）───
    // 优先级：
    //   1. 自有存储 readUrl 为公网绝对 URL → 直接使用（生产 OSS/S3 签名 URL）
    //   2. readUrl 为相对路径 → 尝试 sourceUrl（供应商原始 URL）
    //   3. sourceUrl 不可达 → 读取本地文件转 base64 data URI（Ark 支持）
    let inputImageUrl = confirmedImage?.imageUrl || ''
    if (confirmedImage?.storageObjectKey) {
      const readUrl = await getReadUrl(confirmedImage.storageObjectKey)
      if (!readUrl.startsWith('/')) {
        // 公网绝对 URL（OSS/S3 签名 URL）→ 直接使用
        inputImageUrl = readUrl
      } else if (confirmedImage?.sourceUrl) {
        // 相对路径 → 尝试 sourceUrl
        const sourceCheck = await checkImageAccessible(confirmedImage.sourceUrl)
        if (sourceCheck.accessible) {
          inputImageUrl = confirmedImage.sourceUrl
        } else {
          // sourceUrl 过期 → 读取本地文件转 base64 data URI
          const localPath = path.join(UPLOAD_DIR, 'media', confirmedImage.storageObjectKey)
          if (fs.existsSync(localPath)) {
            const buffer = fs.readFileSync(localPath)
            const b64 = buffer.toString('base64')
            const ext = path.extname(localPath).toLowerCase()
            const mimeType = ext === '.png' ? 'image/png'
              : ext === '.webp' ? 'image/webp'
              : 'image/jpeg'
            inputImageUrl = `data:${mimeType};base64,${b64}`
          }
        }
      }
    }

    // ─── 前置资源校验（真实模式，非 mock）───
    // 仅对 HTTP(S) URL 做可访问性检查。data URI 和本地路径跳过。
    if (!isMock && inputImageUrl && !inputImageUrl.startsWith('data:')) {
      const check = await checkImageAccessible(inputImageUrl)
      if (!check.accessible) {
        return safeError(check.reason || '输入图片暂不可访问', 422)
      }
    }

    const inheritedReferenceImages = Array.isArray(confirmedImage?.referenceImages)
      ? confirmedImage.referenceImages
      : []
    const referenceImageUrls = await resolveStructuredReferenceImagesForModel(inheritedReferenceImages, 4)

    const genReq: VideoGenerationRequest = {
      taskType: 'image_to_video',
      prompt: effectivePrompt,
      inputImage: inputImageUrl || undefined,
      referenceImages: referenceImageUrls,
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
          await tx.videoPrompt.upsert({
            where: { shotId },
            create: {
              shotId, projectId, prompt: userPrompt, duration: rawDuration,
              motionStrength: userMotion || 'medium',
              params: { fps: 24 } as unknown as JsonValue, confirmed: false,
            },
            update: { prompt: userPrompt, ...(userMotion ? { motionStrength: userMotion } : {}) },
          })
        }
        const response = await videoAdapter.generate(genReq)
        const newVideo = await tx.shotVideo.create({
          data: {
            shotId, projectId, inputImageUrl,
            videoUrl: response.videos[0]?.url || '',
            prompt: effectivePrompt,
            seed: String(response.videos[0]?.params?.seed || ''),
            modelName,
            referenceImages: confirmedImage
              ? [{ image_url: inputImageUrl, reference_type: 'input_image' }, ...inheritedReferenceImages] as unknown as JsonValue
              : [] as unknown as JsonValue,
            duration: response.videos[0]?.duration || duration,
            params: { aspect_ratio: project.aspectRatio, sent_reference_image_count: referenceImageUrls.length } as unknown as JsonValue,
            isSelected: false, isConfirmed: false,
            clientRequestId: clientRequestId ?? undefined,
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
        await tx.videoPrompt.upsert({
          where: { shotId },
          create: {
            shotId, projectId, prompt: userPrompt, duration: rawDuration,
            motionStrength: userMotion || 'medium',
            params: { fps: 24 } as unknown as JsonValue, confirmed: false,
          },
          update: { prompt: userPrompt, ...(userMotion ? { motionStrength: userMotion } : {}) },
        })
      }
      return tx.shotVideo.create({
        data: {
          shotId, projectId,
          inputImageUrl,
          videoUrl: '',
          prompt: effectivePrompt,
          seed: '',
          modelName,
          referenceImages: confirmedImage
            ? [{ image_url: inputImageUrl, reference_type: 'input_image' }, ...inheritedReferenceImages] as unknown as JsonValue
            : [] as unknown as JsonValue,
          duration,
          params: {
            aspect_ratio: project.aspectRatio,
            generation_method: 'async_task',
            sent_reference_image_count: referenceImageUrls.length,
          } as unknown as JsonValue,
          // 标记为排队中：作为"当前尝试"。旧视频不受影响。
          remoteStatus: 'queued',
          remoteResponseJson: {} as unknown as JsonValue,
          clientRequestId: clientRequestId ?? undefined,
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
