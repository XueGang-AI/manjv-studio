'use client'

import { usePathname } from 'next/navigation'
import { buildWorkflowSteps, mapWorkflowSteps } from '@/components/project/workflow/workflow-status-mapper'
import { ProjectWorkflowStepper } from '@/components/project/workflow/project-workflow-stepper'

/**
 * 开发预览：五种工作流状态的视觉验证。
 * 不接真实路由/数据库，纯渲染组件，用于覆盖 generating / error 等真实项目数据难以触发的状态。
 * 路由 /preview/workflow-states，正式环境可保留供回归。
 */
const SCENARIOS: Array<{
  name: string
  status: string
  pathname: string
  errorStepId?: string
}> = [
  { name: 'completed（步 1-8 已完成，步 9 active）', status: 'SHOT_VIDEO_CONFIRMED', pathname: '/projects/demo/episodes/1/final-preview' },
  { name: 'generating（角色图生成中）', status: 'CHARACTER_IMAGE_GENERATING', pathname: '/projects/demo/character-images' },
  { name: 'active（场景参考图待生成）', status: 'STORYBOARD_CONFIRMED', pathname: '/projects/demo/episodes/1/scene-references' },
  { name: 'generating（分镜图生成中）', status: 'SHOT_IMAGE_GENERATING', pathname: '/projects/demo/episodes/1/shot-images' },
  { name: 'generating（合成中）', status: 'RENDERING', pathname: '/projects/demo/episodes/1/final-preview' },
  { name: 'error（角色图步骤失败）', status: 'CHARACTER_CONFIRMED', pathname: '/projects/demo/character-images', errorStepId: 'character-images' },
  { name: 'error（场景参考图步骤失败）', status: 'STORYBOARD_CONFIRMED', pathname: '/projects/demo/episodes/1/scene-references', errorStepId: 'scene-references' },
  { name: 'error（视频片段步骤失败）', status: 'SHOT_IMAGE_CONFIRMED', pathname: '/projects/demo/episodes/1/shot-videos', errorStepId: 'shot-videos' },
  { name: 'locked（DRAFT，仅步 1 可用）', status: 'DRAFT', pathname: '/projects/demo' },
]

export default function WorkflowStatesPreviewPage() {
  const _pathname = usePathname()
  const baseSteps = buildWorkflowSteps('demo')

  return (
    <div className="min-h-screen bg-[var(--bg-base)] p-8 space-y-8">
      <div>
        <h1 className="text-xl font-bold text-[var(--text-primary)] mb-1">工作流状态预览</h1>
        <p className="text-sm text-[var(--text-tertiary)]">五种状态视觉验证：completed / active / generating / error / locked</p>
      </div>
      {SCENARIOS.map((s) => {
        const steps = mapWorkflowSteps(baseSteps, s.status, s.pathname, s.errorStepId ? { errorStepId: s.errorStepId } : {})
        const summary = steps.map(st => `${st.index}:${st.label}=${st.status}`).join('  ')
        return (
          <div key={s.name} className="rounded-[var(--radius-lg)] border border-[var(--border-default)] bg-[var(--bg-surface)] overflow-hidden">
            <div className="px-4 py-2 border-b border-[var(--border-subtle)]">
              <p className="text-sm font-medium text-[var(--text-primary)]">{s.name}</p>
              <p className="text-xs text-[var(--text-tertiary)] font-mono mt-0.5">{summary}</p>
            </div>
            <ProjectWorkflowStepper steps={steps} />
          </div>
        )
      })}
    </div>
  )
}
