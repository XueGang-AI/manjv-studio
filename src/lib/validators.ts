// ============================================
// 表单校验工具
// ============================================

export interface ValidationError {
  field: string
  message: string
}

export interface ValidationResult {
  valid: boolean
  errors: ValidationError[]
}

const STORY_TYPES = ['霸总', '古风', '现代', '悬疑', '玄幻', '甜宠', '都市', '职场', '虐恋', '复仇', '重生', '权谋', '校园', '家庭']
const ART_STYLES = ['韩漫', '日漫', '国风', '写实', '电影感', '赛博朋克', '水彩', '厚涂', '3D', '黑白漫画', '高对比光影', '都市雨夜']
const PLATFORMS = ['抖音', '快手', '视频号', '小红书', 'B站', '自定义']
const ASPECT_RATIOS = ['9:16', '16:9', '1:1']

export function validateProjectForm(data: Record<string, unknown>): ValidationResult {
  const errors: ValidationError[] = []

  // project_name: 2-50 字，必填
  const name = (data.project_name as string) || ''
  if (!name.trim()) {
    errors.push({ field: 'project_name', message: '项目名称不能为空' })
  } else if (name.trim().length < 2) {
    errors.push({ field: 'project_name', message: '项目名称至少 2 个字符' })
  } else if (name.trim().length > 50) {
    errors.push({ field: 'project_name', message: '项目名称不能超过 50 个字符' })
  }

  // story_type: 必填，支持多选逗号分隔或自定义
  const storyType = (data.story_type as string) || ''
  if (!storyType.trim()) {
    errors.push({ field: 'story_type', message: '请选择故事类型' })
  }

  // background: 必填
  const bg = (data.background as string) || ''
  if (!bg.trim()) {
    errors.push({ field: 'background', message: '故事背景不能为空' })
  } else if (bg.trim().length < 5) {
    errors.push({ field: 'background', message: '故事背景至少 5 个字符' })
  }

  // main_characters: 必填，至少 1 个
  const characters = data.main_characters as string[] | string
  if (Array.isArray(characters)) {
    if (characters.length === 0 || characters.every(c => !c.trim())) {
      errors.push({ field: 'main_characters', message: '至少需要 1 个主要角色' })
    }
  } else if (!characters || !(characters as string).trim()) {
    errors.push({ field: 'main_characters', message: '至少需要 1 个主要角色' })
  }

  // core_conflict: 选填（不超过 300 字）
  const conflict = (data.core_conflict as string) || ''
  if (conflict.trim().length > 300) {
    errors.push({ field: 'core_conflict', message: '核心冲突不能超过 300 个字符' })
  }

  // story_summary: 20-2000 字，必填
  const summary = (data.story_summary as string) || ''
  if (!summary.trim()) {
    errors.push({ field: 'story_summary', message: '故事梗概不能为空' })
  } else if (summary.trim().length < 20) {
    errors.push({ field: 'story_summary', message: '故事梗概至少 20 个字符' })
  } else if (summary.trim().length > 2000) {
    errors.push({ field: 'story_summary', message: '故事梗概不能超过 2000 个字符' })
  }

  // art_style: 必填，支持多选逗号分隔或自定义
  const artStyle = (data.art_style as string) || ''
  if (!artStyle.trim()) {
    errors.push({ field: 'art_style', message: '请选择期望画风' })
  }

  // target_platform: 必填
  const platform = (data.target_platform as string) || ''
  if (!platform.trim()) {
    errors.push({ field: 'target_platform', message: '请选择目标平台' })
  }

  // episode_count: 1-100，必填
  const epCount = Number(data.episode_count)
  if (isNaN(epCount) || epCount < 1 || epCount > 100) {
    errors.push({ field: 'episode_count', message: '集数需要在 1-100 之间' })
  }

  // episode_duration: 15-300 秒，必填
  const epDuration = Number(data.episode_duration)
  if (isNaN(epDuration) || epDuration < 15 || epDuration > 300) {
    errors.push({ field: 'episode_duration', message: '单集时长需要在 15-300 秒之间' })
  } else if (!Number.isInteger(epDuration)) {
    errors.push({ field: 'episode_duration', message: '单集时长必须为整数' })
  }

  // aspect_ratio: 必填
  const ratio = (data.aspect_ratio as string) || ''
  if (!ASPECT_RATIOS.includes(ratio)) {
    errors.push({ field: 'aspect_ratio', message: '无效的画面比例' })
  }

  return { valid: errors.length === 0, errors }
}

export function formatValidationErrors(errors: ValidationError[]): string {
  return errors.map(e => e.message).join('；')
}
