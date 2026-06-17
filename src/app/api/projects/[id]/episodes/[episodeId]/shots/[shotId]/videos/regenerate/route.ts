import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { adapterFactory } from '@/server/model-adapters/adapter.factory'
import { snapShotDuration } from '@/lib/utils'
import type { VideoGenerationRequest } from '@/server/model-adapters/types'

type JsonValue = import('@prisma/client').Prisma.InputJsonValue

// ─── 服务端校验常量（Phase 5 收口） ────────────────────────────
// motionStrength 业务允许值：来自 IVideoAdapter 类型 'low' | 'medium' | 'high'
// （src/server/model-adapters/types.ts:63），storyboard/shot-videos handler 均用此范围。
const ALLOWED_MOTION = ['low', 'medium', 'high'] as const
// prompt 最大长度：与项目既有约定一致（story_summary 上限 2000 字，src/lib/validators.ts:66）。
const PROMPT_MAX_LENGTH = 2000

interface RegenerateBody {
  prompt?: unknown
  motionStrength?: unknown
}

/** 解析并校验 body，返回标准化值或 400 错误响应 */
function parseBody(body: unknown): { userPrompt: string; userMotion: 'low' | 'medium' | 'high' | undefined } | { error: string } {
  if (body === null || typeof body !== 'object') {
    // 无 body 或非对象：按无覆盖处理
    return { userPrompt: '', userMotion: undefined }
  }
  const b = body as RegenerateBody

  // prompt：可选，必须是 string，trim 后非空，≤ 上限
  let userPrompt = ''
  if (b.prompt !== undefined) {
    if (typeof b.prompt !== 'string') {
      return { error: 'prompt 必须为字符串' }
    }
    const trimmed = b.prompt.trim()
    if (trimmed.length === 0) {
      return { error: 'prompt 不能为空' }
    }
    if (trimmed.length > PROMPT_MAX_LENGTH) {
      return { error: `prompt 不能超过 ${PROMPT_MAX_LENGTH} 个字符` }
    }
    userPrompt = trimmed
  }

  // motionStrength：可选，必须是允许值之一
  let userMotion: 'low' | 'medium' | 'high' | undefined
  if (b.motionStrength !== undefined) {
    if (typeof b.motionStrength !== 'string' || !ALLOWED_MOTION.includes(b.motionStrength as (typeof ALLOWED_MOTION)[number])) {
      return { error: 'motionStrength 必须为 low / medium / high 之一' }
    }
    userMotion = b.motionStrength as 'low' | 'medium' | 'high'
  }

  return { userPrompt, userMotion }
}

/** 错误响应不暴露内部堆栈/密钥/远端响应，仅返回可理解信息 */
function safeError(message: string, status = 500) {
  return NextResponse.json({ success: false, error: message }, { status })
}

/**
 * POST — 重新创建单个镜头的视频任务（异步模式）
 * 与 generate 路由保持一致：创建远程异步任务 → 保存 remoteTaskId → 前端轮询
 *
 * Phase 4/5 扩展：接受可选 body { prompt?, motionStrength? }，允许用户编辑视频 Prompt
 * 后重新生成。未提供时沿用 videoPrompt 记录（保持原有行为）。
 *
 * Phase 5 收口：
 * - 服务端参数校验（prompt/motionStrength 类型、长度、范围）
 * - 归属校验（project/episode/shot/confirmedImage 链路一致性，防止越权）
 * - VideoPrompt 持久化：存在则 update，不存在则 create（无唯一约束，用 findFirst by shotId）
 * - 错误响应脱敏，不泄漏堆栈/密钥/远端完整响应
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; episodeId: string; shotId: string }> }
) {
  try {
    const { id: projectId, episodeId, shotId } = await params

    // ─── 归属校验：shot 必须属于 episode 且属于 project ───
    // findFirst 已带 episodeId + projectId 条件，确保 shot 归属正确。
    // 不允许仅凭 shotId 跨项目访问。
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
      // 非法 JSON：当作无 body 处理（保持无 body 兼容调用）
      rawBody = null
    }
    const parsed = parseBody(rawBody)
    if ('error' in parsed) return safeError(parsed.error, 400)
    const { userPrompt, userMotion } = parsed

    // ─── VideoPrompt：按 shotId 查最新记录 ───
    const vidPrompt = await prisma.videoPrompt.findFirst({ where: { shotId }, orderBy: { createdAt: 'desc' } })
    // confirmedImage 必须属于当前 shot（findFirst 带 shotId 条件）
    const confirmedImage = await prisma.shotImage.findFirst({ where: { shotId, isConfirmed: true } })

    const effectivePrompt = userPrompt || vidPrompt?.prompt || ''
    const effectiveMotion = userMotion || (vidPrompt?.motionStrength as 'low' | 'medium' | 'high' | undefined) || 'medium'

    // ─── 用户提供了 prompt：持久化到 VideoPrompt（upsert 语义） ───
    // VideoPrompt 无唯一约束，无法用 upsert。用 findFirst 结果：
    // - 存在记录 → update（保留 id 关联）
    // - 不存在记录 → create（shotId/projectId 真实关联，duration 来自 shot 时间轴）
    if (userPrompt) {
      const rawDuration = (shot.endTime || 10) - (shot.startTime || 0)
      if (vidPrompt) {
        await prisma.videoPrompt.update({
          where: { id: vidPrompt.id },
          data: {
            prompt: userPrompt,
            ...(userMotion ? { motionStrength: userMotion } : {}),
          },
        })
      } else {
        await prisma.videoPrompt.create({
          data: {
            shotId,
            projectId,
            prompt: userPrompt,
            duration: rawDuration,
            motionStrength: userMotion || 'medium',
            params: { fps: 24 } as unknown as JsonValue,
            confirmed: false,
          },
        })
      }
    }

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

    if (isMock) {
      // Mock 模式：同步生成
      const response = await videoAdapter.generate(genReq)
      const created = await Promise.all(response.videos.map(v =>
        prisma.shotVideo.create({
          data: {
            shotId, projectId, inputImageUrl: confirmedImage?.imageUrl || '',
            videoUrl: v.url, prompt: effectivePrompt,
            seed: String(v.params?.seed || ''),
            modelName,
            referenceImages: confirmedImage ? [{ image_url: confirmedImage.imageUrl }] : [] as unknown as JsonValue,
            duration: v.duration || duration,
            params: { aspect_ratio: project.aspectRatio } as unknown as JsonValue,
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
        prompt: effectivePrompt,
        seed: '',
        modelName,
        referenceImages: confirmedImage ? [{ image_url: confirmedImage.imageUrl }] : [] as unknown as JsonValue,
        duration,
        params: { aspect_ratio: project.aspectRatio, generation_method: 'async_task' } as unknown as JsonValue,
        remoteTaskId: createResult.taskId,
        remoteStatus: createResult.status,
        remoteResponseJson: createResult.createResponse as unknown as JsonValue,
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
    // 错误脱敏：不输出堆栈/密钥/远端完整响应到客户端。
    // 服务端日志仅记录错误类别（不含敏感字段）。
    const errCategory = error instanceof Error ? error.constructor.name : 'UnknownError'
    console.error(`[regenerate-videos] failed: ${errCategory}`)
    return safeError('重新生成失败，请稍后重试')
  }
}
