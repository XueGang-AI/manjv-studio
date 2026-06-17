'use client'

import { usePathname } from 'next/navigation'
import { buildWorkflowSteps, mapWorkflowSteps } from './workflow/workflow-status-mapper'
import { ProjectWorkflowStepper } from './workflow/project-workflow-stepper'
import { MobileWorkflowSummary } from './workflow/mobile-workflow-summary'

interface StepNavigatorProps {
  projectId: string
  currentStatus: string
}

/**
 * StepNavigator — 项目生产流程导航（Phase 2 Film Atelier 升级）
 * --------------------------------------------
 * 外部 API 不变：{ projectId, currentStatus }。
 * 内部委托：
 * - 桌面端 (md+)：ProjectWorkflowStepper 水平 Stepper
 * - 移动端 (<md)：MobileWorkflowSummary 摘要 + 全流程 Sheet
 *
 * 状态推导与路由完全由 workflow-status-mapper 提供，沿用原业务逻辑。
 * 已移除原右侧静态假数据（硬编码 ModelSelector + "队列中" Badge）。
 */
export function StepNavigator({ projectId, currentStatus }: StepNavigatorProps) {
  const pathname = usePathname()
  const steps = mapWorkflowSteps(
    buildWorkflowSteps(projectId),
    currentStatus,
    pathname,
  )

  return (
    <div className="bg-[var(--bg-surface)]/80 backdrop-blur-md border-b border-[var(--border-subtle)]">
      <ProjectWorkflowStepper steps={steps} className="hidden md:block" />
      <MobileWorkflowSummary steps={steps} />
    </div>
  )
}
