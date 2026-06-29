/**
 * 生产流程状态映射器（Phase 2）
 * --------------------------------------------
 * 将项目状态 (project.status) + 当前路由 pathname 映射为
 * Film Atelier 五状态工作流模型，与视觉渲染分离。
 *
 * 业务逻辑完全继承自原 StepNavigator（src/components/project/step-navigator.tsx）：
 * - completed / locked 判断沿用 isStatusAfter
 * - generating 仅在 *_GENERATING / RENDERING 时为真
 * - 新增 error：status === 'FAILED' 时标记"工作步"为错误
 *
 * 不依赖任务状态、SSE、数据库变更；仅依赖 currentStatus 与 pathname。
 */

export type WorkflowStatus =
  | 'completed'
  | 'active'
  | 'generating'
  | 'error'
  | 'locked'

/** 步骤的可访问性标签 */
export const STATUS_ARIA_LABEL: Record<WorkflowStatus, string> = {
  completed: '已完成',
  active: '当前步骤',
  generating: '生成中',
  error: '出错',
  locked: '未解锁',
}

/** 状态 → 展示文案（移动端摘要用） */
export const STATUS_DISPLAY_TEXT: Record<WorkflowStatus, string> = {
  completed: '已完成',
  active: '进行中',
  generating: '生成中',
  error: '需处理',
  locked: '未解锁',
}

/**
 * 项目状态生命周期顺序（继承自原 isStatusAfter）。
 * 共 22 项：DRAFT → FINAL_CONFIRMED。即"21 个状态"所指的项目状态枚举。
 * FAILED 不在此序列中（错误终态，单独处理）。
 */
const STATUS_ORDER = [
  'DRAFT',
  'STORY_GENERATING', 'STORY_PENDING_CONFIRM', 'STORY_CONFIRMED',
  'CHARACTER_GENERATING', 'CHARACTER_PENDING_CONFIRM', 'CHARACTER_CONFIRMED',
  'CHARACTER_IMAGE_GENERATING', 'CHARACTER_IMAGE_PENDING_PICK', 'CHARACTER_IMAGE_CONFIRMED',
  'STORYBOARD_GENERATING', 'STORYBOARD_PENDING_CONFIRM', 'STORYBOARD_CONFIRMED',
  'SHOT_IMAGE_GENERATING', 'SHOT_IMAGE_PENDING_PICK', 'SHOT_IMAGE_CONFIRMED',
  'SHOT_VIDEO_GENERATING', 'SHOT_VIDEO_PENDING_PICK', 'SHOT_VIDEO_CONFIRMED',
  'RENDERING', 'RENDERED', 'FINAL_CONFIRMED',
] as const

/**
 * 判断 current 状态是否已到达/越过 target 状态。
 * 沿用原逻辑：DRAFT 不算"之后"；FAILED 不在序列中 → 返回 false。
 */
export function isStatusAfter(current: string, target: string): boolean {
  const currentIndex = STATUS_ORDER.indexOf(current as (typeof STATUS_ORDER)[number])
  const targetIndex = STATUS_ORDER.indexOf(target as (typeof STATUS_ORDER)[number])
  if (currentIndex === -1 || targetIndex === -1) return false
  return currentIndex >= targetIndex && current !== 'DRAFT'
}

export interface WorkflowStepDef {
  /** 步骤唯一 id */
  id: string
  /** 展示标题 */
  label: string
  /** 路由（已含 projectId 与默认 episode=1） */
  href: string
  /** 该步已完成时的状态阈值 */
  confirmStatus: string
  /** 解锁该步所需的前置状态阈值（step 0 用 'DRAFT'，永不锁） */
  unlockStatus: string
  /** 该步正在生成时的状态（可选） */
  generatingStatus?: string
  /** 当前路由匹配函数 */
  matchPath: (pathname: string) => boolean
}

/**
 * 构建项目工作流步骤定义（9 步，顺序固定）。
 * 路由沿用项目工作台约定，场景参考图作为独立前置步骤。
 */
