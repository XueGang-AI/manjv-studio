// ============================================
// Scene References Worker Handler
// ============================================

import prisma from '@/lib/prisma'
import { adapterFactory } from '@/server/model-adapters/adapter.factory'
import { getRuntimeModelName } from '@/server/model-adapters/model-config'
import { promptTemplateService } from '@/server/services/prompt-template.service'
import { persistImageWithPolicy } from '@/server/services/media-persist'
import { taskService } from '@/server/queues/task-queue.service'
import { emitTaskEvent, taskToUpdateEvent } from '../task-events'
import type { ImageGenerationRequest, TextGenerationRequest } from '@/server/model-adapters/types'

type JsonValue = import('@prisma/client').Prisma.InputJsonValue

interface SceneReferencesInput {
  episodeId?: string
}

interface SceneGroup {
  key: string
  name: string
  location: string
  sceneTime: string
  description: string
  emotion: string
  shotIds: string[]
}

const SCENE_REFERENCE_TYPES = ['establishing', 'key_angle'] as const

export async function handleSceneReferences(taskId: string): Promise<void> {
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
    const input = (task.input || {}) as SceneReferencesInput
    const projectId = task.projectId
    const episodeId = input.episodeId || task.episodeId
    if (!episodeId) throw new Error('缺少 episodeId')

    const project = await prisma.project.findUnique({ where: { id: projectId } })
    if (!project) throw new Error('项目不存在')

    const episode = await prisma.episode.findFirst({ where: { id: episodeId, projectId } })
    if (!episode || !episode.confirmed) throw new Error('请先确认分镜脚本')

    await emitTaskEvent('task.running', taskToUpdateEvent(task))
    await taskService.updateProgress(taskId, 5)

    const shots = await prisma.shot.findMany({
      where: { projectId, episodeId },
      orderBy: { shotNo: 'asc' },
    })
    if (shots.length === 0) throw new Error('没有镜头数据')

    const groups = buildSceneGroups(shots)
    if (groups.length === 0) throw new Error('无法从分镜中提取场景')

    const textAdapter = adapterFactory.getTextAdapter(project.modelProvider)
    const imageAdapter = adapterFactory.getImageAdapter(project.modelProvider)
    const aspectRatio = (project.aspectRatio || '9:16') as '9:16' | '16:9' | '1:1'
    const artStyle = project.artStyle || '韩漫'
    const negativePrompt = 'people, character, portrait, close-up face, ugly, deformed, low quality, blurry, watermark, text, logo, distorted perspective'

    const results: Array<{ sceneId: string; sceneName: string; imageCount: number; skipped?: boolean }> = []
    let createdImageCount = 0

    for (let i = 0; i < groups.length; i++) {
      const group = groups[i]
      const scene = await upsertScene({
        projectId,
        episodeId,
        group,
        artStyle,
      })

      await prisma.shot.updateMany({
        where: { id: { in: group.shotIds }, projectId, episodeId },
        data: { sceneId: scene.id },
      })

      const existingImages = await prisma.sceneImage.findMany({
        where: { sceneId: scene.id, projectId },
        orderBy: { createdAt: 'asc' },
      })
      const existingTypes = new Set(existingImages.map(img => img.referenceType).filter(Boolean))
      const missingTypes = SCENE_REFERENCE_TYPES.filter(type => !existingTypes.has(type))

      if (missingTypes.length === 0) {
        results.push({ sceneId: scene.id, sceneName: scene.name, imageCount: existingImages.length, skipped: true })
        await updateProgress(taskId, i, groups.length)
        continue
      }

      const rendered = await promptTemplateService.render('scene', {
        scene: group.name,
        location: group.location,
        scene_time: group.sceneTime,
        art_style: artStyle,
        emotion: group.emotion,
      })

      const scenePromptRequest: TextGenerationRequest = {
        taskType: 'scene_prompt',
        systemPrompt: rendered.systemPrompt,
        userPrompt: rendered.userPrompt,
        outputSchema: rendered.outputSchema || undefined,
        temperature: 0.6,
        maxTokens: 2048,
      }
      const textResponse = await textAdapter.generate(scenePromptRequest)
      const scenePrompt = parseScenePrompt(textResponse.json, textResponse.rawText)

      const genReq: ImageGenerationRequest = {
        taskType: 'scene_image',
        prompt: scenePrompt,
        negativePrompt,
        aspectRatio,
        style: artStyle,
        numOutputs: missingTypes.length,
      }

      const imageResponse = await imageAdapter.generate(genReq)
      const created = (await Promise.all(
        imageResponse.images.slice(0, missingTypes.length).map(async (img, idx) => {
          const outcome = await persistImageWithPolicy(
            img.url,
            projectId,
            'image',
            `episodes/${episodeId}/scenes/${scene.id}`,
          )
          if (!outcome.persisted && outcome.imageUrl === '') {
            console.error(`[worker:scene-references] Scene ${scene.name}: persist failed: ${outcome.error}`)
            return null
          }

          const referenceType = missingTypes[idx]
          return prisma.sceneImage.create({
            data: {
              sceneId: scene.id,
              projectId,
              imageUrl: outcome.imageUrl,
              storageObjectKey: outcome.storageObjectKey,
              storageProvider: outcome.storageProvider,
              sourceUrl: outcome.sourceUrl,
              prompt: scenePrompt,
              negativePrompt,
              seed: String(img.seed || ''),
              modelName: getRuntimeModelName('image'),
              referenceType,
              isPrimary: referenceType === 'establishing',
              isSelected: true,
              isConfirmed: true,
              params: {
                ...img.params,
                aspect_ratio: aspectRatio,
                style: artStyle,
                scene_key: group.key,
                scene_shot_count: group.shotIds.length,
              } as unknown as JsonValue,
            },
          })
        })
      )).filter((x): x is NonNullable<typeof x> => x !== null)

      if (created.length > 0) {
        createdImageCount += created.length
        await prisma.scene.update({ where: { id: scene.id }, data: { confirmed: true } })
      }

      results.push({ sceneId: scene.id, sceneName: scene.name, imageCount: existingImages.length + created.length })
      await updateProgress(taskId, i, groups.length)
    }

    const totalImages = await prisma.sceneImage.count({ where: { projectId, scene: { episodeId } } })
    if (totalImages === 0) throw new Error('场景参考图生成失败')

    const { versionService: vs } = await import('@/server/services/version.service')
    await vs.createVersion({
      projectId,
      entityType: 'SCENE_REFERENCE_SET',
      entityId: episodeId,
      snapshot: {
        scene_count: results.length,
        created_image_count: createdImageCount,
        total_image_count: totalImages,
      },
      changeType: 'GENERATE',
      description: `生成 ${results.length} 个场景参考`,
      sourceTaskId: taskId,
    })

    const completed = await taskService.completeTask(taskId, {
      scene_count: results.length,
      created_image_count: createdImageCount,
      total_image_count: totalImages,
      scenes: results,
    })
    await emitTaskEvent('task.completed', taskToUpdateEvent(completed))
  } catch (error) {
    const errorMsg = (error as Error).message
    console.error(`[worker:scene-references] Task ${taskId} failed:`, errorMsg)
    const failed = await taskService.failTask(taskId, errorMsg)
    await emitTaskEvent('task.failed', taskToUpdateEvent(failed))
  }
}

