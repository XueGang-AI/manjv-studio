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

    // 获取角色标准参考图（isSelected + isConfirmed）
    const charImages = await prisma.characterImage.findMany({
      where: { projectId, isConfirmed: true, isSelected: true },
      include: { character: { select: { id: true, name: true } } },
    })

    // 构建 name → { id, url } 索引，用于双向子串匹配
    const refByName = new Map<string, { characterId: string; characterName: string; imageUrl: string }>()
    for (const ci of charImages) {
      const name = ci.character.name?.trim()
      if (name && ci.imageUrl) {
        refByName.set(name, { characterId: ci.characterId, characterName: name, imageUrl: ci.imageUrl })
      }
    }

    // 双向子串匹配角色名（处理 AI 输出 "顾辰（背影）" 等情况）
    const shotCharsRaw = shot.characters
    const shotChars: string[] = []
    if (Array.isArray(shotCharsRaw)) {
      for (const item of shotCharsRaw as unknown[]) {
        if (typeof item === 'string') shotChars.push(item.trim())
        else if (item && typeof item === 'object') {
          const name = (item as Record<string, unknown>).name
          if (typeof name === 'string') shotChars.push(name.trim())
        }
      }
    }

    const references: Array<{ character_id: string; character_name: string; image_url: string }> = []
    const usedNames = new Set<string>()
    for (const sc of shotChars) {
      if (refByName.has(sc) && !usedNames.has(sc)) {
        const r = refByName.get(sc)!
        references.push(r)
        usedNames.add(sc)
        continue
      }
      for (const [charName, r] of refByName) {
        if (usedNames.has(charName)) continue
        if (sc.includes(charName) || charName.includes(sc)) {
          references.push(r)
          usedNames.add(charName)
          break
        }
      }
    }

    if (shotChars.length > 0 && references.length === 0) {
      console.warn(`[shot-images:regenerate] Shot #${shot.shotNo}: characters=${JSON.stringify(shotChars)} matched 0 references (available: ${[...refByName.keys()].join(', ')})`)
    }

    const prompt = imgPrompt?.enPrompt || imgPrompt?.zhPrompt || shot.action || ''
    const style = project?.artStyle || '韩漫'
    const genReq: ImageGenerationRequest = {
      taskType: 'shot_image', prompt,
      negativePrompt: imgPrompt?.negativePrompt || 'ugly, deformed, bad anatomy, low quality, blurry, watermark, text',
      referenceImages: references.map(r => r.image_url).filter(Boolean),
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
