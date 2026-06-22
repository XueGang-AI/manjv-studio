import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { adapterFactory } from '@/server/model-adapters/adapter.factory'
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
 * POST /api/projects/:id/characters/:charId/images/regenerate?mode=quick|consistency
 *
 * mode=quick (默认): 1 张 front_full_body
 * mode=consistency:  5 张 (front_full_body, front_half_body, left_side, right_side, back_view)
 *
 * 策略：先生成新图，全部成功后删除旧图；失败则保留旧图不动
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; charId: string }> }
) {
  try {
    const { id: projectId, charId } = await params
    const url = new URL(request.url)
    const mode = url.searchParams.get('mode') || 'quick'

    const character = await prisma.character.findFirst({
      where: { id: charId, projectId },
    })
    if (!character) {
      return NextResponse.json({ success: false, error: '角色不存在' }, { status: 404 })
    }

    const project = await prisma.project.findUnique({ where: { id: projectId } })
    if (!project) {
      return NextResponse.json({ success: false, error: '项目不存在' }, { status: 404 })
    }

    // 确定要生成的参考图类型
    const types = mode === 'consistency'
      ? ['front_full_body', 'front_half_body', 'left_side', 'right_side', 'back_view']
      : ['front_full_body']

    const imageAdapter = adapterFactory.getImageAdapter(project.modelProvider)
    const corePrompt = character.enFixedPrompt || character.zhFixedPrompt || `${character.name}`
    const style = project.artStyle || '韩漫'
    const negativePrompt = 'ugly, deformed, bad anatomy, bad proportions, low quality, blurry, pixelated, distorted face, extra fingers, missing fingers, asymmetric eyes, watermark, text, logo, extra limbs, multiple heads'

    // 先生成所有新图（在删除旧图之前）
    // 存储简化的中间数据，params 在事务中内联构建避免 Prisma JSON 类型问题
    const newImageData: Array<{
      imageUrl: string; prompt: string; seed: string
      referenceType: string; isPrimary: boolean; isSelected: boolean
      referenceImage: string | null; imgParams: Record<string, unknown>
      storageObjectKey: string | null; storageProvider: string | null; sourceUrl: string | null
    }> = []

    let anchorImageUrl: string | null = null
    // Phase 7.1: 追踪转存失败的角度，返回给用户以便重试
    const failedTypes: Array<{ referenceType: string; reason: string }> = []

    // Phase 7.1：统一持久化 + policy（动态导入）
    const { persistImageWithPolicy } = await import('@/server/services/media-persist')

    for (let i = 0; i < types.length; i++) {
      const refType = types[i]
      const angleSuffix = ANGLE_PROMPTS[refType] || ''
      const prompt = `${corePrompt}, ${angleSuffix}`

      const genReq: ImageGenerationRequest = {
        taskType: 'character_image',
        prompt,
        negativePrompt,
        aspectRatio: (project.aspectRatio || '9:16') as '9:16',
        style,
        numOutputs: 1,
        seed: undefined,
      }

      if (anchorImageUrl) {
        genReq.referenceImages = [anchorImageUrl]
      }

      // 单张带重试
      let response: Awaited<ReturnType<typeof imageAdapter.generate>>
      try {
        response = await withRetry(
          () => imageAdapter.generate(genReq),
          3,
          `${character.name || charId}/${refType}`
        )
      } catch (singleError) {
        console.error(`[Regenerate] ${character.name || charId}/${refType} 生成失败: ${(singleError as Error).message}`)
        continue // 跳过失败的角度，继续生成下一个
      }

      if (refType === 'front_full_body' && response.images[0]?.url && !anchorImageUrl) {
        anchorImageUrl = response.images[0].url
      }

      for (const img of response.images) {
        // Phase 7.1：统一持久化 + policy（prod 禁止 fallback）
        const outcome = await persistImageWithPolicy(img.url, projectId, 'image')
        if (!outcome.persisted && outcome.imageUrl === '') {
          // production 转存失败：记录失败角度，跳过该图，不保存供应商 URL
          failedTypes.push({ referenceType: refType, reason: outcome.error || '转存失败' })
          continue
        }
        newImageData.push({
          imageUrl: outcome.imageUrl,
          prompt,
          seed: String(img.seed || ''),
          referenceType: refType,
          isPrimary: refType === 'front_full_body',
          isSelected: refType === 'front_full_body',
          referenceImage: anchorImageUrl,
          imgParams: (img.params || {}) as Record<string, unknown>,
          storageObjectKey: outcome.storageObjectKey,
          storageProvider: outcome.storageProvider,
          sourceUrl: outcome.sourceUrl,
        })
      }
    }

    if (newImageData.length === 0) {
      return NextResponse.json({
        success: false,
        error: '所有角度生成均失败，旧图已保留',
      }, { status: 500 })
    }

    const aspectRatio = (project.aspectRatio || '9:16') as '9:16'

    // ✅ 全部生成成功后，再删除旧图并写入新图（事务保证原子性）
    const createdImages = await prisma.$transaction(async (tx) => {
      // 删除旧图
      await tx.characterImage.deleteMany({
        where: { characterId: charId, projectId },
      })

      // 批量创建新图
      const created: unknown[] = []
      for (const img of newImageData) {
        const record = await tx.characterImage.create({
          data: {
            characterId: charId,
            projectId,
            imageUrl: img.imageUrl,
            storageObjectKey: img.storageObjectKey,
            storageProvider: img.storageProvider,
            sourceUrl: img.sourceUrl,
            prompt: img.prompt,
            negativePrompt,
            seed: img.seed,
            modelName: project.modelProvider === 'ark' ? (process.env.ARK_IMAGE_MODEL || 'doubao-seedream-5-0-260128') : (process.env.AGNES_IMAGE_MODEL || 'agnes-image-2.0-flash'),
            referenceType: img.referenceType,
            isPrimary: img.isPrimary,
            isSelected: img.isSelected,
            isConfirmed: false,
            // 内联构建 params，与 generate route 保持一致
            params: {
              aspect_ratio: aspectRatio, style,
              num_outputs: 1, reference_type: img.referenceType,
              ...(img.referenceImage ? { reference_image: img.referenceImage } : {}),
              ...img.imgParams,
            },
          },
        })
        created.push(record)
      }
      return created
    })

    return NextResponse.json({
      success: true,
      data: {
        characterId: charId,
        images: createdImages,
        count: createdImages.length,
        mode,
        generatedTypes: newImageData.map(i => i.referenceType),
        // Phase 7.1: 部分成功时报告失败角度，用户可重试
        failedTypes: failedTypes.length > 0 ? failedTypes : undefined,
      },
    })
  } catch (error) {
    console.error('Failed to regenerate images:', error)
    return NextResponse.json(
      { success: false, error: '重新生成角色图失败，旧图已保留' },
      { status: 500 }
    )
  }
}
