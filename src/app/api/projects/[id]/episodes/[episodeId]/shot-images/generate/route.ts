import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { adapterFactory } from '@/server/model-adapters/adapter.factory'
import type { ImageGenerationRequest } from '@/server/model-adapters/types'

/**
 * POST /api/projects/:id/episodes/:episodeId/shot-images/generate
 * 为所有镜头生成分镜候选图
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; episodeId: string }> }
) {
  try {
    const { id: projectId, episodeId } = await params

    const project = await prisma.project.findUnique({ where: { id: projectId } })
    if (!project) return NextResponse.json({ success: false, error: '项目不存在' }, { status: 404 })

    const episode = await prisma.episode.findFirst({ where: { id: episodeId, projectId } })
    if (!episode || !episode.confirmed) {
      return NextResponse.json({ success: false, error: '请先确认分镜脚本' }, { status: 400 })
    }

    // 获取所有已确认角色的标准图（用于 reference）
    const charImages = await prisma.characterImage.findMany({
      where: { projectId, isConfirmed: true },
      include: { character: { select: { id: true, name: true } } },
    })
    const refMap = new Map(charImages.map(ci => [ci.characterId, ci]))

    // 获取所有镜头及其 image_prompt
    const shots = await prisma.shot.findMany({
      where: { episodeId, projectId },
      orderBy: { shotNo: 'asc' },
      include: { imagePrompts: { take: 1, orderBy: { createdAt: 'desc' } } },
    })

    if (shots.length === 0) {
      return NextResponse.json({ success: false, error: '没有镜头数据' }, { status: 400 })
    }

    // 更新状态
    await prisma.project.update({ where: { id: projectId }, data: { status: 'SHOT_IMAGE_GENERATING' } })
    const task = await prisma.generationTask.create({
      data: { projectId, episodeId, taskType: 'GENERATE_SHOT_IMAGES',
        modelName: process.env.AGNES_IMAGE_MODEL || 'Agnes-Image-2.0-Flash',
        status: 'running', input: { shot_count: shots.length } },
    })

    try {
      const imageAdapter = adapterFactory.getImageAdapter()
      const aspectRatio = (project.aspectRatio || '9:16') as '9:16'
      const style = project.artStyle || '韩漫'
      const numOutputs = 4
      const baseNegative = 'ugly, deformed, bad anatomy, bad proportions, low quality, blurry, pixelated, distorted face, extra fingers, missing fingers, asymmetric eyes, watermark, text, logo'

      const allResults: Array<{ shotId: string; shotNo: number; images: unknown[] }> = []

      for (const shot of shots) {
        const imgPrompt = shot.imagePrompts[0]
        const prompt = imgPrompt?.enPrompt || imgPrompt?.zhPrompt || shot.action || ''
        const negative = (imgPrompt?.negativePrompt || baseNegative)

        // 查找该镜头角色对应的标准图
        const shotChars = (shot.characters as string[]) || []
        const references: Array<{ character_id: string; character_name: string; image_url: string }> = []
        for (const [charId, ci] of refMap) {
          if (shotChars.includes(ci.character.name || '')) {
            references.push({
              character_id: charId, character_name: ci.character.name || '',
              image_url: ci.imageUrl || '',
            })
          }
        }

        const genReq: ImageGenerationRequest = {
          taskType: 'shot_image', prompt, negativePrompt: negative,
          referenceImages: references.map(r => r.image_url).filter(Boolean),
          aspectRatio, style, numOutputs,
        }

        const response = await imageAdapter.generate(genReq)

        // 保存
        const createdImages = await Promise.all(response.images.map(img =>
          prisma.shotImage.create({
            data: {
              shotId: shot.id, projectId,
              imageUrl: img.url, prompt, negativePrompt: negative,
              seed: String(img.seed || ''), style, aspectRatio,
              modelName: process.env.AGNES_IMAGE_MODEL || 'Agnes-Image-2.0-Flash',
              referenceImages: references,
              params: { ...img.params, num_outputs: numOutputs },
              isSelected: false, isConfirmed: false,
            },
          })
        ))

        allResults.push({ shotId: shot.id, shotNo: shot.shotNo, images: createdImages })
      }

      await prisma.project.update({ where: { id: projectId }, data: { status: 'SHOT_IMAGE_PENDING_CONFIRM' } })
      const { versionService: vs } = await import('@/server/services/version.service')
      await vs.createVersion({
        projectId, entityType: 'SHOT_IMAGE_SET', entityId: episodeId,
        snapshot: { total_images: allResults.reduce((s,r)=>s+r.images.length,0), project_status: 'SHOT_IMAGE_PENDING_CONFIRM' },
        changeType: 'GENERATE', description: `生成 ${shots.length} 个镜头分镜图`, sourceTaskId: task.id,
      })
      await prisma.generationTask.update({
        where: { id: task.id },
        data: { status: 'success', output: { total_images: allResults.reduce((s, r) => s + r.images.length, 0) } },
      })

      return NextResponse.json({ success: true, data: { shots: allResults, totalImages: allResults.reduce((s, r) => s + r.images.length, 0) } })
    } catch (genError) {
      const msg = (genError as Error).message
      await prisma.project.update({ where: { id: projectId }, data: { status: 'STORYBOARD_CONFIRMED' } })
      await prisma.generationTask.update({ where: { id: task.id }, data: { status: 'failed', errorMessage: msg } })
      return NextResponse.json({ success: false, error: msg }, { status: 500 })
    }
  } catch (error) {
    console.error('Failed to generate shot images:', error)
    return NextResponse.json({ success: false, error: '生成分镜图失败' }, { status: 500 })
  }
}
