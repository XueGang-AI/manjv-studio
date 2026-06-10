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

/**
 * POST /api/projects/:id/character-images/generate?mode=quick|consistency
 *
 * mode=quick (默认): 每角色 1 张 front_full_body
 * mode=consistency:  每角色 5 张 (front_full_body, front_half_body, left_side, right_side, back_view)
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
        // 角色核心描述（所有角度共享）
        const corePrompt = char.enFixedPrompt || char.zhFixedPrompt || `${char.name}, character design, ${style} style`
        const charImages: unknown[] = []

        for (let i = 0; i < types.length; i++) {
          const refType = types[i]
          const angleSuffix = ANGLE_PROMPTS[refType] || ''
          const prompt = `${corePrompt}, ${angleSuffix}`
          const isFirst = i === 0

          const genReq: ImageGenerationRequest = {
            taskType: 'character_image',
            prompt,
            negativePrompt,
            aspectRatio,
            style,
            numOutputs: 1, // 每种角度只生成 1 张
            seed: undefined,
          }

          const response = await imageAdapter.generate(genReq)

          const created = await Promise.all(response.images.map(img =>
            prisma.characterImage.create({
              data: {
                characterId: char.id, projectId,
                imageUrl: img.url, prompt,
                negativePrompt,
                seed: String(img.seed || ''),
                modelName: process.env.AGNES_IMAGE_MODEL || 'Agnes-Image-2.0-Flash',
                referenceType: refType,
                isPrimary: isFirst,
                params: { aspect_ratio: aspectRatio, style, num_outputs: 1, reference_type: refType, ...img.params },
                isSelected: isFirst,    // 第一张自动选中
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
