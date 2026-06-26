// ============================================
// Storyboard Worker Handler — 分镜脚本生成
// ============================================
//
// 从 API Route 迁移到 Worker 的分镜生成逻辑。
// 负责：加载项目/角色/素材 → 渲染 Prompt → 调用文本适配器 → 保存 Episode/Shots/Prompts

import prisma from '@/lib/prisma'
import { promptTemplateService } from '@/server/services/prompt-template.service'
import { adapterFactory } from '@/server/model-adapters/adapter.factory'
import { getMaxShotDuration, normalizeShotDurations } from '@/lib/utils'
import { taskService } from '@/server/queues/task-queue.service'
import { emitTaskEvent, taskToUpdateEvent } from '../task-events'
import type { TextGenerationRequest } from '@/server/model-adapters/types'

type JsonValue = import('@prisma/client').Prisma.InputJsonValue // Used for Prisma JSON fields

export interface StoryboardInput {
  episodeNumber?: number
}

/**
 * 执行分镜脚本生成
 */
export async function handleStoryboard(taskId: string): Promise<void> {
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
    const episodeNumber = (input.episodeNumber as number) || 1

    const project = await prisma.project.findUnique({ where: { id: projectId } })
    if (!project) throw new Error('项目不存在')

    // 更新项目状态
    await prisma.project.update({ where: { id: projectId }, data: { status: 'STORYBOARD_GENERATING' } })
    await emitTaskEvent('task.running', taskToUpdateEvent(task))
    await taskService.updateProgress(taskId, 10)

    // 获取已确认的故事方案
    const storyPackage = await prisma.storyPackage.findFirst({
      where: { projectId, confirmed: true },
      orderBy: { version: 'desc' },
    })
    if (!storyPackage) throw new Error('请先确认故事方案')

    // 获取已确认角色
    const characters = await prisma.character.findMany({
      where: { projectId, confirmed: true },
    })

    // 获取标准角色图
    const characterImages = await prisma.characterImage.findMany({
      where: { projectId, isConfirmed: true },
    })

    await taskService.updateProgress(taskId, 20)

    // 获取或创建 episode（计算版本号）
    const existingEpisode = await prisma.episode.findFirst({
      where: { projectId, episodeNo: episodeNumber },
      orderBy: { version: 'desc' },
    })
    const nextVersion = (existingEpisode?.version || 0) + 1

    // 读取素材库
    const materialRefs = loadMaterialRefs()

    // 计算视频模型单镜头时长上限
    const maxShotDuration = getMaxShotDuration(project.modelProvider)

    // 渲染 Prompt
    const rendered = await promptTemplateService.render('storyboard', {
      project_name: project.projectName,
      story_type: project.storyType || '',
      background: project.background || '',
      core_conflict: project.coreConflict || '用户暂未明确核心冲突，请根据故事背景和梗概自动提炼潜在矛盾、人物关系张力或情绪驱动力。',
      story_summary: project.storySummary || '',
      art_style: project.artStyle || '',
      target_platform: project.targetPlatform || '',
      episode_duration: String(project.episodeDuration),
      max_shot_duration: String(maxShotDuration),
      episode_number: String(episodeNumber),
      aspect_ratio: project.aspectRatio || '9:16',
      story_package_json: JSON.stringify(storyPackage.content),
      characters_json: JSON.stringify(characters.map(c => ({
        name: c.name, role_type: c.roleType, zh_fixed_prompt: c.zhFixedPrompt,
        en_fixed_prompt: c.enFixedPrompt, appearance: c.appearance, personality: c.personality,
        signature_features: c.signatureFeatures,
      }))),
      selected_character_images_json: JSON.stringify(characterImages.map(i => ({
        character_id: i.characterId, image_url: i.imageUrl, prompt: i.prompt, is_confirmed: true,
      }))),
      episode_outline: JSON.stringify((storyPackage.content as Record<string, unknown>)?.episode_outline || []),
      relationship_json: '{}',
    })

    const targetShotCount = getTargetShotCount(project.episodeDuration, maxShotDuration)
    const runtimeStoryboardInstruction = buildRuntimeStoryboardInstruction(targetShotCount, project.episodeDuration)
    const enhancedSystem = rendered.systemPrompt + materialRefs + runtimeStoryboardInstruction

    await taskService.updateProgress(taskId, 30)

    // 调用文本适配器
    const textAdapter = adapterFactory.getTextAdapter(project.modelProvider)
    const genReq: TextGenerationRequest = {
      taskType: 'storyboard',
      systemPrompt: enhancedSystem,
      userPrompt: rendered.userPrompt,
      outputSchema: rendered.outputSchema || undefined,
      temperature: 0.7,
      maxTokens: 8192,
    }

    let rawText = ''
    let parsed: unknown
    try {
      const response = await textAdapter.generate(genReq)
      rawText = response.rawText
      parsed = parseModelResponse(response)
    } catch (firstErr) {
      rawText = (firstErr as Error).message
      parsed = undefined
    }

    let content = findStoryboardPayload(parsed, episodeNumber) || recoverStoryboardPayloadFromRawText(rawText)
    if (!content) {
      await taskService.appendLog(taskId, 'WARN', '首次分镜 JSON 结构不符合要求，正在重试', {
        raw_preview: rawText.substring(0, 300),
        parsed_keys: describeJsonKeys(parsed),
      })

      const retryResponse = await textAdapter.generate({
        ...genReq,
        systemPrompt:
          enhancedSystem +
          '\n\nCRITICAL: Your previous response did not contain a usable top-level "shots" array. ' +
          'Output ONLY one valid JSON object, with no markdown, no explanation, and no wrapper key. ' +
          'The root object MUST be exactly shaped as: { "episode": {...}, "shots": [...], "ending_hook": {...} }. ' +
          `The "shots" value MUST be a non-empty array with exactly ${targetShotCount} concise shot objects. ` +
          'Every shot MUST include shot_no, shot_name, start_time, end_time, scene_time, location, characters, action, camera, visual, emotion, sfx, bgm, dialogue, purpose, and duration. ' +
          'Keep every text field concise so the JSON closes completely.',
      })
      rawText = retryResponse.rawText
      parsed = parseModelResponse(retryResponse)
      content = findStoryboardPayload(parsed, episodeNumber) || recoverStoryboardPayloadFromRawText(rawText)
    }

    if (!content) {
      const preview = rawText ? rawText.substring(0, 300) : ''
      throw new Error(`模型输出缺少 shots 数组${preview ? ` (rawText 预览: ${preview})` : ''}`)
    }

    await taskService.updateProgress(taskId, 60)

    const episodeData = (content.episode || {}) as Record<string, unknown>
    let shots = content.shots as Array<Record<string, unknown>>

    // 后处理：拆分超长镜头 + 校正总时长
    shots = normalizeShotDurations(shots, project.episodeDuration, maxShotDuration)

    // 保存 Episode
    const episode = await prisma.episode.create({
      data: {
        projectId,
        episodeNo: episodeNumber,
        title: (episodeData.title as string) || `第 ${episodeNumber} 集`,
        duration: (episodeData.duration as number) || project.episodeDuration,
        coreTask: (episodeData.core_task as string) || '',
        emotionCurve: (episodeData.emotion_curve as string) || '',
        openingHook: (episodeData.opening_hook as string) || '',
        endingHook: (episodeData.ending_hook as string) || '',
        version: nextVersion,
        confirmed: false,
        status: 'DRAFT',
      },
    })

    await taskService.updateProgress(taskId, 70)

    // 保存 Shots + ImagePrompts + VideoPrompts
    const createdShots = []
    for (const shot of shots) {
      const shotRecord = await prisma.shot.create({
        data: {
          episodeId: episode.id, projectId,
          shotNo: (shot.shot_no as number) || 1,
          shotName: (shot.shot_name as string) || '',
          startTime: (shot.start_time as number) || 0,
          endTime: (shot.end_time as number) || 10,
          sceneTime: (shot.scene_time as string) || '',
          location: (shot.location as string) || '',
          characters: ((shot.characters as unknown[]) || []) as unknown as JsonValue,
          action: (shot.action as string) || '',
          camera: ((shot.camera as Record<string, unknown>) || {}) as unknown as JsonValue,
          visual: ((shot.visual as Record<string, unknown>) || {}) as unknown as JsonValue,
          emotion: (shot.emotion as string) || '',
          sfx: (shot.sfx as string) || '',
          bgm: (shot.bgm as string) || '',
          dialogue: (shot.dialogue as string) || '',
          purpose: (shot.purpose as string) || '',
        },
      })

      // ImagePrompt
      const imgP = (shot.image_prompt as Record<string, string>) || {}
      if (imgP.zh || imgP.en) {
        await prisma.imagePrompt.create({
          data: {
            shotId: shotRecord.id, projectId,
            zhPrompt: imgP.zh || '', enPrompt: imgP.en || '',
            negativePrompt: imgP.negative || '',
            aspectRatio: project.aspectRatio, style: project.artStyle,
            params: {} as unknown as JsonValue, confirmed: false,
          },
        })
      }

      // VideoPrompt
      const vidP = (shot.video_prompt as string) || ''
      if (vidP) {
        await prisma.videoPrompt.create({
          data: {
            shotId: shotRecord.id, projectId,
            prompt: vidP,
            duration: (shot.duration as number) || (shot.end_time as number || 10) - (shot.start_time as number || 0),
            motionStrength: 'medium',
            cameraMotion: ((shot.camera as Record<string, string>)?.movement) || '',
            params: { fps: 24 } as unknown as JsonValue, confirmed: false,
          },
        })
      }

      createdShots.push(shotRecord)
    }

    // 保存配音时间轴
    if (content.voice_timeline && Array.isArray(content.voice_timeline)) {
      await prisma.voiceScript.create({
        data: {
          episodeId: episode.id, projectId,
          content: { timeline: content.voice_timeline } as unknown as JsonValue,
          confirmed: false,
        },
      })
    }

    await taskService.updateProgress(taskId, 90)

    // 更新项目状态
    await prisma.project.update({
      where: { id: projectId }, data: { status: 'STORYBOARD_PENDING_CONFIRM' },
    })

    // 创建版本快照
    const { versionService: vs } = await import('@/server/services/version.service')
    await vs.createVersion({
      projectId, entityType: 'STORYBOARD', entityId: episode.id,
      snapshot: { episode_id: episode.id, shot_count: createdShots.length, project_status: 'STORYBOARD_PENDING_CONFIRM' },
      changeType: 'GENERATE', description: `生成第 ${episodeNumber} 集分镜 (${createdShots.length} 镜头)`, sourceTaskId: taskId,
    })

    // 标记任务成功
    const completed = await taskService.completeTask(taskId, {
      episode_id: episode.id,
      shot_count: createdShots.length,
      version: nextVersion,
    })

    await emitTaskEvent('task.completed', taskToUpdateEvent(completed))

  } catch (error) {
    const errorMsg = (error as Error).message
    console.error(`[worker:storyboard] Task ${taskId} failed:`, errorMsg)

    // 回退项目状态
    try {
      await prisma.project.update({
        where: { id: task.projectId },
        data: { status: 'CHARACTER_IMAGE_CONFIRMED' },
      })
    } catch { /* ignore */ }

    const failed = await taskService.failTask(taskId, errorMsg)
    await emitTaskEvent('task.failed', taskToUpdateEvent(failed))
  }
}

