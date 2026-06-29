type JsonRecord = Record<string, unknown>

export const REGENERATION_ISSUE_TYPES = [
  'character_drift',
  'hair_inconsistent',
  'scene_drift',
  'phone_fake_ui_text',
  'large_motion_or_hand_deform',
  'audio_issue',
  'other',
] as const

export type RegenerationIssueType = (typeof REGENERATION_ISSUE_TYPES)[number]
export type MotionStrength = 'low' | 'medium' | 'high'

export type CharacterReferenceEntry = {
  characterId: string
  characterName: string
  imageUrl: string
  referenceType: string
  storageObjectKey?: string | null
  sourceUrl?: string | null
}

export type MatchedCharacterReference = {
  character_id: string
  character_name: string
  image_url: string
  reference_type: string
  storage_object_key?: string | null
  source_url?: string | null
}

export type CharacterAppearance = {
  name: string
  appearanceText: string
}

export type ShotPromptContext = {
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
  dialogue?: string | null
}

export type ScenePromptContext = {
  name?: string | null
  location?: string | null
  sceneTime?: string | null
  description?: string | null
}

export type RegenerationQualityOptions = {
  issueTypes?: RegenerationIssueType[]
  fixNote?: string
}

export type IssueFixOverlay = {
  issueTypes: RegenerationIssueType[]
  appliedFixes: string[]
  promptSection: string
  negativeTerms: string[]
  requiresImageRerun: boolean
  recommendedMotionStrength?: MotionStrength
}

const ISSUE_ALIASES: Record<string, RegenerationIssueType> = {
  character_drift: 'character_drift',
  person_drift: 'character_drift',
  role_drift: 'character_drift',
  '人物漂移': 'character_drift',
  '换脸': 'character_drift',
  hair_inconsistent: 'hair_inconsistent',
  hair_drift: 'hair_inconsistent',
  '发型不一致': 'hair_inconsistent',
  '发型漂移': 'hair_inconsistent',
  scene_drift: 'scene_drift',
  environment_drift: 'scene_drift',
  '场景漂移': 'scene_drift',
  phone_fake_ui_text: 'phone_fake_ui_text',
  fake_ui_text: 'phone_fake_ui_text',
  phone_ui: 'phone_fake_ui_text',
  '手机伪 UI/文字': 'phone_fake_ui_text',
  '手机伪UI/文字': 'phone_fake_ui_text',
  '手机伪文字': 'phone_fake_ui_text',
  large_motion_or_hand_deform: 'large_motion_or_hand_deform',
  hand_deform: 'large_motion_or_hand_deform',
  motion_too_large: 'large_motion_or_hand_deform',
  '动作过大/手部变形': 'large_motion_or_hand_deform',
  '手部变形': 'large_motion_or_hand_deform',
  audio_issue: 'audio_issue',
  '音频问题': 'audio_issue',
  other: 'other',
  '其他': 'other',
}

const ISSUE_LABELS: Record<RegenerationIssueType, string> = {
  character_drift: '人物漂移修复',
  hair_inconsistent: '发型一致性修复',
  scene_drift: '场景漂移修复',
  phone_fake_ui_text: '手机伪 UI/文字修复',
  large_motion_or_hand_deform: '动作幅度和手部修复',
  audio_issue: '音频问题标记',
  other: '自定义修复说明',
}

export function normalizeIssueTypes(raw: unknown): RegenerationIssueType[] {
  if (!Array.isArray(raw)) return []

  const normalized: RegenerationIssueType[] = []
  for (const item of raw) {
    if (typeof item !== 'string') continue
    const key = item.trim()
    const mapped = ISSUE_ALIASES[key] || ISSUE_ALIASES[key.toLowerCase()]
    if (!mapped || normalized.includes(mapped)) continue
    normalized.push(mapped)
  }
  return normalized
}

export function sanitizeFixNote(raw: unknown, maxLength = 500): string {
  if (raw === undefined || raw === null) return ''
  if (typeof raw !== 'string') return ''
  return raw.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, maxLength)
}

