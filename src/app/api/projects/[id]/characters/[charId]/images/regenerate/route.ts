import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { adapterFactory } from '@/server/model-adapters/adapter.factory'
import type { ImageGenerationRequest } from '@/server/model-adapters/types'

/**
 * POST /api/projects/:id/characters/:charId/images/regenerate
 * 重新生成单个角色的候选图（删除旧图，生成新图）
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; charId: string }> }
) {
  try {
    const { id: projectId, charId } = await params

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

    // 删除该角色旧图
    await prisma.characterImage.deleteMany({
      where: { characterId: charId, projectId },
    })

    // 生成新图
    const imageAdapter = adapterFactory.getImageAdapter()
    const prompt = character.enFixedPrompt || character.zhFixedPrompt || `${character.name}`
    const style = project.artStyle || '韩漫'

    const genRequest: ImageGenerationRequest = {
      taskType: 'character_image',
      prompt,
      negativePrompt: 'ugly, deformed, bad anatomy, low quality, blurry, watermark, text',
      aspectRatio: (project.aspectRatio || '9:16') as '9:16',
      style,
      numOutputs: 4,
    }

    const response = await imageAdapter.generate(genRequest)

    const createdImages = await Promise.all(
      response.images.map((img) =>
        prisma.characterImage.create({
          data: {
            characterId: charId,
            projectId,
            imageUrl: img.url,
            prompt,
            negativePrompt: 'ugly, deformed, bad anatomy, low quality, blurry, watermark, text',
            seed: String(img.seed || ''),
            modelName: process.env.AGNES_IMAGE_MODEL || 'Agnes-Image-2.0-Flash',
            params: { aspect_ratio: project.aspectRatio, style, ...img.params },
            isSelected: false,
            isConfirmed: false,
          },
        })
      )
    )

    return NextResponse.json({
      success: true,
      data: { characterId: charId, images: createdImages, count: createdImages.length },
    })
  } catch (error) {
    console.error('Failed to regenerate images:', error)
    return NextResponse.json(
      { success: false, error: '重新生成角色图失败' },
      { status: 500 }
    )
  }
}