function parseModelResponse(response: { json?: unknown; rawText?: string }): unknown {
  const json = response.json
  if (json && typeof json === 'object') return json

  const rawText = response.rawText || ''
  if (!rawText) return undefined

  const cleaned = rawText.replace(/^\uFEFF/, '').trim()
  try {
    return JSON.parse(cleaned)
  } catch {
    /* continue */
  }

  const fenced = cleaned.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/)
  if (fenced?.[1]) {
    try {
      return JSON.parse(fenced[1].trim())
    } catch {
      /* continue */
    }
  }

  const objSlice = sliceFirstBalanced(cleaned, '{', '}')
  if (objSlice) {
    try {
      return JSON.parse(objSlice)
    } catch {
      /* continue */
    }
  }

  const arrSlice = sliceFirstBalanced(cleaned, '[', ']')
  if (arrSlice) {
    try {
      return JSON.parse(arrSlice)
    } catch {
      /* continue */
    }
  }

  return undefined
}

function buildRuntimeStoryboardInstruction(targetShotCount: number, episodeDuration: number): string {
  return [
    '',
    '',
    '## Runtime Storyboard Constraints',
    `Generate exactly ${targetShotCount} shots for this ${episodeDuration}-second episode.`,
    'Keep JSON compact and fully closed. Do not over-explain.',
    'Each shot action/dialogue/purpose field should stay under 80 Chinese characters.',
    'Do not add fields outside the required JSON object unless they are image_prompt or video_prompt.',
  ].join('\n')
}