export function buildIssueFixOverlay(options: RegenerationQualityOptions = {}): IssueFixOverlay {
  const issueTypes = options.issueTypes || []
  const lines: string[] = []
  const negativeTerms = new Set<string>()
  let requiresImageRerun = false
  let recommendedMotionStrength: MotionStrength | undefined

  for (const issueType of issueTypes) {
    if (issueType === 'character_drift') {
      requiresImageRerun = true
      lines.push('人物一致性返工：严格保持同一角色身份、同一脸型、同一年龄感、同一服装、同一配饰和体型比例。不得换脸、不得新增主角、不得把背景人物变成主角。')
      for (const term of ['identity change', 'face morphing', 'different person', 'age change', 'different outfit', 'extra main character']) negativeTerms.add(term)
    }
    if (issueType === 'hair_inconsistent') {
      requiresImageRerun = true
      lines.push('发型一致性返工：严格保持角色设定中的发型、刘海轮廓、发量和扎发位置；如果角色设定为低马尾，不得变成侧马尾、披发、短刘海或长直披发。')
      for (const term of ['different hairstyle', 'side ponytail', 'loose long hair', 'short bangs', 'hair length change']) negativeTerms.add(term)
    }
    if (issueType === 'scene_drift') {
      requiresImageRerun = true
      lines.push('场景一致性返工：严格沿用同一空间的布局、摊位/案台/墙面/灯串/水面/拱桥等位置关系、色温和构图基调，不得随机更换地点或改变核心道具位置。')
      for (const term of ['unstable background', 'environment layout change', 'scene transition', 'room structure change']) negativeTerms.add(term)
    }
    if (issueType === 'phone_fake_ui_text') {
      recommendedMotionStrength = 'low'
      lines.push('手机/直播画面返工：手机屏幕只能出现抽象光点、柔和反光、不可读色块或模糊界面；禁止平台 UI、红色对勾、爱心、点赞图标、logo、水印、字幕、可读文字和伪中文。')
      for (const term of ['readable text', 'fake Chinese text', 'garbled Chinese characters', 'platform UI', 'red check mark', 'heart icon', 'like icon', 'logo', 'watermark', 'subtitle']) negativeTerms.add(term)
    }
    if (issueType === 'large_motion_or_hand_deform') {
      recommendedMotionStrength = 'low'
      lines.push('动作和手部返工：保持连续单镜头、低幅动作，只允许轻微转头、呼吸、手部微调和屏幕光变化；手指数量、手腕和手掌结构必须自然可信。')
      for (const term of ['large body motion', 'warped hands', 'bad fingers', 'extra fingers', 'missing fingers', 'body distortion', 'camera jump']) negativeTerms.add(term)
    }
    if (issueType === 'audio_issue') {
      lines.push('音频问题标记：本次重跑保留自然口型与节奏，最终响度由成片阶段统一标准化处理。')
    }
    if (issueType === 'other') {
      lines.push('按自定义说明进行返工，同时保持角色、场景、道具和镜头连续性不变。')
    }
  }

  const fixNote = sanitizeFixNote(options.fixNote)
  if (fixNote) {
    lines.push(`人工修复说明：${fixNote}`)
  }

  return {
    issueTypes,
    appliedFixes: issueTypes.map(type => ISSUE_LABELS[type]),
    promptSection: lines.length > 0 ? `\n\n[问题驱动返工约束]\n  ${lines.join('\n  ')}` : '',
    negativeTerms: [...negativeTerms],
    requiresImageRerun,
    recommendedMotionStrength,
  }
}

export function extractShotCharacterNames(raw: unknown): string[] {
  const names: string[] = []
  if (!Array.isArray(raw)) return names
  for (const item of raw) {
    if (typeof item === 'string') names.push(item.trim())
    else if (item && typeof item === 'object') {
      const name = (item as JsonRecord).name
      if (typeof name === 'string') names.push(name.trim())
    }
  }
  return names.filter(Boolean)
}

