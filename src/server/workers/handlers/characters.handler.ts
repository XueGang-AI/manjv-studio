// ============================================
// Characters Worker Handler
// ============================================

import prisma from '@/lib/prisma'
import { adapterFactory } from '@/server/model-adapters/adapter.factory'
import type { TextGenerationRequest } from '@/server/model-adapters/types'
import { taskService } from '@/server/queues/task-queue.service'
import { promptTemplateService } from '@/server/services/prompt-template.service'
import { emitTaskEvent, taskToUpdateEvent } from '../task-events'

export async function handleCharacters(taskId: string): Promise<void> {
  const existingTask = await prisma.generationTask.findUnique({ where: { id: taskId } })
  if (!existingTask) throw new Error('任务不存在')
  if (existingTask.status === 'success') return
  if (existingTask.status !== 'pending' && existingTask.status !== 'running' && existingTask.status !== 'retrying') return

  const task = await taskService.startTask(taskId)

  try {
    const projectId = task.projectId
    const project = await prisma.project.findUnique({ where: { id: projectId } })
    if (!project) throw new Error('项目不存在')

    const storyPackage = await prisma.storyPackage.findFirst({
      where: { projectId, confirmed: true },
      orderBy: { version: 'desc' },
    })
    if (!storyPackage) throw new Error('请先确认故事方案后再生成角色设定')

    await emitTaskEvent('task.running', taskToUpdateEvent(task))
    await taskService.updateProgress(taskId, 10)

    const storyContent = storyPackage.content as Record<string, unknown>
    const rendered = await promptTemplateService.render('character_design', {
      project_name: project.projectName,
      story_type: project.storyType || '',
      main_characters: JSON.stringify(project.mainCharacters || []),
      background: project.background || '',
      story_summary: project.storySummary || '',
      art_style: project.artStyle || '',
      target_platform: project.targetPlatform || '',
      story_package_json: JSON.stringify(storyContent),
    })

    const textAdapter = adapterFactory.getTextAdapter(project.modelProvider)
    const baseGenRequest: TextGenerationRequest = {
      taskType: 'character_design',
      systemPrompt: rendered.systemPrompt,
      userPrompt: rendered.userPrompt,
      outputSchema: rendered.outputSchema || undefined,
      temperature: 0.7,
      maxTokens: 8192,
    }

    let rawText = ''
    let content: unknown
    try {
      const response = await textAdapter.generate(baseGenRequest)
      rawText = response.rawText
      content = parseModelResponse(response)
    } catch (firstErr) {
      rawText = (firstErr as Error).message
      content = undefined
    }

    if (!content || !findCharactersArray(content)) {
      const retryResponse = await textAdapter.generate({
        ...baseGenRequest,
        systemPrompt:
          rendered.systemPrompt +
          '\n\nCRITICAL: Your previous response was not valid JSON. ' +
          'You MUST output ONLY a single valid JSON object — no markdown, no explanations, no code fences. ' +
          'The top-level object MUST contain a "characters" array. ' +
          'Do NOT wrap it in another key. ' +
          'Every character object MUST include at minimum: name, gender, age, role_type, identity, ' +
          'appearance, clothing, personality, signature_features, language_style, action_habits, ' +
          'zh_fixed_prompt, en_fixed_prompt.',
      })
      rawText = retryResponse.rawText
      content = parseModelResponse(retryResponse)
    }

    const characters = findCharactersArray(content)
    if (!Array.isArray(characters) || characters.length === 0) {
      const preview = rawText ? rawText.substring(0, 200) : ''
      throw new Error(`模型输出缺少 characters 数组${preview ? ` (rawText 预览: ${preview})` : ''}`)
    }

    await taskService.updateProgress(taskId, 65)

    const latestChar = await prisma.character.findFirst({
      where: { projectId },
      orderBy: { version: 'desc' },
    })
    const nextVersion = (latestChar?.version || 0) + 1

    const created = await Promise.all(
      (characters as Array<Record<string, unknown>>).map((char) =>
        prisma.character.create({
          data: {
            projectId,
            name: (char.name as string) || '',
            gender: (char.gender as string) || '',
            age: safeParseInt(char.age),
            roleType: (char.role_type as string) || '',
            identity: (char.identity as string) || '',
            appearance: (char.appearance as object) ?? {},
            clothing: (char.clothing as object) ?? {},
            personality: (char.personality as object) ?? {},
            signatureFeatures: (char.signature_features as object[]) ?? [],
            languageStyle: (char.language_style as object) ?? {},
            actionHabits: (char.action_habits as object[]) ?? [],
            emotionalArc: (char.emotional_arc as string) || '',
            zhFixedPrompt: (char.zh_fixed_prompt as string) || '',
            enFixedPrompt: (char.en_fixed_prompt as string) || '',
            referenceStyle: typeof char.reference_style === 'object'
              ? JSON.stringify(char.reference_style)
              : (char.reference_style as string) || '',
            version: nextVersion,
            confirmed: false,
          },
        })
      )
    )

    const { versionService: vs } = await import('@/server/services/version.service')
    await vs.createVersion({
      projectId,
      entityType: 'CHARACTER_SET',
      entityId: projectId,
      snapshot: { character_count: created.length, project_status: 'CHARACTER_PENDING_CONFIRM' },
      changeType: 'GENERATE',
      description: `生成 ${created.length} 个角色`,
      sourceTaskId: task.id,
    })

    await prisma.project.update({ where: { id: projectId }, data: { status: 'CHARACTER_PENDING_CONFIRM' } })

    const completed = await taskService.completeTask(taskId, {
      count: created.length,
      version: nextVersion,
      character_ids: created.map(char => char.id),
    })
    await emitTaskEvent('task.completed', taskToUpdateEvent(completed))
  } catch (error) {
    const errorMsg = (error as Error).message
    try {
      await prisma.project.update({ where: { id: task.projectId }, data: { status: 'STORY_CONFIRMED' } })
    } catch {
      /* ignore */
    }
    const failed = await taskService.failTask(taskId, errorMsg)
    await emitTaskEvent('task.failed', taskToUpdateEvent(failed))
  }
}