function getTargetShotCount(episodeDuration: number, maxShotDuration: number): number {
  const minByDuration = Math.ceil(episodeDuration / maxShotDuration)
  const comfortableCount = Math.ceil(episodeDuration / 6)
  return Math.max(2, Math.min(8, Math.max(minByDuration, comfortableCount)))
}

function recoverStoryboardPayloadFromRawText(rawText: string): Record<string, unknown> | undefined {
  const cleaned = rawText.replace(/^\uFEFF/, '').trim()
  if (!cleaned || !cleaned.includes('"shots"')) return undefined

  const shotsStart = cleaned.search(/"shots"\s*:/)
  if (shotsStart === -1) return undefined

  const arrayStart = cleaned.indexOf('[', shotsStart)
  if (arrayStart === -1) return undefined

  const shots: Array<Record<string, unknown>> = []
  let cursor = arrayStart + 1
  while (cursor < cleaned.length) {
    const objectStart = cleaned.indexOf('{', cursor)
    if (objectStart === -1) break

    const objectText = sliceBalancedFrom(cleaned, objectStart, '{', '}')
    if (!objectText) break

    try {
      const shot = JSON.parse(objectText)
      if (shot && typeof shot === 'object' && !Array.isArray(shot)) {
        shots.push(shot as Record<string, unknown>)
      }
    } catch {
      break
    }
    cursor = objectStart + objectText.length
  }

  if (!asShotArray(shots, true)) return undefined

  const episode = recoverNamedObject(cleaned, 'episode')
  const endingHook = recoverNamedObject(cleaned, 'ending_hook')
  return {
    episode: episode || {},
    shots,
    ...(endingHook ? { ending_hook: endingHook } : {}),
  }
}

