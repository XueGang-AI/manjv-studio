// ============================================
// API 响应类型
// ============================================

export interface ApiResponse<T = unknown> {
  success: boolean
  data?: T
  error?: string
  message?: string
}

export interface PaginatedResponse<T> extends ApiResponse<T[]> {
  total: number
  page: number
  pageSize: number
}

// ============================================
// 项目类型
// ============================================
export interface ProjectFormData {
  project_name: string
  story_type: string
  background: string
  main_characters: string[]
  core_conflict: string
  story_summary: string
  full_story?: string
  art_style: string
  target_platform: string
  episode_count: number
  episode_duration: number
  aspect_ratio: string
  audience?: string
  ending_type?: string
}

export interface ProjectStatus {
  status: string
  label: string
  step: number
  completed: boolean
  current: boolean
}