export function buildWorkflowSteps(projectId: string, episodeId = '1'): WorkflowStepDef[] {
  const base = `/projects/${projectId}`
  const episodeBase = `${base}/episodes/${episodeId}`
  return [
    {
      id: 'info',
      label: '项目信息',
      href: base,
      confirmStatus: 'DRAFT',
      unlockStatus: 'DRAFT',
      matchPath: (p) => p === base,
    },
    {
      id: 'story',
      label: '故事方案',
      href: `${base}/story`,
      confirmStatus: 'STORY_CONFIRMED',
      unlockStatus: 'DRAFT',
      matchPath: (p) => p.includes('/story'),
    },
    {
      id: 'characters',
      label: '角色设定',
      href: `${base}/characters`,
      confirmStatus: 'CHARACTER_CONFIRMED',
      unlockStatus: 'STORY_CONFIRMED',
      matchPath: (p) => p.includes('/characters') && !p.includes('character-images'),
    },
    {
      id: 'character-images',
      label: '角色图',
      href: `${base}/character-images`,
      confirmStatus: 'CHARACTER_IMAGE_CONFIRMED',
      unlockStatus: 'CHARACTER_CONFIRMED',
      generatingStatus: 'CHARACTER_IMAGE_GENERATING',
      matchPath: (p) => p.includes('character-images'),
    },
    {
      id: 'storyboard',
      label: '分镜脚本',
      href: `${episodeBase}/storyboard`,
      confirmStatus: 'STORYBOARD_CONFIRMED',
      unlockStatus: 'CHARACTER_IMAGE_CONFIRMED',
      generatingStatus: 'STORYBOARD_GENERATING',
      matchPath: (p) => p.includes('storyboard'),
    },
    {
      id: 'scene-references',
      label: '场景参考图',
      href: `${episodeBase}/scene-references`,
      confirmStatus: 'SHOT_IMAGE_GENERATING',
      unlockStatus: 'STORYBOARD_CONFIRMED',
      matchPath: (p) => p.includes('scene-references'),
    },
    {
      id: 'shot-images',
      label: '分镜图',
      href: `${episodeBase}/shot-images`,
      confirmStatus: 'SHOT_IMAGE_CONFIRMED',
      unlockStatus: 'STORYBOARD_CONFIRMED',
      generatingStatus: 'SHOT_IMAGE_GENERATING',
      matchPath: (p) => p.includes('shot-images'),
    },
    {
      id: 'shot-videos',
      label: '视频片段',
      href: `${episodeBase}/shot-videos`,
      confirmStatus: 'SHOT_VIDEO_CONFIRMED',
      unlockStatus: 'SHOT_IMAGE_CONFIRMED',
      generatingStatus: 'SHOT_VIDEO_GENERATING',
      matchPath: (p) => p.includes('shot-videos'),
    },
    {
      id: 'final-preview',
      label: '成片预览',
      href: `${episodeBase}/final-preview`,
      confirmStatus: 'RENDERED',
      unlockStatus: 'SHOT_VIDEO_CONFIRMED',
      generatingStatus: 'RENDERING',
      matchPath: (p) => p.includes('final-preview'),
    },
  ]
}

export interface WorkflowStepView extends WorkflowStepDef {
  /** 该步的渲染状态 */
  status: WorkflowStatus
  /** 用户当前所在步（pathname 匹配） */
  isCurrent: boolean
  /** 序号（1-based） */
  index: number
}

export interface MapWorkflowOptions {
  /**
   * 强制将指定步骤标记为 error。
   *
   * 项目级 `FAILED` 状态在当前业务中无阶段信息（无法判断失败发生在哪一步），
   * 且无业务路径写入该状态。因此 error 不由 project.status 自动推导，
   * 而由调用方在确知某步存在失败任务时显式传入。
   *
   * 传入的 stepId 必须存在于步骤定义中，否则忽略。
   */
  errorStepId?: string
  /** 由任务状态或页面上下文派生的步骤状态覆盖。 */
  statusOverrides?: Partial<Record<string, WorkflowStatus>>
}

/**
 * 将步骤定义映射为带状态的视图。
 *
 * 映射规则（每步独立判定）：
 * 1. completed → 已越过该步确认阈值
 * 2. error   → 调用方显式指定的失败步（errorStepId），优先于 locked
 * 3. locked  → 业务前置未满足
 * 4. generating → 项目状态恰为该步的 generatingStatus
 * 5. active   → 工作步（首个非 completed 非 locked 步，非上述）
 *
 * completed 步骤可回退查看（locked 永远为 false）。
 * error 优先于 locked：failed 任务证明该步曾被触达，需用户处理。
 * 不依赖任务状态/SSE；error 来源由调用方决定，不伪造状态。
 */
export function mapWorkflowSteps(
  steps: WorkflowStepDef[],
  currentStatus: string,
  pathname: string,
  options: MapWorkflowOptions = {},
): WorkflowStepView[] {
  // 工作步 = 首个非 completed 非 locked
  const preliminary = steps.map((step) => {
    const completed =
      step.id === 'info'
        ? isStatusAfter(currentStatus, 'DRAFT')
        : isStatusAfter(currentStatus, step.confirmStatus)
    const locked =
      step.id === 'info'
        ? false
        : !isStatusAfter(currentStatus, step.unlockStatus)
    return { step, completed, locked }
  })

  return preliminary.map((b, i) => {
    const { step, completed, locked } = b
    const isCurrent = step.matchPath(pathname)
    const statusOverride = options.statusOverrides?.[step.id]

    let status: WorkflowStatus
    if (options.errorStepId && step.id === options.errorStepId) {
      // error 优先于 locked/generating/active：
      // failed 任务证明该步曾被触达，需用户处理，即使"逻辑上"尚未解锁。
      status = 'error'
    } else if (statusOverride) {
      status = statusOverride
    } else if (completed) {
      status = 'completed'
    } else if (locked) {
      status = 'locked'
    } else if (step.generatingStatus && currentStatus === step.generatingStatus) {
      status = 'generating'
    } else {
      status = 'active'
    }

    return { ...step, status, isCurrent, index: i + 1 }
  })
}