export function buildCharacterAppearanceMap(characters: Array<{
  name?: string | null
  gender?: string | null
  age?: number | null
  appearance?: unknown
  clothing?: unknown
  signatureFeatures?: unknown
}>): Map<string, CharacterAppearance> {
  const charAppearanceByName = new Map<string, CharacterAppearance>()

  for (const c of characters) {
    const name = c.name?.trim()
    if (!name) continue

    const parts: string[] = [name]
    if (c.gender) parts.push(c.gender)
    if (c.age) parts.push(`${c.age}岁`)

    if (c.appearance && typeof c.appearance === 'object') {
      const app = c.appearance as JsonRecord
      if (app.hair_color && app.hair_style) parts.push(`${app.hair_style}、${app.hair_color}`)
      else if (app.hair_style) parts.push(String(app.hair_style))
      else if (app.hair_color) parts.push(`发色${app.hair_color}`)
      if (app.eyes) parts.push(`眼睛：${app.eyes}`)
      if (app.skin) parts.push(`肤色：${app.skin}`)
      if (app.face_shape) parts.push(`脸型：${app.face_shape}`)
      if (app.body_shape) parts.push(`体型：${app.body_shape}`)
    }

    if (c.clothing && typeof c.clothing === 'object') {
      const cloth = c.clothing as JsonRecord
      const daily = (cloth.daily || cloth) as JsonRecord | undefined
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

  return charAppearanceByName
}

export function matchShotCharacterReferences(
  shotCharsRaw: unknown,
  shotContent: { action?: string | null; camera?: unknown; emotion?: string | null },
  refByName: Map<string, CharacterReferenceEntry[]>,
): MatchedCharacterReference[] {
  const shotChars = extractShotCharacterNames(shotCharsRaw)
  if (shotChars.length === 0) return []

  const contentText = [
    shotContent.action || '',
    JSON.stringify(shotContent.camera || {}),
    shotContent.emotion || '',
  ].join(' ').toLowerCase()

  const camera = (shotContent.camera && typeof shotContent.camera === 'object' ? shotContent.camera : {}) as JsonRecord
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

  const matched: MatchedCharacterReference[] = []
  const usedNames = new Set<string>()

  for (const sc of shotChars) {
    let entries: CharacterReferenceEntry[] | undefined
    if (refByName.has(sc)) {
      entries = refByName.get(sc)
    } else {
      for (const [name, refs] of refByName) {
        if (sc.includes(name) || name.includes(sc)) {
          entries = refs
          break
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

export function buildShotImagePrompt(
  basePrompt: string,
  shot: ShotPromptContext,
  styleStr: string,
  charAppearanceByName: Map<string, CharacterAppearance>,
  scene?: ScenePromptContext | null,
  options: RegenerationQualityOptions = {},
): string {
  const shotChars = extractShotCharacterNames(shot.characters)
  const charsInShot: CharacterAppearance[] = []
  for (const sc of shotChars) {
    let found = charAppearanceByName.get(sc)
    if (!found) {
      for (const [name, info] of charAppearanceByName) {
        if (sc.includes(name) || name.includes(sc)) {
          found = info
          break
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
    enhanced += `\n\n[场景一致性硬约束]\n  场景锚点：${sceneParts.join('，')}。\n  必须严格沿用场景参考图的空间布局、摊架、木箱、案台、彩纸墙、拱桥、水面、灯串、色温和构图基调。同一地点不得随机变化。`
  }

  const overlay = buildIssueFixOverlay(options)
  enhanced += overlay.promptSection

  const cameraText = typeof shot.camera === 'object' && shot.camera ? JSON.stringify(shot.camera) : ''
  const visualText = typeof shot.visual === 'object' && shot.visual ? JSON.stringify(shot.visual) : ''
  enhanced += `\n\n[镜头执行]\n  镜头 #${shot.shotNo}${shot.shotName ? `：${shot.shotName}` : ''}。动作：${shot.action || shot.details || basePrompt}。情绪：${shot.emotion || '克制、明确'}。镜头：${cameraText || '稳定短剧镜头'}。视觉：${visualText || '清晰叙事画面'}。`

  enhanced += `\n\n[画面安全规则]\n  竖屏 ${styleStr} 漫剧成片首帧，单一连续镜头，不要漫画分格，不要拼贴，不要海报排版。\n  手机、直播屏幕和任何电子屏只允许抽象光点、不可读色块、模糊反光或简化图形；禁止字幕、水印、logo、平台 UI、红色对勾、爱心、点赞图标、随机 UI 文字、可读文字或乱码中文。\n  手部只做简单可信姿势，脸部不夸张变形，背景人物如无必要必须虚化且不抢主角。\n\nStyle: ${styleStr}, Korean manhwa, cinematic lighting, high quality, consistent character design, stable environment identity`
  return enhanced
}

export function buildShotImageNegativePrompt(baseNegative?: string | null, options: RegenerationQualityOptions = {}): string {
  const overlay = buildIssueFixOverlay(options)
  return [
    baseNegative,
    'ugly, deformed, bad anatomy, bad proportions, low quality, blurry, pixelated, distorted face, identity change, different hairstyle, different outfit, inconsistent background, unstable room layout, extra people, extra fingers, missing fingers, asymmetric eyes, bad hands, warped body, split screen, comic panel grid, poster layout, watermark, text, logo, random UI text, garbled Chinese characters, platform UI, red check mark, heart icon',
    ...overlay.negativeTerms,
  ].filter(Boolean).join(', ')
}

export function selectReferenceImageUrls(characterUrls: string[], sceneUrls: string[]): string[] {
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

export function buildSeedanceConsistencyPrompt(
  basePrompt: string,
  shot: ShotPromptContext,
  duration: number,
  motionStrength: MotionStrength,
  options: RegenerationQualityOptions = {},
): string {
  const overlay = buildIssueFixOverlay(options)
  const cameraText = typeof shot.camera === 'object' && shot.camera ? JSON.stringify(shot.camera) : ''
  const visualText = typeof shot.visual === 'object' && shot.visual ? JSON.stringify(shot.visual) : ''
  const storyAction = shot.action || shot.details || basePrompt
  const dialogue = shot.dialogue ? `对白/旁白只表达为自然口型或音频，不要生成屏幕字幕：${shot.dialogue}` : '无屏幕字幕。'

  return [
    basePrompt,
    '',
    '[Seedance 1.5 Pro 一致性硬约束]',
    'Use the input image as the exact first frame and the only visual anchor. Preserve the same character identity, face shape, bangs outline, hairstyle, outfit, accessories, body proportions, lighting, color palette, props, and environment layout for the entire clip.',
    'Do not change the character into another person. Do not change hair, clothes, age, face, room structure, stall/table/bridge/water/light positions, or background props. Do not add new main characters.',
    'No cutaway, no scene transition, no camera jump, no comic panels, no poster layout. Keep one continuous shot.',
    'Phone and livestream screens may show only abstract light spots, soft reflections, unreadable color blocks, or blurred interface shapes. Do not create readable text, fake subtitles, garbled Chinese characters, platform UI, red check marks, heart/like icons, watermarks, or logos.',
    overlay.promptSection,
    '',
    '[镜头动作]',
    `镜头 #${shot.shotNo}${shot.shotName ? `：${shot.shotName}` : ''}，时长 ${duration}s，动作强度 ${motionStrength}。`,
    `地点：${[shot.location, shot.sceneTime].filter(Boolean).join(' · ') || '延续首帧场景'}。`,
    `动作：${storyAction}。情绪：${shot.emotion || '克制、清晰'}。`,
    `镜头：${cameraText || 'very subtle push-in or stable handheld micro motion'}。视觉：${visualText || 'stable cinematic manhwa frame'}。`,
    dialogue,
    'Motion should be subtle and readable: slight head turn, eye movement, breathing, hand micro movement, screen glow, gentle camera push-in. Avoid large body motion that changes anatomy.',
  ].filter(Boolean).join('\n')
}

export function buildSeedanceNegativePrompt(baseNegative?: string | null, options: RegenerationQualityOptions = {}): string {
  const overlay = buildIssueFixOverlay(options)
  return [
    baseNegative,
    'identity change, face morphing, different hairstyle, different outfit, age change, unstable background, room layout change, scene transition, camera cut, camera jump, extra main character, warped hands, bad fingers, body distortion, flickering, fake subtitles, readable text, garbled Chinese text, platform UI, red check mark, heart icon, like icon, watermark, logo',
    ...overlay.negativeTerms,
  ].filter(Boolean).join(', ')
}

export function normalizeMotionStrength(
  requested: MotionStrength,
  shot: ShotPromptContext,
  issueTypes: RegenerationIssueType[] = [],
): MotionStrength {
  const overlay = buildIssueFixOverlay({ issueTypes })
  if (overlay.recommendedMotionStrength === 'low') return 'low'

  const text = [
    shot.shotName,
    shot.action,
    shot.details,
    shot.emotion,
    shot.location,
    shot.sceneTime,
    typeof shot.camera === 'object' && shot.camera ? JSON.stringify(shot.camera) : '',
  ].filter(Boolean).join(' ')

  if (/特写|近景|凝视|盯着|看屏幕|思考|对话|会议|汇报|投屏|证据|暂停按钮|直播|手机/.test(text)) {
    return 'low'
  }

  if (requested === 'high' && !/奔跑|追逐|打斗|爆炸|冲撞|摔倒|逃离/.test(text)) {
    return 'medium'
  }

  return requested
}
