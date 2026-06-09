import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { adapterFactory } from '@/server/model-adapters/adapter.factory'
import type { ImageGenerationRequest } from '@/server/model-adapters/types'

/**
 * POST /api/projects/:id/episodes/:eid/shots/:shotId/images/regenerate
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; episodeId: string; shotId: string }> }
) {
  try {
    const { id: projectId, episodeId, shotId } = await params

    const shot = await prisma.shot.findFirst({ where: { id: shotId, episodeId, projectId } })
    if (!shot) return NextResponse.json({ success: false, error: '镜头不存在' }, { status: 404 })

    const project = await prisma.project.findUnique({ where: { id: projectId } })
    const imgPrompt = await prisma.imagePrompt.findFirst({ where: { shotId }, orderBy: { createdAt: 'desc' } })

    // 删除旧图
    await prisma.shotImage.deleteMany({ where: { shotId, projectId } })

    // 获取角色参考图
    const charImages = await prisma.characterImage.findMany({
      where: { projectId, isConfirmed: true },
      include: { character: { select: { name: true } } },
    })
    const refMap = new Map(charImages.map(ci => [ci.character?.name || '', ci.imageUrl]))

    const shotChars = (shot.characters as string[]) || []
    const references = shotChars.map(name => ({ character_name: name, image_url: refMap.get(name) || '' })).filter(r => r.image_url)

    const prompt = imgPrompt?.enPrompt || imgPrompt?.zhPrompt || shot.action || ''
    const style = project?.artStyle || '韩漫'
    const genReq: ImageGenerationRequest = {
      taskType: 'shot_image', prompt,
      negativePrompt: imgPrompt?.negativePrompt || 'ugly, deformed, bad anatomy, low quality, blurry, watermark, text',
      referenceImages: references.map(r => r.image_url),
      aspectRatio: (project?.aspectRatio || '9:16') as '9:16', style, numOutputs: 4,
    }

    const response = await adapterFactory.getImageAdapter().generate(genReq)

    const created = await Promise.all(response.images.map(img =>
      prisma.shotImage.create({
        data: {
          shotId, projectId, imageUrl: img.url, prompt,
          negativePrompt: imgPrompt?.negativePrompt || '', seed: String(img.seed || ''),
          style, aspectRatio: project?.aspectRatio,
          modelName: process.env.AGNES_IMAGE_MODEL || 'Agnes-Image-2.0-Flash',
          referenceImages: references, params: {},
          isSelected: false, isConfirmed: false,
        },
      })
    ))

    return NextResponse.json({ success: true, data: { shotId, images: created, count: created.length } })
  } catch (error) {
    console.error('Failed to regenerate shot images:', error)
    return NextResponse.json({ success: false, error: '重新生成失败' }, { status: 500 })
  }
}
