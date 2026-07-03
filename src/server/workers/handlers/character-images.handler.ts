// ============================================
// Character Images Worker Handler
// ============================================

import prisma from '@/lib/prisma'
import { adapterFactory } from '@/server/model-adapters/adapter.factory'
import { getRuntimeModelName } from '@/server/model-adapters/model-config'
import { persistImageWithPolicy } from '@/server/services/media-persist'
import { resolveImageUrlForModel } from '@/server/services/media-reference-url'
import type { ImageGenerationRequest } from '@/server/model-adapters/types'
import { taskService } from '@/server/queues/task-queue.service'
import { withWorkerRetry } from '../handler-utils'
import { emitTaskEvent, taskToUpdateEvent } from '../task-events'

type JsonValue = import('@prisma/client').Prisma.InputJsonValue

type RefType =
  | 'front_full_body'
  | 'front_half_body'
  | 'left_side'
  | 'right_side'
  | 'back_view'
  | 'expression'
  | 'outfit'
  | 'prop'
  | 'weapon'
  | 'pose'

const ANGLE_PROMPTS: Record<string, string> = {
  front_full_body: 'full body standing pose, front view, showing complete outfit and body proportions, centered composition',
  front_half_body: 'half body portrait, front view, focus on facial features, hairstyle and makeup, head and shoulders',
  left_side: 'left side profile view, showing side face contour and hair length, 3/4 turn to left',
  right_side: 'right side profile view, showing side face contour and outfit details, 3/4 turn to right',
  back_view: 'back view, showing hair length from behind, back outfit silhouette, walking away pose',
  expression: 'expression reference sheet, multiple facial expressions, same character, same outfit',
  outfit: 'full body outfit reference, fashion design detail, fabric texture, color palette',
  prop: 'holding key prop item, clear prop design, prop interaction',
  weapon: 'holding weapon, weapon design detail, combat ready pose',
  pose: 'action pose reference, dynamic posture, motion lines',
}

interface CharacterImagesInput {
  mode?: string
  reference_types?: RefType[]
}