function recoverNamedObject(text: string, key: string): Record<string, unknown> | undefined {
  const keyStart = text.search(new RegExp(`"${key}"\\s*:`))
  if (keyStart === -1) return undefined

  const objectStart = text.indexOf('{', keyStart)
  if (objectStart === -1) return undefined

  const objectText = sliceBalancedFrom(text, objectStart, '{', '}')
  if (!objectText) return undefined

  try {
    const parsed = JSON.parse(objectText)
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>
    }
  } catch {
    return undefined
  }

  return undefined
}

function sliceFirstBalanced(text: string, open: '{' | '[', close: '}' | ']'): string | undefined {
  const start = text.indexOf(open)
  if (start === -1) return undefined
  return sliceBalancedFrom(text, start, open, close)
}

function sliceBalancedFrom(text: string, start: number, open: '{' | '[', close: '}' | ']'): string | undefined {
  let depth = 0
  let inString = false
  let escape = false
  for (let i = start; i < text.length; i++) {
    const ch = text[i]
    if (escape) {
      escape = false
      continue
    }
    if (ch === '\\') {
      escape = true
      continue
    }
    if (ch === '"') {
      inString = !inString
      continue
    }
    if (inString) continue
    if (ch === open) depth++
    else if (ch === close) {
      depth--
      if (depth === 0) return text.substring(start, i + 1)
    }
  }

  return undefined
}

function findStoryboardPayload(node: unknown, episodeNumber: number, depth = 0): Record<string, unknown> | undefined {
  if (!node || depth > 5) return undefined

  if (Array.isArray(node)) {
    const topLevelShots = asShotArray(node, true)
    if (topLevelShots) return { shots: topLevelShots }

    for (const item of node) {
      const found = findStoryboardPayload(item, episodeNumber, depth + 1)
      if (found) return found
    }
    return undefined
  }

  if (typeof node !== 'object') return undefined
  const obj = node as Record<string, unknown>

  const directShots = findShotArrayOnObject(obj)
  if (directShots) return { ...obj, shots: directShots }

  const episode = obj.episode
  if (episode && typeof episode === 'object' && !Array.isArray(episode)) {
    const episodeObj = episode as Record<string, unknown>
    const episodeShots = findShotArrayOnObject(episodeObj)
    if (episodeShots) return { ...obj, episode: episodeObj, shots: episodeShots }
  }

  const episodes = obj.episodes
  if (Array.isArray(episodes)) {
    const preferred = episodes.find(item => {
      if (!item || typeof item !== 'object') return false
      const episodeObj = item as Record<string, unknown>
      return asNumber(episodeObj.episode_no) === episodeNumber || asNumber(episodeObj.episodeNo) === episodeNumber
    })
    const orderedEpisodes = preferred ? [preferred, ...episodes.filter(item => item !== preferred)] : episodes
    for (const item of orderedEpisodes) {
      const found = findStoryboardPayload(item, episodeNumber, depth + 1)
      if (found) return found
    }
  }

  const wrapperKeys = [
    'storyboard',
    'storyboard_script',
    'storyboardScript',
    'script',
    'data',
    'output',
    'result',
    'response',
    'payload',
    'body',
    'content',
    '分镜脚本',
    '分镜',
    '镜头列表',
  ]

  for (const key of wrapperKeys) {
    const nested = obj[key]
    if (nested && typeof nested === 'object') {
      const found = findStoryboardPayload(nested, episodeNumber, depth + 1)
      if (found) return mergeStoryboardPayload(obj, found)
    }
  }

  for (const key of Object.keys(obj)) {
    if (wrapperKeys.includes(key) || key === 'shots' || key === 'episode' || key === 'episodes') continue
    const nested = obj[key]
    if (nested && typeof nested === 'object') {
      const found = findStoryboardPayload(nested, episodeNumber, depth + 1)
      if (found) return mergeStoryboardPayload(obj, found)
    }
  }

  return undefined
}

