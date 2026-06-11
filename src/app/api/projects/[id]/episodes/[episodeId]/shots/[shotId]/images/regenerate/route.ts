import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { adapterFactory } from '@/server/model-adapters/adapter.factory'
import type { ImageGenerationRequest } from '@/server/model-adapters/types'

/**
 * POST /api/projects/:id/episodes/:eid/shots/:shotId/images/regenerate
 * 重新生成单个镜头的分镜候选图（先生成后删除旧图）
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

    const style = project?.artStyle || '韩漫'
    const aspectRatio = (project?.aspectRatio || '9:16') as '9:16'

    // ─── 加载角色数据 ───
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

    const characters = await prisma.character.findMany({
      where: { projectId, confirmed: true },
      select: { id: true, name: true, gender: true, age: true, appearance: true, clothing: true, signatureFeatures: true },
    })

    const charAppearanceByName = new Map<string, { name: string; appearanceText: string }>()
    for (const c of characters) {
      const name = c.name?.trim()
      if (!name) continue
      const parts: string[] = []
      parts.push(name)
      if (c.gender) parts.push(c.gender)
      if (c.age) parts.push(`${c.age}岁`)
      if (c.appearance && typeof c.appearance === 'object') {
        const app = c.appearance as Record<string, unknown>
        if (app.hair_color && app.hair_style) parts.push(`${app.hair_style}、${app.hair_color}`)
        else if (app.hair_style) parts.push(String(app.hair_style))
        if (app.eyes) parts.push(`眼睛：${app.eyes}`)
        if (app.skin) parts.push(`肤色：${app.skin}`)
        if (app.face_shape) parts.push(`脸型：${app.face_shape}`)
        if (app.body_shape) parts.push(`体型：${app.body_shape}`)
      }
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
      if (Array.isArray(c.signatureFeatures) && c.signatureFeatures.length > 0) {
        parts.push(`标志特征：${c.signatureFeatures.join('、')}`)
      }
      charAppearanceByName.set(name, { name, appearanceText: parts.join('。') })
    }

    // ─── 匹配角色参考图（多角度） ───
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

    // 根据镜头内容确定角度优先级
    const camera = (shot.camera as Record<string, unknown>) || {}
    const contentText = [shot.action || '', JSON.stringify(camera), shot.emotion || ''].join(' ').toLowerCase()
    const shotSize = String(camera.shot_size || '')
    const isCloseUp = /特写|近景/.test(shotSize)
    const isWideShot = /全景|远景|大全景/.test(shotSize)
    const isBackView = /背影|转身|离开|离去|走远|背面|背对/.test(contentText)
    const isSideView = /侧脸|侧身|侧面|回首|回眸|转头|扭头/.test(contentText)
    const isExpression = /表情|眼神|凝视|注视|特写.*脸|脸部/.test(contentText)

    const priorityTypes: string[] = []
    if (isBackView)       priorityTypes.push('back_view', 'front_full_body', 'front_half_body')
    else if (isSideView)  priorityTypes.push('left_side', 'right_side', 'front_half_body', 'front_full_body')
    else if (isWideShot)  priorityTypes.push('front_full_body', 'back_view', 'pose')
    else if (isCloseUp && isExpression) priorityTypes.push('front_half_body', 'expression', 'front_full_body')
    else if (isCloseUp)   priorityTypes.push('front_half_body', 'front_full_body')
    else                  priorityTypes.push('front_half_body', 'front_full_body')

    const references: Array<{ character_id: string; character_name: string; image_url: string; reference_type: string }> = []
    const usedNames = new Set<string>()
    for (const sc of shotChars) {
      let entries: RefEntry[] | undefined
      if (refByName.has(sc)) entries = refByName.get(sc)
      else {
        for (const [name, refs] of refByName) {
          if (sc.includes(name) || name.includes(sc)) { entries = refs; break }
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
        references.push({
          character_id: sorted[i].characterId,
          character_name: sorted[i].characterName,
          image_url: sorted[i].imageUrl,
          reference_type: sorted[i].referenceType,
        })
      }
      usedNames.add(sorted[0].characterName)
    }

    // ─── 构建增强 prompt（嵌入角色外貌描述） ───
    const basePrompt = imgPrompt?.enPrompt || imgPrompt?.zhPrompt || shot.action || ''
    const charsInShot = shotChars
      .map(sc => {
        let f = charAppearanceByName.get(sc)
        if (!f) {
          for (const [name, info] of charAppearanceByName) {
            if (sc.includes(name) || name.includes(sc)) { f = info; break }
          }
        }
        return f
      })
      .filter(Boolean)

    let prompt = basePrompt
    if (charsInShot.length > 0) {
      const charDescriptions = charsInShot.map(c => c!.appearanceText).join('\n  ')
      prompt = prompt + `\n\n[Character Reference - MUST maintain consistency]\n  ${charDescriptions}\n\n`
    }
    prompt = prompt + `\n\nStyle: ${style}, Korean manhwa, cinematic lighting, high quality, 8k resolution, consistent character design, same character appearance throughout the scene`

    const negative = imgPrompt?.negativePrompt || 'ugly, deformed, bad anatomy, bad proportions, low quality, blurry, pixelated, distorted face, extra fingers, missing fingers, asymmetric eyes, watermark, text, logo'

    // ─── 先生成新图 ───
    // NOTE: Agnes Image API 传 reference_images 时忽略 num_outputs，只返回 1 张。
    // 角色一致性已通过 prompt 中的 Character Reference 描述保证。
    const genReq: ImageGenerationRequest = {
      taskType: 'shot_image', prompt, negativePrompt: negative,
      aspectRatio, style, numOutputs: 4,
    }

    const response = await adapterFactory.getImageAdapter(project?.modelProvider).generate(genReq)

    if (!response.images.length) {
      return NextResponse.json({ success: false, error: '生成失败，旧图已保留' }, { status: 500 })
    }

    // ─── 生成成功，事务内替换旧图 ───
    const created = await prisma.$transaction(async (tx) => {
      await tx.shotImage.deleteMany({ where: { shotId, projectId } })

      return Promise.all(response.images.map(img =>
        tx.shotImage.create({
          data: {
            shotId, projectId, imageUrl: img.url, prompt,
            negativePrompt: negative, seed: String(img.seed || ''),
            style, aspectRatio,
            modelName: process.env.AGNES_IMAGE_MODEL || 'Agnes-Image-2.0-Flash',
            referenceImages: references,
            params: { ...img.params, num_outputs: 4 },
            isSelected: false, isConfirmed: false,
          },
        })
      ))
    })

    return NextResponse.json({ success: true, data: { shotId, images: created, count: created.length } })
  } catch (error) {
    console.error('Failed to regenerate shot images:', error)
    return NextResponse.json({ success: false, error: '重新生成失败，旧图已保留' }, { status: 500 })
  }
}
