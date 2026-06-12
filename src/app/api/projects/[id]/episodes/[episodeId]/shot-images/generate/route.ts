import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { adapterFactory } from '@/server/model-adapters/adapter.factory'
import type { ImageGenerationRequest } from '@/server/model-adapters/types'

/**
 * POST /api/projects/:id/episodes/:episodeId/shot-images/generate
 * 为所有镜头生成分镜候选图
 *
 * 角色一致性策略：
 * 1. 从数据库加载角色完整外貌描述，直接嵌入 prompt（不依赖 API 的 reference_images）
 * 2. 根据镜头景别/内容自动选择最匹配的角色参考角度
 * 3. reference_images 作为辅助增强
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

    // ─── 1. 加载已确认角色图（含 reference_type） ───
    const charImages = await prisma.characterImage.findMany({
      where: { projectId, isConfirmed: true, isSelected: true },
      include: { character: { select: { id: true, name: true } } },
    })

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

    // ─── 2. 加载角色完整外貌数据（用于嵌入 prompt） ───
    const characters = await prisma.character.findMany({
      where: { projectId, confirmed: true },
      select: {
        id: true, name: true, gender: true, age: true,
        appearance: true, clothing: true,
        signatureFeatures: true,
      },
    })

    type CharAppearance = {
      name: string
      appearanceText: string
    }
    const charAppearanceByName = new Map<string, CharAppearance>()
    for (const c of characters) {
      const name = c.name?.trim()
      if (!name) continue

      const parts: string[] = []
      parts.push(name)

      if (c.gender) parts.push(c.gender)
      if (c.age) parts.push(`${c.age}岁`)

      // 提取外貌关键信息
      if (c.appearance && typeof c.appearance === 'object') {
        const app = c.appearance as Record<string, unknown>
        if (app.hair_color && app.hair_style) parts.push(`${app.hair_style}、${app.hair_color}`)
        else if (app.hair_style) parts.push(String(app.hair_style))
        else if (app.hair_color) parts.push(`发色${app.hair_color}`)
        if (app.eyes) parts.push(`眼睛：${app.eyes}`)
        if (app.skin) parts.push(`肤色：${app.skin}`)
        if (app.face_shape) parts.push(`脸型：${app.face_shape}`)
        if (app.body_shape) parts.push(`体型：${app.body_shape}`)
      }

      // 提取服装关键信息（日常装）
      if (c.clothing && typeof c.clothing === 'object') {
        const cloth = c.clothing as Record<string, unknown>
        const daily = (cloth.daily || cloth) as Record<string, unknown> | undefined
        if (daily) {
          if (daily.top) parts.push(`上衣：${daily.top}`)
          if (daily.bottom) parts.push(`下装：${daily.bottom}`)
          if (daily.shoes) parts.push(`鞋子：${daily.shoes}`)
          if (daily.accessories) parts.push(`配饰：${daily.accessories}`)
        }
      }

      // 标志性特征
      if (Array.isArray(c.signatureFeatures) && c.signatureFeatures.length > 0) {
        parts.push(`标志特征：${c.signatureFeatures.join('、')}`)
      }

      charAppearanceByName.set(name, {
        name,
        appearanceText: parts.join('。'),
      })
    }

    // ─── 3. 获取所有镜头 ───
    const shots = await prisma.shot.findMany({
      where: { episodeId, projectId },
      orderBy: { shotNo: 'asc' },
      include: { imagePrompts: { take: 1, orderBy: { createdAt: 'desc' } } },
    })

    if (shots.length === 0) {
      return NextResponse.json({ success: false, error: '没有镜头数据' }, { status: 400 })
    }

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
        modelName: project.modelProvider === 'ark' ? (process.env.ARK_IMAGE_MODEL || 'doubao-seedream-5-0-260128') : (process.env.AGNES_IMAGE_MODEL || 'agnes-image-2.0-flash'),
        status: 'running', input: { shot_count: shots.length, reference_characters: [...refByName.keys()] } },
    })

    try {
      const imageAdapter = adapterFactory.getImageAdapter(project.modelProvider)
      const aspectRatio = (project.aspectRatio || '9:16') as '9:16'
      const style = project.artStyle || '韩漫'
      const numOutputs = 4
      const baseNegative = 'ugly, deformed, bad anatomy, bad proportions, low quality, blurry, pixelated, distorted face, extra fingers, missing fingers, asymmetric eyes, watermark, text, logo'

      /**
       * 根据镜头景别和内容自动匹配最合适的角色参考图角度
       *
       * 匹配规则：
       * - shot_size 优先：特写→半身, 近景→半身, 中景→全身, 全景/远景→全身
       * - 动作关键词辅助：背影→背面, 侧脸→侧面, 走路/跑→全身
       * - 每角色选 2 张最相关，总数 ≤ 6
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

        const contentText = [
          shotContent.action || '',
          JSON.stringify(shotContent.camera || {}),
          shotContent.emotion || '',
        ].join(' ').toLowerCase()

        const camera = shotContent.camera || {}
        const shotSize = String(camera.shot_size || '')

        // ─── 根据 shot_size 确定优先角度 ───
        // 特写/近景 → 半身/正脸为主
        const isCloseUp = /特写|近景/.test(shotSize)
        // 中景 → 全身为主
        const isMidShot = /中景/.test(shotSize)
        // 全景/远景 → 全身
        const isWideShot = /全景|远景|大全景|极远景/.test(shotSize)

        // 动作关键词补充
        const isBackView   = /背影|转身|离开|离去|走远|背面|背对|离去/.test(contentText)
        const isSideView   = /侧脸|侧身|侧面|回首|回眸|转头|扭头/.test(contentText)
        const isFullBody   = /全身|站立|走路|行走|奔跑|跑过|步入|伫立/.test(contentText)
        const isExpression = /表情|眼神|凝视|注视|特写.*脸|脸部/.test(contentText)
        const isPropWeapon = /道具|武器|枪支|刀|剑|物件|物品|手持|握着|举起/.test(contentText)

        // 构建优先级列表
        const priorityTypes: string[] = []
        if (isBackView)       priorityTypes.push('back_view', 'front_full_body', 'front_half_body')
        else if (isSideView)  priorityTypes.push('left_side', 'right_side', 'front_half_body', 'front_full_body')
        else if (isWideShot)  priorityTypes.push('front_full_body', 'back_view', 'pose')
        else if (isCloseUp && isExpression) priorityTypes.push('front_half_body', 'expression', 'front_full_body')
        else if (isCloseUp)   priorityTypes.push('front_half_body', 'front_full_body')
        else if (isMidShot)   priorityTypes.push('front_full_body', 'front_half_body', 'pose')
        else if (isFullBody)  priorityTypes.push('front_full_body', 'outfit', 'pose')
        else if (isPropWeapon) priorityTypes.push('prop', 'weapon', 'front_full_body', 'front_half_body')
        else                  priorityTypes.push('front_half_body', 'front_full_body')

        const matched: Array<{ character_id: string; character_name: string; image_url: string; reference_type: string }> = []
        const usedNames = new Set<string>()

        for (const sc of shotChars) {
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

          const sorted = [...entries].sort((a, b) => {
            const ai = priorityTypes.indexOf(a.referenceType)
            const bi = priorityTypes.indexOf(b.referenceType)
            if (ai >= 0 && bi >= 0) return ai - bi
            if (ai >= 0) return -1
            if (bi >= 0) return 1
            return 0
          })

          for (let i = 0; i < Math.min(sorted.length, 2); i++) {
            matched.push({
              character_id: sorted[i].characterId,
              character_name: sorted[i].characterName,
              image_url: sorted[i].imageUrl,
              reference_type: sorted[i].referenceType,
            })
          }
          usedNames.add(sorted[0].characterName)

          if (matched.length >= 6) break
        }

        return matched
      }

      /**
       * 构建嵌入角色外貌的增强 prompt
       * 将镜头中出场角色的外貌描述直接写入 prompt，确保 AI 生成一致的人物
       */
      function buildEnhancedPrompt(
        basePrompt: string,
        shotCharsRaw: unknown,
        styleStr: string,
      ): string {
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

        // 找到镜头中出场的角色外貌
        const charsInShot: CharAppearance[] = []
        for (const sc of shotChars) {
          let found = charAppearanceByName.get(sc)
          if (!found) {
            for (const [name, info] of charAppearanceByName) {
              if (sc.includes(name) || name.includes(sc)) {
                found = info; break
              }
            }
          }
          if (found) charsInShot.push(found)
        }

        // 构建增强 prompt
        let enhanced = basePrompt

        if (charsInShot.length > 0) {
          const charDescriptions = charsInShot.map(c => c.appearanceText).join('\n  ')
          enhanced = enhanced + `\n\n[Character Reference - MUST maintain consistency]\n  ${charDescriptions}\n\n`
        }

        // 全局画风/质量约束
        enhanced = enhanced + `\n\nStyle: ${styleStr}, Korean manhwa, cinematic lighting, high quality, 8k resolution, consistent character design, same character appearance throughout the scene`

        return enhanced
      }

      const allResults: Array<{ shotId: string; shotNo: number; images: unknown[] }> = []

      for (const shot of shots) {
        const imgPrompt = shot.imagePrompts[0]
        const basePrompt = imgPrompt?.enPrompt || imgPrompt?.zhPrompt || shot.action || ''

        // 构建增强 prompt（嵌入角色外貌描述）
        const prompt = buildEnhancedPrompt(basePrompt, shot.characters, style)

        const negative = (imgPrompt?.negativePrompt || baseNegative)

        // 根据镜头内容自动选择最匹配的角色参考图
        const references = matchReferences(shot.characters, {
          action: shot.action || undefined,
          camera: (shot.camera as Record<string,unknown>) || undefined,
          emotion: shot.emotion || undefined,
        })

        if (shot.characters && Array.isArray(shot.characters) && (shot.characters as unknown[]).length > 0 && references.length === 0) {
          console.warn(`[shot-images] Shot #${shot.shotNo}: characters=${JSON.stringify(shot.characters)} matched 0 reference images (available: ${[...refByName.keys()].join(', ')})`)
        }

        // NOTE: Agnes Image API 传 reference_images 时忽略 num_outputs，只返回 1 张。
        // 角色一致性已通过 prompt 中的 Character Reference 描述保证，此处不传 reference_images。
        const genReq: ImageGenerationRequest = {
          taskType: 'shot_image', prompt, negativePrompt: negative,
          aspectRatio, style, numOutputs,
        }

        console.log(`[shot-images] Shot #${shot.shotNo}: ${references.length} refs (${references.map(r => `${r.character_name}/${r.reference_type}`).join(', ')}), prompt=${prompt.substring(0, 150)}...`)

        const response = await imageAdapter.generate(genReq)

        // 保存
        const createdImages = await Promise.all(response.images.map(img =>
          prisma.shotImage.create({
            data: {
              shotId: shot.id, projectId,
              imageUrl: img.url, prompt, negativePrompt: negative,
              seed: String(img.seed || ''), style, aspectRatio,
              modelName: project.modelProvider === 'ark' ? (process.env.ARK_IMAGE_MODEL || 'doubao-seedream-5-0-260128') : (process.env.AGNES_IMAGE_MODEL || 'agnes-image-2.0-flash'),
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