export async function handleCharacterImages(taskId: string): Promise<void> {
  const existingTask = await prisma.generationTask.findUnique({ where: { id: taskId } })
  if (!existingTask) throw new Error('任务不存在')
  if (existingTask.status === 'success') return
  if (existingTask.status !== 'pending' && existingTask.status !== 'running' && existingTask.status !== 'retrying') return

  const task = await taskService.startTask(taskId)

  try {
    const projectId = task.projectId
    const input = (task.input || {}) as CharacterImagesInput
    const mode = input.mode || 'quick'
    const types: RefType[] = Array.isArray(input.reference_types) && input.reference_types.length > 0
      ? input.reference_types
      : mode === 'consistency'
        ? ['front_full_body', 'front_half_body', 'left_side', 'right_side', 'back_view']
        : ['front_full_body']

    const project = await prisma.project.findUnique({ where: { id: projectId } })
    if (!project) throw new Error('项目不存在')

    const characters = await prisma.character.findMany({ where: { projectId, confirmed: true } })
    if (characters.length === 0) throw new Error('没有已确认的角色，请先确认角色设定卡')

    await emitTaskEvent('task.running', taskToUpdateEvent(task))
    await taskService.updateProgress(taskId, 5)

    const imageAdapter = adapterFactory.getImageAdapter(project.modelProvider)
    const aspectRatio = (project.aspectRatio || '9:16') as '9:16' | '16:9' | '1:1'
    const style = project.artStyle || '韩漫'
    const negativePrompt = 'ugly, deformed, bad anatomy, bad proportions, low quality, blurry, pixelated, distorted face, extra fingers, missing fingers, asymmetric eyes, watermark, text, logo, extra limbs, multiple heads'
    const allResults: Array<{ characterId: string; characterName: string; images: unknown[] }> = []
    const generationErrors: string[] = []
    const persistErrors: string[] = []

    for (let charIndex = 0; charIndex < characters.length; charIndex++) {
      const char = characters[charIndex]
      const existingImages = await prisma.characterImage.findMany({
        where: { characterId: char.id, projectId },
        select: { imageUrl: true, referenceType: true, storageObjectKey: true, sourceUrl: true },
      })
      const existingTypes = new Set(existingImages.map(i => i.referenceType).filter(Boolean))
      const missingTypes = types.filter(t => !existingTypes.has(t))

      if (missingTypes.length === 0) {
        allResults.push({ characterId: char.id, characterName: char.name || '', images: [] })
        await updateProgress(taskId, charIndex, characters.length)
        continue
      }

      const corePrompt = char.enFixedPrompt || char.zhFixedPrompt || `${char.name}, character design, ${style} style`
      const charImages: unknown[] = []

      const existingAnchor = existingImages.find(i => i.referenceType === 'front_full_body')
      let anchorImageUrl: string | null = existingAnchor?.imageUrl || null
      let anchorImageForModel: string | null = existingAnchor
        ? (await resolveImageUrlForModel({
            imageUrl: existingAnchor.imageUrl,
            sourceUrl: existingAnchor.sourceUrl,
            storageObjectKey: existingAnchor.storageObjectKey,
          })) || anchorImageUrl
        : null

      for (const refType of missingTypes) {
        const prompt = `${corePrompt}, ${ANGLE_PROMPTS[refType] || ''}`
        const genReq: ImageGenerationRequest = {
          taskType: 'character_image',
          prompt,
          negativePrompt,
          aspectRatio,
          style,
          numOutputs: 1,
        }

        if (anchorImageForModel) {
          genReq.referenceImages = [anchorImageForModel]
        }

        let response: Awaited<ReturnType<typeof imageAdapter.generate>>
        try {
          response = await withWorkerRetry(() => imageAdapter.generate(genReq), 3, `${char.name || char.id}/${refType}`)
        } catch (singleError) {
          const message = `${char.name || char.id}/${refType}: ${(singleError as Error).message}`
          generationErrors.push(message)
          console.error(`[worker:character-images] ${message}`)
          continue
        }

        if (refType === 'front_full_body' && response.images[0]?.url && !anchorImageUrl) {
          anchorImageUrl = response.images[0].url
          anchorImageForModel = response.images[0].url
        }

        const created = (await Promise.all(response.images.map(async (img) => {
          if (!img.url) return null
          const outcome = await persistImageWithPolicy(img.url, projectId, 'image')
          if (!outcome.persisted && outcome.imageUrl === '') {
            const message = `${char.name || char.id}/${refType}: ${outcome.error || '图片转存失败'}`
            persistErrors.push(message)
            console.error(`[worker:character-images] image persist failed (${refType}, prod skipped): ${outcome.error}`)
            return null
          }

          return prisma.characterImage.create({
            data: {
              characterId: char.id,
              projectId,
              imageUrl: outcome.imageUrl,
              storageObjectKey: outcome.storageObjectKey,
              storageProvider: outcome.storageProvider,
              sourceUrl: outcome.sourceUrl,
              prompt,
              negativePrompt,
              seed: String(img.seed || ''),
              modelName: getRuntimeModelName('image'),
              referenceType: refType,
              isPrimary: refType === 'front_full_body',
              params: {
                aspect_ratio: aspectRatio,
                style,
                num_outputs: 1,
                reference_type: refType,
                ...(anchorImageUrl ? { reference_image: anchorImageUrl } : {}),
                ...img.params,
              } as unknown as JsonValue,
              isSelected: refType === 'front_full_body',
              isConfirmed: false,
            },
          })
        }))).filter((x): x is NonNullable<typeof x> => x !== null)

        charImages.push(...created)
      }

      allResults.push({ characterId: char.id, characterName: char.name || '', images: charImages })
      await updateProgress(taskId, charIndex, characters.length)
    }

    const totalPersisted = allResults.reduce((sum, result) => sum + result.images.length, 0)
    if (totalPersisted === 0) {
      await prisma.project.update({ where: { id: projectId }, data: { status: 'CHARACTER_CONFIRMED' } })
      const detail = generationErrors[0] || persistErrors[0] || '没有生成可用角色图'
      throw new Error(`角色图生成失败：${detail}`)
    }

    await prisma.project.update({
      where: { id: projectId },
      data: { status: 'CHARACTER_IMAGE_PENDING_CONFIRM' },
    })

    const { versionService: vs } = await import('@/server/services/version.service')
    await vs.createVersion({
      projectId,
      entityType: 'CHARACTER_IMAGE_SET',
      entityId: projectId,
      snapshot: {
        total_images: totalPersisted,
        project_status: 'CHARACTER_IMAGE_PENDING_CONFIRM',
        mode,
        reference_types: types,
      },
      changeType: 'GENERATE',
      description: `${mode === 'consistency' ? '一致性模式' : '快速模式'} 生成 ${characters.length} 个角色图`,
      sourceTaskId: task.id,
    })

    const completed = await taskService.completeTask(taskId, {
      total_images: totalPersisted,
      mode,
      reference_types: types,
    })
    await emitTaskEvent('task.completed', taskToUpdateEvent(completed))
  } catch (error) {
    const errorMsg = (error as Error).message
    try {
      await prisma.project.update({ where: { id: task.projectId }, data: { status: 'CHARACTER_CONFIRMED' } })
    } catch {
      /* ignore */
    }
    const failed = await taskService.failTask(taskId, errorMsg)
    await emitTaskEvent('task.failed', taskToUpdateEvent(failed))
  }
}

async function updateProgress(taskId: string, index: number, total: number): Promise<void> {
  const progress = Math.round(((index + 1) / total) * 85) + 10
  const updated = await taskService.updateProgress(taskId, progress)
  await emitTaskEvent('task.progress', taskToUpdateEvent(updated))
}
