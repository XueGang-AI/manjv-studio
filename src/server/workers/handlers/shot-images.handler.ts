// ============================================
// Shot Images Worker Handler — 分镜图生成
// ============================================
//
// 从 API Route 迁移到 Worker 的分镜图生成逻辑。
// 负责：加载角色/镜头 → 匹配参考图 → 调用图片适配器 → 保存 ShotImage

import prisma from '@/lib/prisma'
import { adapterFactory } from '@/server/model-adapters/adapter.factory'
import { taskService } from '@/server/queues/task-queue.service'
import { emitTaskEvent, taskToUpdateEvent } from '../task-events'
import type { ImageGenerationRequest } from '@/server/model-adapters/types'

export interface ShotImagesInput {
  episodeId: string
}

// ─── 角色参考图匹配 ────────────────────────────────────────────────

type RefEntry = { characterId: string; characterName: string; imageUrl: string; referenceType: string }
type CharAppearance = { name: string; appearanceText: string }

function matchReferences(
  shotCharsRaw: unknown,
  shotContent: { action?: string; camera?: Record<string, unknown>; emotion?: string },
  refByName: Map<string, RefEntry[]>,
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

  const isCloseUp = /特写|近景/.test(shotSize)
  const isWideShot = /全景|远景|大全景|极远景/.test(shotSize)
  const isBackView = /背影|转身|离开|离去|走远|背面|背对/.test(contentText)
  const isSideView = /侧脸|侧身|侧面|回首|回眸|转头|扭头/.test(contentText)
  const isFullBody = /全身|站立|走路|行走|奔跑|跑过|步入|伫立/.test(contentText)
  const isExpression = /表情|眼神|凝视|注视|特写.*脸|脸部/.test(contentText)
  const isPropWeapon = /道具|武器|枪支|刀|剑|物件|物品|手持|握着|举起/.test(contentText)

  const priorityTypes: string[] = []
  if (isBackView) priorityTypes.push('back_view', 'front_full_body', 'front_half_body')
  else if (isSideView) priorityTypes.push('left_side', 'right_side', 'front_half_body', 'front_full_body')
  else if (isWideShot) priorityTypes.push('front_full_body', 'back_view', 'pose')
  else if (isCloseUp && isExpression) priorityTypes.push('front_half_body', 'expression', 'front_full_body')
  else if (isCloseUp) priorityTypes.push('front_half_body', 'front_full_body')
  else if (isFullBody) priorityTypes.push('front_full_body', 'outfit', 'pose')
  else if (isPropWeapon) priorityTypes.push('prop', 'weapon', 'front_full_body', 'front_half_body')
  else priorityTypes.push('front_half_body', 'front_full_body')

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

function buildEnhancedPrompt(
  basePrompt: string,
  shotCharsRaw: unknown,
  styleStr: string,
  charAppearanceByName: Map<string, CharAppearance>,
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

  let enhanced = basePrompt
  if (charsInShot.length > 0) {
    const charDescriptions = charsInShot.map(c => c.appearanceText).join('\n  ')
    enhanced = enhanced + `\n\n[Character Reference - MUST maintain consistency]\n  ${charDescriptions}\n\n`
  }
  enhanced = enhanced + `\n\nStyle: ${styleStr}, Korean manhwa, cinematic lighting, high quality, 8k resolution, consistent character design, same character appearance throughout the scene`
  return enhanced
}

/**
 * 执行分镜图生成
 */
export async function handleShotImages(taskId: string): Promise<void> {
  // 幂等性检查：已完成任务不重复执行
  const existingTask = await prisma.generationTask.findUnique({ where: { id: taskId } })
  if (!existingTask) throw new Error('任务不存在')
  if (existingTask.status === 'success') {
    console.log(`[worker] Task ${taskId} already completed, skipping`)
    return
  }
  if (existingTask.status !== 'pending' && existingTask.status !== 'running' && existingTask.status !== 'retrying') {
    console.log(`[worker] Task ${taskId} in status ${existingTask.status}, skipping`)
    return
  }

  const task = await taskService.startTask(taskId)

  try {
    const projectId = task.projectId
    const input = (task.input || {}) as Record<string, unknown>
    const episodeId = input.episodeId as string

    if (!episodeId) throw new Error('缺少 episodeId')

    const project = await prisma.project.findUnique({ where: { id: projectId } })
    if (!project) throw new Error('项目不存在')

    const episode = await prisma.episode.findFirst({ where: { id: episodeId, projectId } })
    if (!episode || !episode.confirmed) throw new Error('请先确认分镜脚本')

    // 更新项目状态
    await prisma.project.update({ where: { id: projectId }, data: { status: 'SHOT_IMAGE_GENERATING' } })
    await emitTaskEvent('task.running', taskToUpdateEvent(task))

    // 加载已确认角色图
    const charImages = await prisma.characterImage.findMany({
      where: { projectId, isConfirmed: true, isSelected: true },
      include: { character: { select: { id: true, name: true } } },
    })

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

    if (refByName.size === 0) {
      throw new Error('请先为角色生成标准图')
    }

    // 加载角色外貌数据
    const characters = await prisma.character.findMany({
      where: { projectId, confirmed: true },
      select: {
        id: true, name: true, gender: true, age: true,
        appearance: true, clothing: true, signatureFeatures: true,
      },
    })

    const charAppearanceByName = new Map<string, CharAppearance>()
    for (const c of characters) {
      const name = c.name?.trim()
      if (!name) continue

      const parts: string[] = [name]
      if (c.gender) parts.push(c.gender)
      if (c.age) parts.push(`${c.age}岁`)

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

    // 获取所有镜头
    const shots = await prisma.shot.findMany({
      where: { episodeId, projectId },
      orderBy: { shotNo: 'asc' },
      include: { imagePrompts: { take: 1, orderBy: { createdAt: 'desc' } } },
    })

    if (shots.length === 0) throw new Error('没有镜头数据')

    await taskService.updateProgress(taskId, 10)

    // 生成图片
    const imageAdapter = adapterFactory.getImageAdapter(project.modelProvider)
    const aspectRatio = (project.aspectRatio || '9:16') as '9:16'
    const style = project.artStyle || '韩漫'
    const numOutputs = 4
    const baseNegative = 'ugly, deformed, bad anatomy, bad proportions, low quality, blurry, pixelated, distorted face, extra fingers, missing fingers, asymmetric eyes, watermark, text, logo'

    const allResults: Array<{ shotId: string; shotNo: number; images: unknown[] }> = []

    for (let i = 0; i < shots.length; i++) {
      const shot = shots[i]
      const imgPrompt = shot.imagePrompts[0]
      const basePrompt = imgPrompt?.enPrompt || imgPrompt?.zhPrompt || shot.action || ''

      const prompt = buildEnhancedPrompt(basePrompt, shot.characters, style, charAppearanceByName)
      const negative = (imgPrompt?.negativePrompt || baseNegative)

      const references = matchReferences(shot.characters, {
        action: shot.action || undefined,
        camera: (shot.camera as Record<string, unknown>) || undefined,
        emotion: shot.emotion || undefined,
      }, refByName)

      if (shot.characters && Array.isArray(shot.characters) && (shot.characters as unknown[]).length > 0 && references.length === 0) {
        console.warn(`[worker:shot-images] Shot #${shot.shotNo}: 0 reference images matched`)
      }

      const genReq: ImageGenerationRequest = {
        taskType: 'shot_image', prompt, negativePrompt: negative,
        aspectRatio, style, numOutputs,
      }

      console.log(`[worker:shot-images] Shot #${shot.shotNo}: ${references.length} refs`)

      const response = await imageAdapter.generate(genReq)

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

      // 更新进度
      const progress = Math.round(((i + 1) / shots.length) * 80) + 10
      await taskService.updateProgress(taskId, progress)
      const updated = await prisma.generationTask.findUnique({ where: { id: taskId } })
      if (updated) await emitTaskEvent('task.progress', taskToUpdateEvent(updated))
    }

    // 更新项目状态
    await prisma.project.update({ where: { id: projectId }, data: { status: 'SHOT_IMAGE_PENDING_CONFIRM' } })

    // 创建版本快照
    const { versionService: vs } = await import('@/server/services/version.service')
    await vs.createVersion({
      projectId, entityType: 'SHOT_IMAGE_SET', entityId: episodeId,
      snapshot: { total_images: allResults.reduce((s, r) => s + r.images.length, 0), project_status: 'SHOT_IMAGE_PENDING_CONFIRM' },
      changeType: 'GENERATE', description: `生成 ${shots.length} 个镜头分镜图`, sourceTaskId: taskId,
    })

    const completed = await taskService.completeTask(taskId, {
      total_images: allResults.reduce((s, r) => s + r.images.length, 0),
    })
    await emitTaskEvent('task.completed', taskToUpdateEvent(completed))

  } catch (error) {
    const errorMsg = (error as Error).message
    console.error(`[worker:shot-images] Task ${taskId} failed:`, errorMsg)

    try {
      await prisma.project.update({ where: { id: task.projectId }, data: { status: 'STORYBOARD_CONFIRMED' } })
    } catch { /* ignore */ }

    const failed = await taskService.failTask(taskId, errorMsg)
    await emitTaskEvent('task.failed', taskToUpdateEvent(failed))
  }
}