function findShotArrayOnObject(obj: Record<string, unknown>): Array<Record<string, unknown>> | undefined {
  const shotKeys = [
    'shots',
    'shot_list',
    'shotList',
    'shotListJson',
    'storyboard_shots',
    'storyboardShots',
    '镜头',
    '镜头列表',
    '分镜列表',
  ]

  for (const key of shotKeys) {
    const shots = asShotArray(obj[key], key !== 'shots')
    if (shots) return shots
  }

  return undefined
}

function asShotArray(value: unknown, requireShotLike: boolean): Array<Record<string, unknown>> | undefined {
  if (!Array.isArray(value) || value.length === 0) return undefined
  if (!value.every(item => item && typeof item === 'object' && !Array.isArray(item))) return undefined

  const shots = value as Array<Record<string, unknown>>
  if (!requireShotLike || shots.some(isShotLike)) return shots
  return undefined
}

function isShotLike(value: Record<string, unknown>): boolean {
  const keys = [
    'shot_no',
    'shotNo',
    'shot_name',
    'shotName',
    'start_time',
    'startTime',
    'end_time',
    'endTime',
    'scene_time',
    'location',
    'characters',
    'action',
    'camera',
    'visual',
    'dialogue',
  ]
  return keys.filter(key => key in value).length >= 3
}

function mergeStoryboardPayload(wrapper: Record<string, unknown>, found: Record<string, unknown>): Record<string, unknown> {
  return {
    ...wrapper,
    ...found,
    episode: found.episode || wrapper.episode,
    ending_hook: found.ending_hook || wrapper.ending_hook,
    voice_timeline: found.voice_timeline || wrapper.voice_timeline,
  }
}

function asNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return undefined
}

function describeJsonKeys(value: unknown): string[] {
  if (!value) return []
  if (Array.isArray(value)) {
    const first = value[0]
    if (first && typeof first === 'object' && !Array.isArray(first)) {
      return [`array(${value.length})`, ...Object.keys(first as Record<string, unknown>).slice(0, 20)]
    }
    return [`array(${value.length})`]
  }
  if (typeof value === 'object') return Object.keys(value as Record<string, unknown>).slice(0, 30)
  return [typeof value]
}

/** 从素材库加载相关参考并格式化为 prompt 片段 */
function loadMaterialRefs(): string {
  const fs = require('fs') // eslint-disable-line @typescript-eslint/no-require-imports
  const path = require('path') // eslint-disable-line @typescript-eslint/no-require-imports
  const promptsDir = path.resolve(process.cwd(), 'prompts')

  let ref = '\n\n## 参考素材库（精选）\n'

  try {
    const cameraTerms = JSON.parse(fs.readFileSync(path.join(promptsDir, 'camera/camera_terms.json'), 'utf-8'))
    const terms = (cameraTerms.entries || []).slice(0, 10)
    if (terms.length) ref += '\n可用镜头术语：' + terms.map((t: { term_zh?: string }) => t.term_zh || '').filter(Boolean).slice(0, 10).join('、')
  } catch { /* ignore */ }

  try {
    const styles = JSON.parse(fs.readFileSync(path.join(promptsDir, 'style/cinematic_style_library.json'), 'utf-8'))
    const entries = (styles.entries || []).slice(0, 8)
    if (entries.length) ref += '\n可用风格修饰词示例：' + entries.map((e: { prompt?: string; modifier?: string }) => e.prompt || e.modifier || '').filter(Boolean).slice(0, 8).join('、')
  } catch { /* ignore */ }

  try {
    const classicMoves = JSON.parse(fs.readFileSync(path.join(promptsDir, 'camera/classic_camera_moves.json'), 'utf-8'))
    const moves = (classicMoves.entries || []).slice(0, 5)
    if (moves.length) ref += '\n经典运镜参考：' + moves.map((m: { text?: string }) => m.text || '').filter(Boolean).slice(0, 5).join(' | ')
  } catch { /* ignore */ }

  ref += '\n\n请结合以上素材库知识，在分镜中灵活运用镜头语言。\n'
  return ref
}
