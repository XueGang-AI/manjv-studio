// ============================================
// Film Atelier — 组件导出索引
// ============================================

// Backgrounds
export { GridPattern } from './backgrounds/grid-pattern'
export { RadialGlow } from './backgrounds/radial-glow'

// Workflow
export { Stepper } from './workflow/stepper'
export { StepperHorizontal } from './workflow/stepper-horizontal'

// Prompt
export { AIPromptBox } from './prompt/ai-prompt-box'
export { AIInputLoading } from './prompt/ai-input-loading'

// Upload
export { FileUpload } from './upload/file-upload'

// Media
export { HoverPlayCard } from './media/hover-play-card'
export { ImageComparison } from './media/image-comparison'
export { ChooseImageDialog } from './media/choose-image-dialog'

// Timeline
export { ModernTimeline } from './timeline/modern-timeline'

// Types
export type {
  WorkflowStatus,
  GenerationState,
  UploadState,
  TimelineStatus,
  WorkflowStep,
  MediaCard,
  ImageComparePair,
  UploadFile,
  TimelineEntry,
  ImageOption,
  PromptTemplate,
  ModelOption,
  FilmAtelierCallbacks,
} from './types'
