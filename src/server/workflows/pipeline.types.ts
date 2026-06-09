// ============================================
// 工作流管道类型定义 - Phase 1 预留
// Phase 2+ 实现完整工作流引擎
// ============================================

export enum WorkflowStage {
  STORY_INPUT = 'STORY_INPUT',
  STORY_GENERATION = 'STORY_GENERATION',
  STORY_CONFIRMATION = 'STORY_CONFIRMATION',
  CHARACTER_GENERATION = 'CHARACTER_GENERATION',
  CHARACTER_CONFIRMATION = 'CHARACTER_CONFIRMATION',
  CHARACTER_IMAGE_GENERATION = 'CHARACTER_IMAGE_GENERATION',
  CHARACTER_IMAGE_SELECTION = 'CHARACTER_IMAGE_SELECTION',
  STORYBOARD_GENERATION = 'STORYBOARD_GENERATION',
  STORYBOARD_CONFIRMATION = 'STORYBOARD_CONFIRMATION',
  SHOT_IMAGE_GENERATION = 'SHOT_IMAGE_GENERATION',
  SHOT_IMAGE_SELECTION = 'SHOT_IMAGE_SELECTION',
  SHOT_VIDEO_GENERATION = 'SHOT_VIDEO_GENERATION',
  SHOT_VIDEO_SELECTION = 'SHOT_VIDEO_SELECTION',
  RENDER = 'RENDER',
  FINAL_REVIEW = 'FINAL_REVIEW',
}

export interface WorkflowState {
  projectId: string
  currentStage: WorkflowStage
  completedStages: WorkflowStage[]
  stageData: Record<string, unknown>
  confirmedAt: Record<string, string>
  createdAt: string
  updatedAt: string
}
