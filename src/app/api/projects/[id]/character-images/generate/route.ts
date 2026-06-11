import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { adapterFactory } from '@/server/model-adapters/adapter.factory'
import type { ImageGenerationRequest } from '@/server/model-adapters/types'

/** 角色参考图类型定义 */
const REF_TYPES = {
  front_full_body:  '正面全身',
  front_half_body:  '正面半身/正脸',
  left_side:        '左侧面',
  right_side:       '右侧面',
  back_view:        '背面',
  expression:       '表情参考',
  outfit:           '服装参考',
  prop:             '关键道具',
  weapon:           '武器',
  pose:             '动作姿态',
} as const

type RefType = keyof typeof REF_TYPES

/** 各角度 Prompt 后缀 */
const ANGLE_PROMPTS: Record<string, string> = {
  front_full_body: 'full body standing pose, front view, showing complete outfit and body proportions, centered composition',
  front_half_body: 'half body portrait, front view, focus on facial features, hairstyle and makeup, head and shoulders',
  left_side:       'left side profile view, showing side face contour and hair length, 3/4 turn to left',
  right_side:      'right side profile view, showing side face contour and outfit details, 3/4 turn to right',
  back_view:       'back view, showing hair length from behind, back outfit silhouette, walking away pose',
  expression:      'expression reference sheet, multiple facial expressions, same character, same outfit',
  outfit:          'full body outfit reference, fashion design detail, fabric texture, color palette',
  prop:            'holding key prop item, clear prop design, prop interaction',
  weapon:          'holding weapon, weapon design detail, combat ready pose',
  pose:            'action pose reference, dynamic posture, motion lines',
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
 * POST /api/projects/:id/character-images/generate?mode=quick|consistency
 *
 * mode=quick (默认): 每角色 1 张 front_full_body
 * mode=consistency:  每角色 5 张 (front_full_body, front_half_body, left_side, right_side, back_view)
 *
 * 去重：已有对应角度图片的角色自动跳过
 * 重试：单张图片失败自动重试最多 3 次
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: projectId } = await params
    const url = new URL(request.url)
    const mode = url.searchParams.get('mode') || 'quick'

    const project = await prisma.project.findUnique({ where: { id: projectId } })
    if (!project) {
      return NextResponse.json({ success: false, error: '项目不存在' }, { status: 404 })
    }

    const characters = await prisma.character.findMany({
      where: { projectId, confirmed: true },
    })
    if (characters.length === 0) {
      return NextResponse.json({
        success: false, error: '没有已确认的角色，请先确认角色设定卡',
      }, { status: 400 })
    }

    // 确定要生成的参考图类型列表
    const types: RefType[] = mode === 'consistency'
      ? ['front_full_body', 'front_half_body', 'left_side', 'right_side', 'back_view']
      : ['front_full_body']

    await prisma.project.update({
      where: { id: projectId },
      data: { status: 'CHARACTER_IMAGE_GENERATING' },
    })

    const task = await prisma.generationTask.create({
      data: {
        projectId, taskType: 'GENERATE_CHARACTER_IMAGES',
        modelName: process.env.AGNES_IMAGE_MODEL || 'Agnes-Image-2.0-Flash',
        status: 'running',
        input: { project_id: projectId, character_count: characters.length, mode, reference_types: types },
      },
    })

    try {
      const imageAdapter = adapterFactory.getImageAdapter()
      const aspectRatio = (project.aspectRatio || '9:16') as '9:16' | '16:9' | '1:1'
      const style = project.artStyle || '韩漫'
      const negativePrompt = 'ugly, deformed, bad anatomy, bad proportions, low quality, blurry, pixelated, distorted face, extra fingers, missing fingers, asymmetric eyes, watermark, text, logo, extra limbs, multiple heads'
      const allResults: Array<{ characterId: string; characterName: string; images: unknown[] }> = []

      for (const char of characters) {
        // 去重：查询该角色已有图片，只生成缺失的角度
        const existingImages = await prisma.characterImage.findMany({
          where: { characterId: char.id, projectId },
          select: { imageUrl: true, referenceType: true },
        })
        const existingTypes = new Set(existingImages.map(i => i.referenceType).filter(Boolean))
        const missingTypes = types.filter(t => !existingTypes.has(t))

        // 全部角度已有，跳过
        if (missingTypes.length === 0) {
          console.log(`[Dedup] 角色 ${char.name || char.id} 所有角度已存在，跳过`)
          // 把已有图片加入结果，前端可以正常展示
          allResults.push({ characterId: char.id, characterName: char.name || '', images: [] })
          continue
        }

        console.log(`[Dedup] 角色 ${char.name || char.id}: 已有 ${existingTypes.size} 个角度，需生成 ${missingTypes.length} 个: ${missingTypes.join(', ')}`)

        // 角色核心描述（所有角度共享）
        const corePrompt = char.enFixedPrompt || char.zhFixedPrompt || `${char.name}, character design, ${style} style`
        const charImages: unknown[] = []

        // 锚点图 URL —— 如果已有 front_full_body，用它做参考；否则等第一张生成后获取
        const existingAnchor = existingImages.find(i => i.referenceType === 'front_full_body')
        let anchorImageUrl: string | null = existingAnchor?.imageUrl || null

        for (let i = 0; i < missingTypes.length; i++) {
          const refType = missingTypes[i]
          const angleSuffix = ANGLE_PROMPTS[refType] || ''
          const prompt = `${corePrompt}, ${angleSuffix}`
          // 只有当 anchor 不存在且当前是第一个类型，才是主图
          const isFirst = i === 0 && !existingAnchor

          const genReq: ImageGenerationRequest = {
            taskType: 'character_image',
            prompt,
            negativePrompt,
            aspectRatio,
            style,
            numOutputs: 1, // 每种角度只生成 1 张
            seed: undefined,
          }

          // 一致性模式：有锚点图时传入 reference_images，确保同一个人物
          if (anchorImageUrl) {
            genReq.referenceImages = [anchorImageUrl]
          }

          // 单张生成带重试（最多 3 次），单张失败不影响其他角度
          let response: Awaited<ReturnType<typeof imageAdapter.generate>>
          try {
            response = await withRetry(
              () => imageAdapter.generate(genReq),
              3,
              `${char.name || char.id}/${refType}`
            )
          } catch (singleError) {
            console.error(`[Generate] ${char.name || char.id}/${refType} 生成失败（已重试）: ${(singleError as Error).message}`)
            // 跳过这个角度，继续生成下一个
            continue
          }

          // 保存锚点图 URL（第一张 front_full_body 图）
          if (refType === 'front_full_body' && response.images[0]?.url && !anchorImageUrl) {
            anchorImageUrl = response.images[0].url
          }

          const created = await Promise.all(response.images.map(img =>
            prisma.characterImage.create({
              data: {
                characterId: char.id, projectId,
                imageUrl: img.url, prompt,
                negativePrompt,
                seed: String(img.seed || ''),
                modelName: process.env.AGNES_IMAGE_MODEL || 'Agnes-Image-2.0-Flash',
                referenceType: refType,
                isPrimary: refType === 'front_full_body',
                params: {
                  aspect_ratio: aspectRatio, style, num_outputs: 1, reference_type: refType,
                  ...(anchorImageUrl ? { reference_image: anchorImageUrl } : {}),
                  ...img.params,
                },
                isSelected: refType === 'front_full_body',    // 正面全身自动选中
                isConfirmed: false,
              },
            })
          ))
          charImages.push(...created)
        }

        allResults.push({ characterId: char.id, characterName: char.name || '', images: charImages })
      }

      await prisma.project.update({
        where: { id: projectId },
        data: { status: 'CHARACTER_IMAGE_PENDING_CONFIRM' },
      })

      const { versionService: vs } = await import('@/server/services/version.service')
      await vs.createVersion({
        projectId, entityType: 'CHARACTER_IMAGE_SET', entityId: projectId,
        snapshot: {
          total_images: allResults.reduce((s, r) => s + r.images.length, 0),
          project_status: 'CHARACTER_IMAGE_PENDING_CONFIRM',
          mode, reference_types: types,
        },
        changeType: 'GENERATE',
        description: `${mode === 'consistency' ? '一致性模式' : '快速模式'} 生成 ${characters.length} 个角色图`,
        sourceTaskId: task.id,
      })

      await prisma.generationTask.update({
        where: { id: task.id },
        data: { status: 'success', output: { total_images: allResults.reduce((s, r) => s + r.images.length, 0), mode } },
      })

      return NextResponse.json({ success: true, data: { characters: allResults, mode, referenceTypes: types } })
    } catch (genError) {
      const errorMsg = (genError as Error).message
      await prisma.project.update({ where: { id: projectId }, data: { status: 'CHARACTER_CONFIRMED' } })
      await prisma.generationTask.update({ where: { id: task.id }, data: { status: 'failed', errorMessage: errorMsg } })
      return NextResponse.json({ success: false, error: errorMsg }, { status: 500 })
    }
  } catch (error) {
    console.error('Failed to generate character images:', error)
    return NextResponse.json({ success: false, error: '生成角色图失败' }, { status: 500 })
  }
}
