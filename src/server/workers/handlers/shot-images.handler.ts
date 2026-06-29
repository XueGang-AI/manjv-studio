// ============================================
// Shot Images Worker Handler — 分镜图生成
// ============================================
//
// 从 API Route 迁移到 Worker 的分镜图生成逻辑。
// 负责：加载角色/镜头 → 匹配参考图 → 调用图片适配器 → 保存 ShotImage

import prisma from '@/lib/prisma'
import { adapterFactory } from '@/server/model-adapters/adapter.factory'
import { getRuntimeModelName } from '@/server/model-adapters/model-config'
import { taskService } from '@/server/queues/task-queue.service'
import { resolveImageUrlForModel } from '@/server/services/media-reference-url'
import { emitTaskEvent, taskToUpdateEvent } from '../task-events'
import type { ImageGenerationRequest } from '@/server/model-adapters/types'

export interface ShotImagesInput {
  episodeId: string
}

// ─── 角色参考图匹配 ────────────────────────────────────────────────

type RefEntry = {
  characterId: string
  characterName: string
  imageUrl: string
  referenceType: string
  storageObjectKey?: string | null
  sourceUrl?: string | null
}
type MatchedReference = {
  character_id: string
  character_name: string
  image_url: string
  reference_type: string
  storage_object_key?: string | null
  source_url?: string | null
}
type CharAppearance = { name: string; appearanceText: string }
type ShotPromptContext = {
  shotNo: number
  shotName?: string | null
  characters?: unknown
  action?: string | null
  details?: string | null
  camera?: unknown
  visual?: unknown
  location?: string | null
  sceneTime?: string | null
  emotion?: string | null
}
type ScenePromptContext = {
  name?: string | null
  location?: string | null
  sceneTime?: string | null
  description?: string | null
}

function matchReferences(
  shotCharsRaw: unknown,
  shotContent: { action?: string; camera?: Record<string, unknown>; emotion?: string },
  refByName: Map<string, RefEntry[]>,
): MatchedReference[] {
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

  const matched: MatchedReference[] = []
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
        storage_object_key: sorted[i].storageObjectKey || null,
        source_url: sorted[i].sourceUrl || null,
      })
    }
    usedNames.add(sorted[0].characterName)

    if (matched.length >= 6) break
  }

  return matched
}