function parseModelResponse(response: { json?: unknown; rawText?: string }): unknown {
  const json = response.json
  if (json && typeof json === 'object') return json

  const rawText = response.rawText || ''
  if (!rawText) return undefined

  const cleaned = rawText.replace(/^﻿/, '').trim()
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

function sliceFirstBalanced(text: string, open: '{' | '[', close: '}' | ']'): string | undefined {
  const start = text.indexOf(open)
  if (start === -1) return undefined
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

function findCharactersArray(node: unknown): unknown[] | undefined {
  if (!node || typeof node !== 'object') return undefined

  if (Array.isArray(node)) {
    if (node.length > 0 && node.every(isCharacterLike)) return node
    return undefined
  }

  const obj = node as Record<string, unknown>
  if (Array.isArray(obj.characters) && (obj.characters as unknown[]).every(isCharacterLike)) {
    return obj.characters as unknown[]
  }

  const wrapperKeys = [
    'character_design',
    'characterDesign',
    'design',
    'data',
    'output',
    'result',
    'response',
    'payload',
    'body',
    'content',
    'characters_data',
    '角色列表',
    '角色',
  ]

  for (const key of wrapperKeys) {
    const nested = obj[key]
    if (nested && typeof nested === 'object') {
      const found = findCharactersArray(nested)
      if (found) return found
    }
  }

  if (obj.character && typeof obj.character === 'object') {
    const found = findCharactersArray(obj.character)
    if (found) return found
  }

  for (const key of Object.keys(obj)) {
    if (key === 'characters' || wrapperKeys.includes(key)) continue
    const nested = obj[key]
    if (nested && typeof nested === 'object') {
      const found = findCharactersArray(nested)
      if (found) return found
    }
  }

  return undefined
}

function safeParseInt(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.round(value)
  if (typeof value === 'string') {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return Math.round(parsed)
  }
  return null
}

function isCharacterLike(x: unknown): boolean {
  if (!x || typeof x !== 'object') return false
  const o = x as Record<string, unknown>
  if (typeof o.name !== 'string' || o.name.length === 0) return false
  return (
    'appearance' in o ||
    'gender' in o ||
    'role_type' in o ||
    'roleType' in o ||
    'identity' in o ||
    'personality' in o
  )
}
