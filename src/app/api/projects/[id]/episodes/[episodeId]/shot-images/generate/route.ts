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

    // 获取所有已确认 + 已选择的标准角色图（含 reference_type）
    const charImages = await prisma.characterImage.findMany({
      where: { projectId, isConfirmed: true, isSelected: true },
      include: { character: { select: { id: true, name: true } } },
    })

    // 构建索引：characterName → { type → { characterId, imageUrl, referenceType } }
    // 支持同一角色多张不同角度的参考图
    type RefEntry = { characterId: string; characterName: string; imageUrl: string; referenceType: string }
    const refByName = new Map<string, RefEntry[]>()
    for (const ci of charImages) {
      const name = ci.character.name?.trim()
      if (name && ci.imageUrl) {
        if (!refByName.has(name)) refByName.set(name, [])
        refByName.get(name)!.push({
          characterId: ci.characterId,
          characterName: name,
          imageUrl: ci.imageUrl,
          referenceType: ci.referenceType || 'front_full_body',
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
       * 根据 shot.characters + shot 内容自动选择最匹配的角色参考图。
       *
       * 选择策略：
       * 1. 先通过双向子串匹配找到出场角色
       * 2. 根据镜头内容（camera/action/emotion）决定优先 reference_type
       * 3. 每角色最多选 2-3 张，总共不超过 6 张
       */
      function matchReferences(
        shotCharsRaw: unknown,
        shotContent: { action?: string; camera?: Record<string,unknown>; emotion?: string }
      ): Array<{ character_id: string; character_name: string; image_url: string; reference_type: string }> {
        const shotChars: string[] = []
        if (Array.isArray(shotCharsRaw)) {
          for (const item of shotCharsRaw) {
            if (typeof item === 'string') shotChars.push(item.trim())
            else if (item && typeof item === 'object') {
              const name = (item as Record<string, unknown>).name
              if (typeof name === 'string') shotChars.push(name.trim())
            }
          }
        }
        if (shotChars.length === 0) return []

        // 解析镜头内容，确定优先 reference_type
        const contentText = [
          shotContent.action || '',
          JSON.stringify(shotContent.camera || {}),
          shotContent.emotion || '',
        ].join(' ').toLowerCase()

        // 判断镜头类型 → 优先 reference_type 顺序
        const isBackView   = /背影|转身|离开|离去|走远|背面|背对/.test(contentText)
        const isSideView   = /侧脸|侧身|侧面|回首|回眸|转头|扭头/.test(contentText)
        const isFullBody   = /全身|站立|走路|行走|奔跑|跑过|步入/.test(contentText)
        const isCloseUp    = /特写|近景|脸部|眼神|表情|凝视|注视/.test(contentText)
        const isPropWeapon = /道具|武器|枪支|刀|剑|武器|物件|物品|手持|握着/.test(contentText)

        // 优先级排序：匹配的类型排前面
        const priorityTypes: string[] = []
        if (isBackView)   priorityTypes.push('back_view', 'front_full_body')
        else if (isSideView) priorityTypes.push('left_side', 'right_side', 'front_half_body')
        else if (isFullBody) priorityTypes.push('front_full_body', 'outfit', 'pose')
        else if (isCloseUp)  priorityTypes.push('front_half_body', 'front_full_body', 'expression')
        else if (isPropWeapon) priorityTypes.push('prop', 'weapon', 'front_full_body')
        else priorityTypes.push('front_half_body', 'front_full_body') // 默认：对话/一般镜头

        const matched: Array<{ character_id: string; character_name: string; image_url: string; reference_type: string }> = []
        const usedNames = new Set<string>()

        for (const sc of shotChars) {
          // 找到匹配的角色
          let entries: RefEntry[] | undefined
          if (refByName.has(sc)) {
            entries = refByName.get(sc)
          } else {
            for (const [name, refs] of refByName) {
              if (sc.includes(name) || name.includes(sc)) {
                entries = refs; break
              }
            }
          }
          if (!entries || usedNames.has(entries[0].characterName)) continue

          // 按优先级排序该角色的参考图
          const sorted = [...entries].sort((a, b) => {
            const ai = priorityTypes.indexOf(a.referenceType)
            const bi = priorityTypes.indexOf(b.referenceType)
            if (ai >= 0 && bi >= 0) return ai - bi
            if (ai >= 0) return -1
            if (bi >= 0) return 1
            return 0
          })

          // 每角色最多选 2 张最相关的
          for (let i = 0; i < Math.min(sorted.length, 2); i++) {
            matched.push({ ...sorted[i], reference_type: sorted[i].referenceType })
          }
          usedNames.add(sorted[0].characterName)

          // 总上限 6 张
          if (matched.length >= 6) break
        }

        return matched
      }

      const allResults: Array<{ shotId: string; shotNo: number; images: unknown[] }> = []

      for (const shot of shots) {
        const imgPrompt = shot.imagePrompts[0]
        const prompt = imgPrompt?.enPrompt || imgPrompt?.zhPrompt || shot.action || ''
        const negative = (imgPrompt?.negativePrompt || baseNegative)

        // 根据镜头内容自动选择最匹配的角色参考图
        const references = matchReferences(shot.characters, {
          action: shot.action || undefined,
          camera: (shot.camera as Record<string,unknown>) || undefined,
          emotion: shot.emotion || undefined,
        })

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
