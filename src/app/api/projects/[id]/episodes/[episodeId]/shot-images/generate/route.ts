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

    // 获取所有已确认 + 已选择的标准角色图（用于 reference）
    const charImages = await prisma.characterImage.findMany({
      where: { projectId, isConfirmed: true, isSelected: true },
      include: { character: { select: { id: true, name: true } } },
    })

    // 构建角色名称匹配索引：characterName → { characterId, imageUrl }
    const refByName = new Map<string, { characterId: string; characterName: string; imageUrl: string }>()
    for (const ci of charImages) {
      const name = ci.character.name?.trim()
      if (name && ci.imageUrl) {
        refByName.set(name, {
          characterId: ci.characterId,
          characterName: name,
          imageUrl: ci.imageUrl,
        })
      }
    }

    // 获取所有镜头及其 image_prompt
    const shots = await prisma.shot.findMany({
      where: { episodeId, projectId },
      orderBy: { shotNo: 'asc' },
      include: { imagePrompts: { take: 1, orderBy: { createdAt: 'desc' } } },
    })

    if (shots.length === 0) {
      return NextResponse.json({ success: false, error: '没有镜头数据' }, { status: 400 })
    }

    // 校验：至少有一个角色的标准图
    if (refByName.size === 0) {
      return NextResponse.json({
        success: false,
        error: '请先为角色生成标准图（选择并确认至少一张角色图）',
      }, { status: 400 })
    }

    // 更新状态
    await prisma.project.update({ where: { id: projectId }, data: { status: 'SHOT_IMAGE_GENERATING' } })
    const task = await prisma.generationTask.create({
      data: { projectId, episodeId, taskType: 'GENERATE_SHOT_IMAGES',
        modelName: process.env.AGNES_IMAGE_MODEL || 'Agnes-Image-2.0-Flash',
        status: 'running', input: { shot_count: shots.length, reference_characters: [...refByName.keys()] } },
    })

    try {
      const imageAdapter = adapterFactory.getImageAdapter()
      const aspectRatio = (project.aspectRatio || '9:16') as '9:16'
      const style = project.artStyle || '韩漫'
      const numOutputs = 4
      const baseNegative = 'ugly, deformed, bad anatomy, bad proportions, low quality, blurry, pixelated, distorted face, extra fingers, missing fingers, asymmetric eyes, watermark, text, logo'

      /**
       * 根据 shot.characters 匹配标准角色图作为 reference_images。
       * 使用双向子串匹配——处理 AI 可能输出 "顾辰（背影）" 而非 "顾辰" 的情况。
       */
      function matchReferences(shotCharsRaw: unknown): Array<{ character_id: string; character_name: string; image_url: string }> {
        const shotChars: string[] = []
        if (Array.isArray(shotCharsRaw)) {
          for (const item of shotCharsRaw) {
            if (typeof item === 'string') shotChars.push(item.trim())
            else if (item && typeof item === 'object') {
              // AI 可能输出 { name: "林晓" } 格式
              const name = (item as Record<string, unknown>).name
              if (typeof name === 'string') shotChars.push(name.trim())
            }
          }
        }

        if (shotChars.length === 0) return []

        const matched: Array<{ character_id: string; character_name: string; image_url: string }> = []
        const usedNames = new Set<string>()

        for (const sc of shotChars) {
          // 精确匹配
          if (refByName.has(sc) && !usedNames.has(sc)) {
            const r = refByName.get(sc)!
            matched.push(r)
            usedNames.add(sc)
            continue
          }
          // 子串双向匹配： "顾辰（背影）" ↔ "顾辰"
          for (const [charName, r] of refByName) {
            if (usedNames.has(charName)) continue
            if (sc.includes(charName) || charName.includes(sc)) {
              matched.push(r)
              usedNames.add(charName)
              break
            }
          }
        }

        return matched
      }

      const allResults: Array<{ shotId: string; shotNo: number; images: unknown[] }> = []

      for (const shot of shots) {
        const imgPrompt = shot.imagePrompts[0]
        const prompt = imgPrompt?.enPrompt || imgPrompt?.zhPrompt || shot.action || ''
        const negative = (imgPrompt?.negativePrompt || baseNegative)

        // 匹配角色标准图
        const references = matchReferences(shot.characters)

        // 如果镜头有角色但未匹配到任何标准图，记录警告并继续（不阻止生成）
        if (shot.characters && Array.isArray(shot.characters) && (shot.characters as unknown[]).length > 0 && references.length === 0) {
          console.warn(`[shot-images] Shot #${shot.shotNo}: characters=${JSON.stringify(shot.characters)} matched 0 reference images (available: ${[...refByName.keys()].join(', ')})`)
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
