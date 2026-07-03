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
import {
  buildCharacterAppearanceMap,
  buildShotImageNegativePrompt,
  buildShotImagePrompt,
  matchShotCharacterReferences,
  selectReferenceImageUrls,
  type CharacterReferenceEntry,
} from '@/server/services/shot-regeneration-quality'
import { withWorkerRetry } from '../handler-utils'
import { emitTaskEvent, taskToUpdateEvent } from '../task-events'
import type { ImageGenerationRequest } from '@/server/model-adapters/types'

export interface ShotImagesInput {
  episodeId: string
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

    const refByName = new Map<string, CharacterReferenceEntry[]>()
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

    const charAppearanceByName = buildCharacterAppearanceMap(characters)

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

      const prompt = buildShotImagePrompt(basePrompt, {
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
      const negative = buildShotImageNegativePrompt(imgPrompt?.negativePrompt || baseNegative)

      const references = matchShotCharacterReferences(shot.characters, {
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

      const response = await withWorkerRetry(
        () => imageAdapter.generate(genReq),
        3,
        `shot-${shot.shotNo}/image`,
      )

      // Phase 7.1：统一持久化 + policy。Worker 通过 dotenv 加载 env，factory 可用。
      const { persistImageWithPolicy } = await import('@/server/services/media-persist')
      const createdImages = (await Promise.all(
        response.images.map(async (img) => {
          const outcome = await withWorkerRetry(
            async () => {
              const result = await persistImageWithPolicy(img.url, projectId, 'image')
              if (!result.persisted && result.imageUrl === '') {
                throw new Error(result.error || '图片转存失败')
              }
              return result
            },
            3,
            `shot-${shot.shotNo}/image-persist`,
          )
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
