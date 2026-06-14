import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { promptTemplateService } from '@/server/services/prompt-template.service'
import { adapterFactory } from '@/server/model-adapters/adapter.factory'
import type { TextGenerationRequest } from '@/server/model-adapters/types'

/**
 * POST /api/projects/:id/characters/generate
 * 生成角色设定卡
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: projectId } = await params

    // 1. 获取项目信息
    const project = await prisma.project.findUnique({ where: { id: projectId } })
    if (!project) {
      return NextResponse.json({ success: false, error: '项目不存在' }, { status: 404 })
    }

    // 2. 检查状态 — 必须已确认故事方案
    if (project.status !== 'STORY_CONFIRMED' && project.status !== 'CHARACTER_PENDING_CONFIRM' && project.status !== 'CHARACTER_CONFIRMED') {
      return NextResponse.json({
        success: false,
        error: '请先确认故事方案后再生成角色设定',
      }, { status: 400 })
    }

    // 3. 获取最新故事方案
    const storyPackage = await prisma.storyPackage.findFirst({
      where: { projectId, confirmed: true },
      orderBy: { version: 'desc' },
    })
    if (!storyPackage) {
      return NextResponse.json({
        success: false,
        error: '请先确认故事方案后再生成角色设定',
      }, { status: 400 })
    }

    // 4. 更新状态
    await prisma.project.update({
      where: { id: projectId },
      data: { status: 'CHARACTER_GENERATING' },
    })

    const task = await prisma.generationTask.create({
      data: {
        projectId,
        taskType: 'GENERATE_CHARACTERS',
        modelName: project.modelProvider === 'ark' ? (process.env.ARK_TEXT_MODEL || 'doubao-seed-character-251128') : (process.env.AGNES_TEXT_MODEL || 'agnes-2.0-flash'),
        status: 'running',
        input: { project_id: projectId },
      },
    })

    try {
      // 5. 渲染模板
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

      // 6. 调用模型
      const textAdapter = adapterFactory.getTextAdapter(project.modelProvider)
      const baseGenRequest: TextGenerationRequest = {
        taskType: 'character_design',
        systemPrompt: rendered.systemPrompt,
        userPrompt: rendered.userPrompt,
        outputSchema: rendered.outputSchema || undefined,
        temperature: 0.7,
        maxTokens: 8192,
      }

      // 6.1 解析模型输出 — 多种策略 + 递归查找 characters 数组
      //     关键：即便 JSON 解析失败 / 结构嵌套怪异，也能从对象树中捞出 characters
      let rawText = ''
      let content: unknown
      try {
        const response = await textAdapter.generate(baseGenRequest)
        rawText = response.rawText
        content = parseModelResponse(response)
      } catch (firstErr) {
        // 第一次调用本身抛错：保留原样走重试
        rawText = (firstErr as Error).message
        content = undefined
      }

      if (!content || !findCharactersArray(content)) {
        // 第二次重试：用更严格的 prompt 强制模型只输出 JSON
        const retryResponse = await textAdapter.generate({
          ...baseGenRequest,
          systemPrompt:
            rendered.systemPrompt +
            '\n\nCRITICAL: Your previous response was not valid JSON. ' +
            'You MUST output ONLY a single valid JSON object — no markdown, no explanations, no code fences. ' +
            'The top-level object MUST contain a "characters" array. ' +
            'Do NOT wrap it in another key (e.g. do not return {"character_design": {...}}). ' +
            'Every character object MUST include at minimum: name, gender, age, role_type, identity, ' +
            'appearance (object), clothing (object), personality (object), ' +
            'signature_features (array), language_style (object), action_habits (array), ' +
            'zh_fixed_prompt (string), en_fixed_prompt (string). ' +
            'Keep each character concise — the entire response must fit well within 8000 tokens.',
          userPrompt: rendered.userPrompt,
        })
        rawText = retryResponse.rawText
        content = parseModelResponse(retryResponse)
      }

      // 6.2 从对象树中（任意嵌套深度）抽取 characters 数组
      const characters = findCharactersArray(content)

      if (!Array.isArray(characters) || characters.length === 0) {
        const preview = rawText ? rawText.substring(0, 200) : ''
        throw new Error(
          `模型输出缺少 characters 数组${preview ? ` (rawText 预览: ${preview})` : ''}`
        )
      }

      // 转成 Record<string, unknown> 数组，便于后续字段读取
      const characterRecords = characters as Array<Record<string, unknown>>

      // 7. 计算版本号
      const latestChar = await prisma.character.findFirst({
        where: { projectId },
        orderBy: { version: 'desc' },
      })
      const nextVersion = (latestChar?.version || 0) + 1

      // 8. 批量创建角色 (version record created above)
      const created = await Promise.all(
        characterRecords.map((char) =>
          prisma.character.create({
            data: {
              projectId,
              name: (char.name as string) || '',
              gender: (char.gender as string) || '',
              age: (char.age as number) || null,
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

      // 9. 创建版本记录
      const { versionService: vs } = await import('@/server/services/version.service')
      await vs.createVersion({
        projectId, entityType: 'CHARACTER_SET', entityId: projectId,
        snapshot: { character_count: created.length, project_status: 'CHARACTER_PENDING_CONFIRM' },
        changeType: 'GENERATE', description: `生成 ${created.length} 个角色`, sourceTaskId: task.id,
      })

      // 10. 更新项目状态
      await prisma.project.update({
        where: { id: projectId },
        data: { status: 'CHARACTER_PENDING_CONFIRM' },
      })

      await prisma.generationTask.update({
        where: { id: task.id },
        data: { status: 'success', output: { count: created.length, version: nextVersion } },
      })

      return NextResponse.json({
        success: true,
        data: {
          characters: created,
          version: nextVersion,
          count: created.length,
        },
      })

    } catch (genError) {
      const errorMsg = (genError as Error).message
      await prisma.project.update({
        where: { id: projectId },
        data: { status: 'STORY_CONFIRMED' },
      })
      await prisma.generationTask.update({
        where: { id: task.id },
        data: { status: 'failed', errorMessage: errorMsg },
      })
      return NextResponse.json({ success: false, error: errorMsg }, { status: 500 })
    }
  } catch (error) {
    console.error('Failed to generate characters:', error)
    return NextResponse.json(
      { success: false, error: '生成角色设定失败' },
      { status: 500 }
    )
  }
}

/**
 * 解析模型响应 — 优先用 adapter 返回的 json，缺失/失败则从 rawText 中用尽各种策略还原。
 * 返回 undefined 表示完全无法解析。
 */