function buildEnhancedPrompt(
  basePrompt: string,
  shot: ShotPromptContext,
  styleStr: string,
  charAppearanceByName: Map<string, CharAppearance>,
  scene?: ScenePromptContext | null,
): string {
  const shotChars: string[] = []
  if (Array.isArray(shot.characters)) {
    for (const item of shot.characters) {
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
    enhanced += `\n\n[角色一致性硬约束]\n  ${charDescriptions}\n  必须严格沿用参考图中的同一人物身份、脸型、发型、发量、服装、配饰、体型比例。禁止换脸、换发型、换衣服、改变年龄感、额外增加主角。`
  }

  const sceneParts = [
    scene?.name,
    scene?.location || shot.location,
    scene?.sceneTime || shot.sceneTime,
    scene?.description,
  ].filter(Boolean)
  if (sceneParts.length > 0) {
    enhanced += `\n\n[场景一致性硬约束]\n  场景锚点：${sceneParts.join('，')}。\n  必须严格沿用场景参考图的空间布局、墙面/桌椅/屏幕/灯光位置、色温和构图基调。同一地点不得随机变成其他房间或开放办公区。`
  }

  const cameraText = typeof shot.camera === 'object' && shot.camera ? JSON.stringify(shot.camera) : ''
  const visualText = typeof shot.visual === 'object' && shot.visual ? JSON.stringify(shot.visual) : ''
  enhanced += `\n\n[镜头执行]\n  镜头 #${shot.shotNo}${shot.shotName ? `：${shot.shotName}` : ''}。动作：${shot.action || shot.details || basePrompt}。情绪：${shot.emotion || '克制、明确'}。镜头：${cameraText || '稳定短剧镜头'}。视觉：${visualText || '清晰叙事画面'}。`

  enhanced += `\n\n[画面规则]\n  竖屏 ${styleStr} 漫剧成片首帧，单一连续镜头，不要漫画分格，不要拼贴，不要海报排版。\n  不生成字幕、水印、logo、随机 UI 文字或乱码中文；如果需要表现屏幕信息，只使用清晰图表、进度条、红色警示图标、文件夹/按钮等无文字视觉符号。\n  手部只做简单可信姿势，脸部不夸张变形，背景人物如无必要必须虚化且不抢主角。\n\nStyle: ${styleStr}, Korean manhwa, cinematic lighting, high quality, consistent character design, stable environment identity`
  return enhanced
}

function selectReferenceImageUrls(characterUrls: string[], sceneUrls: string[]): string[] {
  const ordered = [
    ...characterUrls.slice(0, 2),
    ...sceneUrls.slice(0, 2),
    ...characterUrls.slice(2),
    ...sceneUrls.slice(2),
  ]
  const unique: string[] = []
  const seen = new Set<string>()
  for (const url of ordered) {
    if (!url || seen.has(url)) continue
    seen.add(url)
    unique.push(url)
    if (unique.length >= 4) break
  }
  return unique
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
          storageObjectKey: ci.storageObjectKey,
          sourceUrl: ci.sourceUrl,
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
      include: {
        imagePrompts: { take: 1, orderBy: { createdAt: 'desc' } },
        shotImages: { orderBy: { createdAt: 'desc' } },
        scene: {
          include: {
            sceneImages: {
              where: { isConfirmed: true, isSelected: true },
              orderBy: { createdAt: 'asc' },
            },
          },
        },
      },
    })

    if (shots.length === 0) throw new Error('没有镜头数据')

    await taskService.updateProgress(taskId, 10)

    // 生成图片
    const imageAdapter = adapterFactory.getImageAdapter(project.modelProvider)
    const aspectRatio = (project.aspectRatio || '9:16') as '9:16'
    const style = project.artStyle || '韩漫'
    const numOutputs = 4
    const baseNegative = 'ugly, deformed, bad anatomy, bad proportions, low quality, blurry, pixelated, distorted face, identity change, different hairstyle, different outfit, inconsistent background, unstable room layout, extra people, extra fingers, missing fingers, asymmetric eyes, bad hands, warped body, split screen, comic panel grid, poster layout, watermark, text, logo, random UI text, garbled Chinese characters'

    const allResults: Array<{ shotId: string; shotNo: number; images: unknown[] }> = []

    for (let i = 0; i < shots.length; i++) {
      const shot = shots[i]

      // 幂等性保护：已有 ShotImage 的镜头不重复调用图片 API
      // 这防止 Worker 重启后对已提交但任务未完成的镜头重复扣费
      if (shot.shotImages && shot.shotImages.length > 0) {
        console.log(`[worker:shot-images] Shot #${shot.shotNo}: ${shot.shotImages.length} existing images, skipping`)
        allResults.push({ shotId: shot.id, shotNo: shot.shotNo, images: shot.shotImages })
        // 更新进度（跳过但仍计入）
        const progress = Math.round(((i + 1) / shots.length) * 80) + 10
        await taskService.updateProgress(taskId, progress)
        const updated = await prisma.generationTask.findUnique({ where: { id: taskId } })
        if (updated) await emitTaskEvent('task.progress', taskToUpdateEvent(updated))
        continue
      }

      const imgPrompt = shot.imagePrompts[0]
      const basePrompt = imgPrompt?.enPrompt || imgPrompt?.zhPrompt || shot.action || ''

      const prompt = buildEnhancedPrompt(basePrompt, {
        shotNo: shot.shotNo,
        shotName: shot.shotName,
        characters: shot.characters,
        action: shot.action,
        details: shot.details,
        camera: shot.camera,
        visual: shot.visual,
        location: shot.location,
        sceneTime: shot.sceneTime,
        emotion: shot.emotion,
      }, style, charAppearanceByName, shot.scene)
      const negative = (imgPrompt?.negativePrompt || baseNegative)

      const references = matchReferences(shot.characters, {
        action: shot.action || undefined,
        camera: (shot.camera as Record<string, unknown>) || undefined,
        emotion: shot.emotion || undefined,
      }, refByName)

      if (shot.characters && Array.isArray(shot.characters) && (shot.characters as unknown[]).length > 0 && references.length === 0) {
        console.warn(`[worker:shot-images] Shot #${shot.shotNo}: 0 reference images matched`)
      }

      const sceneReferences = (shot.scene?.sceneImages || []).map(img => ({
        scene_id: shot.scene!.id,
        scene_name: shot.scene!.name,
        image_url: img.imageUrl || '',
        reference_type: img.referenceType || 'scene',
        storage_object_key: img.storageObjectKey,
        source_url: img.sourceUrl,
      })).filter(ref => !!ref.image_url || !!ref.storage_object_key)

      const genReq: ImageGenerationRequest = {
        taskType: 'shot_image', prompt, negativePrompt: negative,
        aspectRatio, style, numOutputs,
      }

      const characterReferenceUrls = (await Promise.all(
        references.map(ref => resolveImageUrlForModel({
          imageUrl: ref.image_url,
          sourceUrl: ref.source_url,
          storageObjectKey: ref.storage_object_key,
        }))
      )).filter((url): url is string => !!url)

      const sceneReferenceUrls = (await Promise.all(
        sceneReferences.map(ref => resolveImageUrlForModel({
          imageUrl: ref.image_url,
          sourceUrl: ref.source_url,
          storageObjectKey: ref.storage_object_key,
        }))
      )).filter((url): url is string => !!url)

      const referenceImageUrls = selectReferenceImageUrls(characterReferenceUrls, sceneReferenceUrls)

      if (referenceImageUrls.length > 0) {
        genReq.referenceImages = referenceImageUrls
      } else if (references.length > 0 || sceneReferences.length > 0) {
        console.warn(`[worker:shot-images] Shot #${shot.shotNo}: refs matched but none resolved for model`)
      }

      console.log(`[worker:shot-images] Shot #${shot.shotNo}: ${references.length} character refs, ${sceneReferences.length} scene refs, ${genReq.referenceImages?.length || 0} sent`)

      const response = await imageAdapter.generate(genReq)

      // Phase 7.1：统一持久化 + policy。Worker 通过 dotenv 加载 env，factory 可用。
      const { persistImageWithPolicy } = await import('@/server/services/media-persist')
      const createdImages = (await Promise.all(
        response.images.map(async (img) => {
          const outcome = await persistImageWithPolicy(img.url, projectId, 'image')
          if (!outcome.persisted && outcome.imageUrl === '') {
            // production 转存失败：不创建该 ShotImage，记录错误
            console.error(`[worker:shot-images] Shot #${shot.shotNo}: persist failed (prod, skipped): ${outcome.error}`)
            return null
          }
          return prisma.shotImage.create({
            data: {
              shotId: shot.id, projectId,
              imageUrl: outcome.imageUrl,
              storageObjectKey: outcome.storageObjectKey,
              storageProvider: outcome.storageProvider,
              sourceUrl: outcome.sourceUrl,
              prompt, negativePrompt: negative,
              seed: String(img.seed || ''), style, aspectRatio,
              modelName: getRuntimeModelName('image'),
              referenceImages: [...sceneReferences, ...references],
              params: {
                ...img.params,
                num_outputs: numOutputs,
                character_reference_image_count: references.length,
                scene_reference_image_count: sceneReferences.length,
                sent_reference_image_count: genReq.referenceImages?.length || 0,
              },
              isSelected: false, isConfirmed: false,
            },
          })
        })
      )).filter((x): x is NonNullable<typeof x> => x !== null)

      allResults.push({ shotId: shot.id, shotNo: shot.shotNo, images: createdImages })

      // 更新进度
      const progress = Math.round(((i + 1) / shots.length) * 80) + 10
      await taskService.updateProgress(taskId, progress)
      const updated = await prisma.generationTask.findUnique({ where: { id: taskId } })
      if (updated) await emitTaskEvent('task.progress', taskToUpdateEvent(updated))
    }

    // Phase 7.1: 持久化完整性校验。若所有图片转存失败（生产环境禁止 fallback），
    // 不得推进项目状态或标记任务成功。任务 failed，项目状态回退。
    const totalPersistedImages = allResults.reduce((s, r) => s + r.images.length, 0)
    if (totalPersistedImages === 0) {
      throw new Error('所有分镜图转存失败，未推进项目状态')
    }

    // 更新项目状态
    await prisma.project.update({ where: { id: projectId }, data: { status: 'SHOT_IMAGE_PENDING_CONFIRM' } })

    // 创建版本快照
    const { versionService: vs } = await import('@/server/services/version.service')
    await vs.createVersion({
      projectId, entityType: 'SHOT_IMAGE_SET', entityId: episodeId,
      snapshot: { total_images: totalPersistedImages, project_status: 'SHOT_IMAGE_PENDING_CONFIRM' },
      changeType: 'GENERATE', description: `生成 ${shots.length} 个镜头分镜图`, sourceTaskId: taskId,
    })

    const completed = await taskService.completeTask(taskId, {
      total_images: totalPersistedImages,
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
