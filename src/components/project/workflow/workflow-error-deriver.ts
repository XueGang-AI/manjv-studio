/**
 * 步骤级 errorStepId 派生
 * --------------------------------------------
 * 从项目任务列表（GET /api/projects/:id/tasks，复用现有 API）派生
 * 当前仍需用户处理的失败步骤，供 Stepper 显示红色 error 状态。
 *
 * 数据来源：GenerationTask（projectId / episodeId? / shotId? / taskType / status / errorMessage / createdAt）
 * 不修改 Prisma Schema、不修改生成流程、不伪造状态。
 *
 * 可靠性规则：
 * 1. 只有「该 (taskType, scope) 下最新一条任务为 failed」才视为当前失败。
 * 2. 历史失败但后来重试成功 → 最新为 success → 不计错误。
 * 3. 失败后正在重试 → 最新为 running/pending/retrying → 不计错误（显示 generating）。
 * 4. 不仅凭「存在失败记录」判断，必须按 scope 取最新。
 * 5. 多个步骤同时失败 → 取工作流顺序中最靠前的步骤（用户应优先处理）。
 *
 * scope 划分：
 * - 镜头级任务（SHOT_IMAGES / SHOT_VIDEOS）：scope = `shot:${shotId}`，shotId 缺失 → 'global'
 * - 剧集级任务（SCENE_REFERENCES / RENDER_FINAL_VIDEO）：scope = `ep:${episodeId}`
 * - 项目级任务（CHARACTER_IMAGES / STORYBOARD / STORY_PACKAGE / CHARACTERS）：scope = 'global'
 */

import type { WorkflowStatus, WorkflowStepDef } from './workflow-status-mapper'
import { isStatusAfter } from './workflow-status-mapper'

/** 任务类型 → 工作流步骤 id（以项目真实枚举为准） */
const TASK_TYPE_TO_STEP: Record<string, string> = {
  GENERATE_STORY_PACKAGE: 'story',
  GENERATE_CHARACTERS: 'characters',
  GENERATE_CHARACTER_IMAGES: 'character-images',
  GENERATE_STORYBOARD: 'storyboard',
  GENERATE_SCENE_REFERENCES: 'scene-references',
  GENERATE_SHOT_IMAGES: 'shot-images',
  GENERATE_SHOT_VIDEOS: 'shot-videos',
  RENDER_FINAL_VIDEO: 'final-preview',
  // QUALITY_CHECK 是同步辅助任务，不映射到工作流步骤。
}

/** 镜头级任务类型集合 */
const SHOT_SCOPED = new Set([
  'GENERATE_SHOT_IMAGES',
  'GENERATE_SHOT_VIDEOS',
])

/** 剧集级任务类型集合 */
const EPISODE_SCOPED = new Set([
  'GENERATE_SCENE_REFERENCES',
  'RENDER_FINAL_VIDEO',
])

/** 任务的最小字段（与 GenerationTask 子集兼容） */
export interface TaskBrief {
  taskType: string
  status: string
  shotId?: string | null
  episodeId?: string | null
  createdAt: string | number | Date
}

function scopeKey(task: TaskBrief): string {
  if (SHOT_SCOPED.has(task.taskType)) {
    return task.shotId ? `shot:${task.shotId}` : 'global'
  }
  if (EPISODE_SCOPED.has(task.taskType)) {
    return task.episodeId ? `ep:${task.episodeId}` : 'global'
  }
  return 'global'
}

function ts(task: TaskBrief): number {
  const v = task.createdAt
  if (v instanceof Date) return v.getTime()
  return typeof v === 'number' ? v : new Date(v).getTime()
}

/**
 * 派生当前需用户处理的失败步骤 id。
 *
 * @param tasks 项目任务列表（任意顺序，内部按 createdAt 排序）
 * @param steps 工作流步骤定义（用于确定多失败时的优先顺序）
 * @returns 步骤 id，或 null（无当前失败）
 */
export function deriveErrorStepId(
  tasks: TaskBrief[],
  steps: WorkflowStepDef[],
): string | null {
  if (!tasks.length) return null

  // 按 (taskType, scope) 分组，取每组最新任务
  const latest = new Map<string, TaskBrief>()
  for (const task of tasks) {
    const stepId = TASK_TYPE_TO_STEP[task.taskType]
    if (!stepId) continue // 非工作流步骤任务，忽略
    const key = `${task.taskType}::${scopeKey(task)}`
    const prev = latest.get(key)
    if (!prev || ts(task) > ts(prev)) {
      latest.set(key, task)
    }
  }

  // 收集所有「最新为 failed」的步骤
  const failedSteps = new Set<string>()
  for (const task of latest.values()) {
    if (task.status === 'failed') {
      const stepId = TASK_TYPE_TO_STEP[task.taskType]
      if (stepId) failedSteps.add(stepId)
    }
  }

  if (failedSteps.size === 0) return null

  // 取工作流顺序中最靠前的失败步骤
  for (const step of steps) {
    if (failedSteps.has(step.id)) return step.id
  }
  return null
}

function latestTaskOfType(tasks: TaskBrief[], taskType: string, episodeId?: string): TaskBrief | null {
  let latest: TaskBrief | null = null
  for (const task of tasks) {
    if (task.taskType !== taskType) continue
    if (episodeId && task.episodeId && task.episodeId !== episodeId) continue
    if (!latest || ts(task) > ts(latest)) latest = task
  }
  return latest
}

/**
 * 从任务状态补充项目状态没有表达的步骤状态。
 * 当前主要用于“场景参考图”：项目状态没有单独的 SCENE_REFERENCE_CONFIRMED，
 * 因此需要通过 GENERATE_SCENE_REFERENCES 最新任务判断。
 */
export function deriveWorkflowStatusOverrides(
  tasks: TaskBrief[],
  currentStatus: string,
  episodeId?: string,
): Partial<Record<string, WorkflowStatus>> {
  const overrides: Partial<Record<string, WorkflowStatus>> = {}
  const sceneTask = latestTaskOfType(tasks, 'GENERATE_SCENE_REFERENCES', episodeId)

  if (sceneTask?.status === 'success' || isStatusAfter(currentStatus, 'SHOT_IMAGE_GENERATING')) {
    overrides['scene-references'] = 'completed'
  } else if (sceneTask && ['pending', 'retrying', 'running'].includes(sceneTask.status)) {
    overrides['scene-references'] = 'generating'
  }

  return overrides
}
