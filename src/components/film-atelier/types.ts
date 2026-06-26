// ============================================
// Film Atelier — 类型定义
// ============================================

/** 工作流步骤状态 */
export type WorkflowStatus = 'completed' | 'active' | 'generating' | 'error' | 'locked'

/** 生成任务状态 */
export type GenerationState = 'idle' | 'submitting' | 'queued' | 'running' | 'success' | 'error' | 'cancelled'

/** 文件上传状态 */
export type UploadState = 'idle' | 'validating' | 'uploading' | 'uploaded' | 'parsing' | 'parsed' | 'error'

/** 时间线条目状态 */
export type TimelineStatus = 'completed' | 'current' | 'error' | 'upcoming'

/** 工作流步骤 */
export interface WorkflowStep {
  id: string
  title: string
  description?: string
  status: WorkflowStatus
}

/** 媒体卡片 */
export interface MediaCard {
  id: string
  shotNo: number
  name: string
  duration?: string
  aspectRatio?: string
  resolution?: string
  modelName?: string
  status: 'ready' | 'generating' | 'error' | 'selected'
  version?: string
  thumbnailUrl?: string
  videoUrl?: string
  createdAt?: string
}

/** 图片对比 */
export interface ImageComparePair {
  id: string
  beforeLabel: string
  afterLabel: string
  beforeUrl: string
  afterUrl: string
  beforeVersion?: string
  afterVersion?: string
  beforeModel?: string
  afterModel?: string
  beforeTime?: string
  afterTime?: string
}

/** 上传文件 */
export interface UploadFile {
  id: string
  name: string
  size: number
  type: string
  status: UploadState
  progress?: number
  error?: string
  parseResult?: string
}

/** 时间线条目 */
export interface TimelineEntry {
  id: string
  title: string
  status: TimelineStatus
  description: string
  timestamp?: string
}

/** 图片选择项 */
export interface ImageOption {
  id: string
  url: string
  label: string
  version?: string
  modelName?: string
  createdAt?: string
  selected?: boolean
}

/** Prompt 模板 */
export interface PromptTemplate {
  id: string
  name: string
  description: string
  content: string
}

/** 模型选项 */
export interface ModelOption {
  id: string
  name: string
  provider: 'ark'
  description?: string
}

/** 组件事件回调 */
export interface FilmAtelierCallbacks {
  onSubmit?: (prompt: string) => void
  onCancel?: () => void
  onRetry?: (id: string) => void
  onSelect?: (id: string) => void
  onUpload?: (files: File[]) => void
  onDelete?: (id: string) => void
  onPreview?: (id: string) => void
  onCompare?: (beforeId: string, afterId: string) => void
  onSetFinal?: (id: string) => void
  onStepChange?: (stepId: string) => void
}