function cleanText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function buildSceneGroups(shots: Array<{
  id: string
  shotName: string | null
  sceneTime: string | null
  location: string | null
  action: string | null
  emotion: string | null
}>): SceneGroup[] {
  const byKey = new Map<string, SceneGroup & { actions: string[]; emotions: Set<string> }>()

  for (const shot of shots) {
    const location = cleanText(shot.location) || cleanText(shot.shotName) || '未命名场景'
    const sceneTime = cleanText(shot.sceneTime)
    const key = `${location.toLowerCase()}|${sceneTime.toLowerCase()}`
    const name = sceneTime ? `${location} · ${sceneTime}` : location

    if (!byKey.has(key)) {
      byKey.set(key, {
        key,
        name,
        location,
        sceneTime,
        description: '',
        emotion: '',
        shotIds: [],
        actions: [],
        emotions: new Set<string>(),
      })
    }

    const group = byKey.get(key)!
    group.shotIds.push(shot.id)
    if (shot.action) group.actions.push(shot.action)
    if (shot.emotion) group.emotions.add(shot.emotion)
  }

  return [...byKey.values()].map(group => ({
    key: group.key,
    name: group.name,
    location: group.location,
    sceneTime: group.sceneTime,
    description: group.actions.slice(0, 4).join(' / '),
    emotion: [...group.emotions].join('、') || '统一、稳定',
    shotIds: group.shotIds,
  }))
}

async function upsertScene(input: {
  projectId: string
  episodeId: string
  group: SceneGroup
  artStyle: string
}) {
  const existing = await prisma.scene.findFirst({
    where: {
      projectId: input.projectId,
      episodeId: input.episodeId,
      name: input.group.name,
    },
  })

  if (existing) {
    return prisma.scene.update({
      where: { id: existing.id },
      data: {
        location: input.group.location,
        sceneTime: input.group.sceneTime,
        description: input.group.description,
        artStyle: input.artStyle,
        metadata: {
          scene_key: input.group.key,
          shot_count: input.group.shotIds.length,
        } as unknown as JsonValue,
      },
    })
  }

  return prisma.scene.create({
    data: {
      projectId: input.projectId,
      episodeId: input.episodeId,
      name: input.group.name,
      location: input.group.location,
      sceneTime: input.group.sceneTime,
      description: input.group.description,
      artStyle: input.artStyle,
      metadata: {
        scene_key: input.group.key,
        shot_count: input.group.shotIds.length,
      } as unknown as JsonValue,
    },
  })
}

function parseScenePrompt(json: unknown, rawText: string): string {
  let content = json
  if (!content && rawText) {
    try {
      content = JSON.parse(rawText)
    } catch {
      const match = rawText.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/)
      if (match) {
        try {
          content = JSON.parse(match[1])
        } catch {
          content = null
        }
      }
    }
  }

  if (content && typeof content === 'object') {
    const data = content as Record<string, unknown>
    const prompt = cleanText(data.en_scene_prompt) || cleanText(data.zh_scene_prompt)
    if (prompt) return prompt
  }

  throw new Error('场景 Prompt 输出无法解析')
}

async function updateProgress(taskId: string, index: number, total: number): Promise<void> {
  const progress = Math.round(((index + 1) / total) * 85) + 10
  const updated = await taskService.updateProgress(taskId, progress)
  await emitTaskEvent('task.progress', taskToUpdateEvent(updated))
}
