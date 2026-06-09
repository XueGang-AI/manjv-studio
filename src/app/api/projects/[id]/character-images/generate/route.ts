import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { adapterFactory } from '@/server/model-adapters/adapter.factory'
import type { ImageGenerationRequest } from '@/server/model-adapters/types'

/**
 * POST /api/projects/:id/character-images/generate
 * 为所有已确认角色生成候选图
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: projectId } = await params

    const project = await prisma.project.findUnique({ where: { id: projectId } })
    if (!project) {
      return NextResponse.json({ success: false, error: '项目不存在' }, { status: 404 })
    }

    // 检查角色是否已确认
    const characters = await prisma.character.findMany({
      where: { projectId, confirmed: true },
    })

    if (characters.length === 0) {
      return NextResponse.json({
        success: false,
        error: '没有已确认的角色，请先确认角色设定卡',
      }, { status: 400 })
    }

    // 更新状态
    await prisma.project.update({
      where: { id: projectId },
      data: { status: 'CHARACTER_IMAGE_GENERATING' },
    })

    const task = await prisma.generationTask.create({
      data: {
        projectId,
        taskType: 'GENERATE_CHARACTER_IMAGES',
        modelName: process.env.AGNES_IMAGE_MODEL || 'Agnes-Image-2.0-Flash',
        status: 'running',
        input: { project_id: projectId, character_count: characters.length },
      },
    })

    try {
      const imageAdapter = adapterFactory.getImageAdapter()
      const numOutputs = 4
      const aspectRatio = (project.aspectRatio || '9:16') as '9:16' | '16:9' | '1:1'
      const style = project.artStyle || '韩漫'
      const negativePrompt = 'ugly, deformed, bad anatomy, bad proportions, low quality, blurry, pixelated, distorted face, extra fingers, missing fingers, asymmetric eyes, watermark, text, logo, extra limbs, multiple heads'

      const allResults: Array<{ characterId: string; characterName: string; images: unknown[] }> = []

      // 为每个角色生成图片
      for (const char of characters) {
        const prompt = char.enFixedPrompt || char.zhFixedPrompt || `${char.name}, character design, ${style} style`

        const genRequest: ImageGenerationRequest = {
          taskType: 'character_image',
          prompt,
          negativePrompt,
          aspectRatio,
          style,
          numOutputs,
          seed: undefined, // 随机 seed
        }

        const response = await imageAdapter.generate(genRequest)

        // 保存图片记录
        const createdImages = await Promise.all(
          response.images.map((img) =>
            prisma.characterImage.create({
              data: {
                characterId: char.id,
                projectId,
                imageUrl: img.url,
                prompt,
                negativePrompt,
                seed: String(img.seed || ''),
                modelName: process.env.AGNES_IMAGE_MODEL || 'Agnes-Image-2.0-Flash',
                params: {
                  aspect_ratio: aspectRatio,
                  style,
                  num_outputs: numOutputs,
                  ...img.params,
                },
                isSelected: false,
                isConfirmed: false,
              },
            })
          )
        )

        allResults.push({
          characterId: char.id,
          characterName: char.name || '',
          images: createdImages,
        })
      }

      // 更新状态
      await prisma.project.update({
        where: { id: projectId },
        data: { status: 'CHARACTER_IMAGE_PENDING_CONFIRM' },
      })

      const { versionService: vs } = await import('@/server/services/version.service')
      await vs.createVersion({
        projectId, entityType: 'CHARACTER_IMAGE_SET', entityId: projectId,
        snapshot: { total_images: allResults.reduce((s,r)=>s+r.images.length,0), project_status: 'CHARACTER_IMAGE_PENDING_CONFIRM' },
        changeType: 'GENERATE', description: `生成 ${characters.length} 个角色图`, sourceTaskId: task.id,
      })

      await prisma.generationTask.update({
        where: { id: task.id },
        data: {
          status: 'success',
          output: {
            total_images: allResults.reduce((sum, r) => sum + r.images.length, 0),
            character_count: allResults.length,
          },
        },
      })

      return NextResponse.json({
        success: true,
        data: {
          characters: allResults,
          totalImages: allResults.reduce((sum, r) => sum + r.images.length, 0),
        },
      })

    } catch (genError) {
      const errorMsg = (genError as Error).message
      await prisma.project.update({
        where: { id: projectId },
        data: { status: 'CHARACTER_CONFIRMED' },
      })
      await prisma.generationTask.update({
        where: { id: task.id },
        data: { status: 'failed', errorMessage: errorMsg },
      })
      return NextResponse.json({ success: false, error: errorMsg }, { status: 500 })
    }
  } catch (error) {
    console.error('Failed to generate character images:', error)
    return NextResponse.json(
      { success: false, error: '生成角色图失败' },
      { status: 500 }
    )
  }
}