function parseModelResponse(response: { json?: unknown; rawText?: string }): unknown {
  // 1) adapter 自己已经解析成功就直接用
  const json = response.json
  if (json && typeof json === 'object') {
    return json
  }

  const rawText = response.rawText || ''
  if (!rawText) return undefined

  // 2) 去掉首尾 BOM/空白后直接 parse
  const cleaned = rawText.replace(/^﻿/, '').trim()
  try {
    return JSON.parse(cleaned)
  } catch {
    /* 继续尝试 */
  }

  // 3) 抓 ```json ... ``` 或 ``` ... ``` 代码块
  const fenced = cleaned.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/)
  if (fenced && fenced[1]) {
    try {
      return JSON.parse(fenced[1].trim())
    } catch {
      /* 继续尝试 */
    }
  }

  // 4) 按括号配对，从 rawText 中切出第一个完整的顶层 { ... } 子串再 parse
  const objSlice = sliceFirstBalanced(cleaned, '{', '}')
  if (objSlice) {
    try {
      return JSON.parse(objSlice)
    } catch {
      /* 继续尝试 */
    }
  }

  // 5) 顶层不是对象而是数组的场景 — 模型偶尔直接吐 [{...}, {...}]
  const arrSlice = sliceFirstBalanced(cleaned, '[', ']')
  if (arrSlice) {
    try {
      return JSON.parse(arrSlice)
    } catch {
      /* 继续尝试 */
    }
  }

  // 6) 救命稻草：逐位累加，截到目前能 parse 的最大前缀
  //    （针对 maxTokens 截断导致 JSON 不完整的情况，能多捞一个角色是一个）
  for (let i = cleaned.length; i > 0; i--) {
    const head = cleaned.substring(0, i).trimEnd()
    if (!head.endsWith('{') && !head.endsWith('[') && !head.endsWith(',')) continue
    try {
      const parsed = JSON.parse(head)
      if (parsed && typeof parsed === 'object') return parsed
    } catch {
      /* 继续缩短 */
    }
  }

  return undefined
}

/**
 * 从文本里切出第一个完整配对的 start..end 区间。
 * 正确处理字符串内的嵌套括号和反斜杠转义。
 */
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

/**
 * 在整个 JSON 树中递归查找"角色数组"。
 * 命中条件（任一即可）：
 *   1) 节点本身是数组，元素形如 { name, ... } — 直接返回
 *   2) 节点是对象，含 `characters` 键且值为数组 — 返回该数组
 *   3) 节点是对象，递归到任一字段能找到 — 返回该数组
 */
function findCharactersArray(node: unknown): unknown[] | undefined {
  if (!node || typeof node !== 'object') return undefined

  // 命中 1: 顶层是数组
  if (Array.isArray(node)) {
    if (node.length > 0 && node.every(isCharacterLike)) return node
    return undefined
  }

  const obj = node as Record<string, unknown>

  // 命中 2: 直接键
  if (Array.isArray(obj.characters) && (obj.characters as unknown[]).every(isCharacterLike)) {
    return obj.characters as unknown[]
  }

  // 命中 3: 兼容各种可能出现的包裹键（包含中文别名）
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

  // 命中 4: 单数拼写错误 character （单对象/单数组都尝试）
  if (obj.character && typeof obj.character === 'object') {
    const found = findCharactersArray(obj.character)
    if (found) return found
  }

  // 命中 5: 兜底深度优先 — 任意 key 下找到的第一个 characters-like 数组
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

/** 判断一个对象是否"长得像"角色卡 */
function isCharacterLike(x: unknown): boolean {
  if (!x || typeof x !== 'object') return false
  const o = x as Record<string, unknown>
  if (typeof o.name !== 'string' || o.name.length === 0) return false
  // 至少包含 appearance / gender / role_type / identity 之一
  return (
    'appearance' in o ||
    'gender' in o ||
    'role_type' in o ||
    'roleType' in o ||
    'identity' in o ||
    'personality' in o
  )
}
