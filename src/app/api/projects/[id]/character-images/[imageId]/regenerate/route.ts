import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { adapterFactory } from '@/server/model-adapters/adapter.factory'
import { getRuntimeModelName } from '@/server/model-adapters/model-config'
import { resolveImageUrlForModel } from '@/server/services/media-reference-url'
import type { ImageGenerationRequest } from '@/server/model-adapters/types'

/** 各角度 Prompt 后缀 */
const ANGLE_PROMPTS: Record<string, string> = {
  front_full_body: 'full body standing pose, front view, showing complete outfit and body proportions, centered composition',
  front_half_body: 'half body portrait, front view, focus on facial features, hairstyle and makeup, head and shoulders',
  left_side:       'left side profile view, showing side face contour and hair length, 3/4 turn to left',
  right_side:      'right side profile view, showing side face contour and outfit details, 3/4 turn to right',
  back_view:       'back view, showing hair length from behind, back outfit silhouette, walking away pose',
}

/** 带指数退避的重试包装器 */
async function withRetry<T>(fn: () => Promise<T>, maxRetries = 3, label = ''): Promise<T> {
  let lastError: Error | null = null
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn()
    } catch (error) {
      lastError = error as Error
      if (attempt < maxRetries) {
        const delay = attempt * 2000
        console.warn(`[Retry] ${label} attempt ${attempt}/${maxRetries} failed, retrying in ${delay}ms: ${lastError.message}`)
        await new Promise(r => setTimeout(r, delay))
      }
    }
  }
  throw lastError!
}

/**
 * POST /api/projects/:id/character-images/:imageId/regenerate
 *
 * 重新生成单张角色参考图（仅替换该 referenceType 的图片）
 * 策略：先成后删 — 新图生成成功后才替换旧图
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; imageId: string }> }
) {
  try {
    const { id: projectId, imageId } = await params

    // 查找目标图片
    const existingImage = await prisma.characterImage.findFirst({
      where: { id: imageId, projectId },
    })
    if (!existingImage) {
      return NextResponse.json({ success: false, error: '图片不存在' }, { status: 404 })
    }

    const project = await prisma.project.findUnique({ where: { id: projectId } })
    if (!project) {
      return NextResponse.json({ success: false, error: '项目不存在' }, { status: 404 })
    }

    const character = await prisma.character.findFirst({
      where: { id: existingImage.characterId, projectId },
    })
    if (!character) {
      return NextResponse.json({ success: false, error: '角色不存在' }, { status: 404 })
    }

    const refType = existingImage.referenceType || 'front_full_body'
    const angleSuffix = ANGLE_PROMPTS[refType] || ''
    const corePrompt = character.enFixedPrompt || character.zhFixedPrompt || `${character.name}`
    const style = project.artStyle || '韩漫'
    const negativePrompt = 'ugly, deformed, bad anatomy, bad proportions, low quality, blurry, pixelated, distorted face, extra fingers, missing fingers, asymmetric eyes, watermark, text, logo, extra limbs, multiple heads'
    const aspectRatio = (project.aspectRatio || '9:16') as '9:16' | '16:9' | '1:1'

    // 查找锚点图（front_full_body 中 isSelected/isPrimary 的图）用于一致性
    const anchorImage = await prisma.characterImage.findFirst({
      where: {
        characterId: character.id,
        projectId,
        referenceType: 'front_full_body',
        isSelected: true,
      },
    })
    // 如果重新生成的是锚点图本身，不传 reference（避免自我引用）
    const anchorImageUrl = (refType !== 'front_full_body' && anchorImage) ? anchorImage.imageUrl : null
    const anchorImageForModel = (refType !== 'front_full_body' && anchorImage)
      ? (await resolveImageUrlForModel({
          imageUrl: anchorImage.imageUrl,
          sourceUrl: anchorImage.sourceUrl,
          storageObjectKey: anchorImage.storageObjectKey,
        })) || anchorImageUrl
      : null

    const imageAdapter = adapterFactory.getImageAdapter(project.modelProvider)
    const prompt = `${corePrompt}, ${angleSuffix}`

    const genReq: ImageGenerationRequest = {
      taskType: 'character_image',
      prompt,
      negativePrompt,
      aspectRatio,
      style,
      numOutputs: 1,
      seed: undefined,
    }

    if (anchorImageForModel) {
      genReq.referenceImages = [anchorImageForModel]
    }

    // 生成新图（带重试）
    const response = await withRetry(
      () => imageAdapter.generate(genReq),
      3,
      `${character.name || character.id}/${refType}`
    )

    if (!response.images || response.images.length === 0) {
      return NextResponse.json({ success: false, error: '图片生成失败' }, { status: 500 })
    }

    // 先成后删：新图生成成功后，删除旧图并创建新图
    const newImg = response.images[0]
    // Phase 7.1：统一持久化 + policy 决策（prod 禁止 fallback）
    const { persistImageWithPolicy } = await import('@/server/services/media-persist')
    const outcome = await persistImageWithPolicy(newImg.url, projectId, 'image')
    if (!outcome.persisted && outcome.imageUrl === '') {
      // production 转存失败：不保存供应商 URL，不推进业务，返回错误
      return NextResponse.json({ success: false, error: '图片转存失败，请重试' }, { status: 500 })
    }
    const storageObjectKey = outcome.storageObjectKey
    const storageProvider = outcome.storageProvider
    const imageUrlForDb = outcome.imageUrl
    const sourceUrlForAudit = outcome.sourceUrl
    const createdImage = await prisma.$transaction(async (tx) => {
      // 删除同一 referenceType 的旧图（可能有多张候选）
      await tx.characterImage.deleteMany({
        where: {
          characterId: character.id,
          projectId,
          referenceType: refType,
        },
      })

      // 创建新图
      return tx.characterImage.create({
        data: {
          characterId: character.id,
          projectId,
          imageUrl: imageUrlForDb,
          storageObjectKey,
          storageProvider,
          sourceUrl: sourceUrlForAudit,
          prompt,
          negativePrompt,
          seed: String(newImg.seed || ''),
          modelName: getRuntimeModelName('image'),
          referenceType: refType,
          isPrimary: refType === 'front_full_body',
          isSelected: refType === 'front_full_body',
          isConfirmed: false,
          params: {
            aspect_ratio: aspectRatio,
            style,
            num_outputs: 1,
            reference_type: refType,
            ...(anchorImageUrl ? { reference_image: anchorImageUrl } : {}),
            ...(newImg.params || {}),
          },
        },
      })
    })

    return NextResponse.json({
      success: true,
      data: {
        image: createdImage,
        referenceType: refType,
        characterId: character.id,
      },
    })
  } catch (error) {
    console.error('Failed to regenerate single character image:', error)
    return NextResponse.json(
      { success: false, error: '重新生成图片失败，旧图已保留' },
      { status: 500 }
    )
  }
}
