'use client'

import * as React from 'react'
import Link from 'next/link'
import { ChevronLeft, ChevronRight, List } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { WorkflowStepView } from './workflow-status-mapper'
import { STATUS_DISPLAY_TEXT, STATUS_ARIA_LABEL } from './workflow-status-mapper'
import { MobileWorkflowSheet } from './mobile-workflow-sheet'

/** 状态摘要圆点颜色 */
const DOT_CLASS: Record<WorkflowStepView['status'], string> = {
  completed: 'bg-[var(--status-success)]',
  active: 'bg-[var(--accent-primary)]',
  generating: 'bg-[var(--status-generating)]',
  error: 'bg-[var(--status-error)]',
  locked: 'bg-[var(--status-locked)]',
}

export interface MobileWorkflowSummaryProps {
  steps: WorkflowStepView[]
}

/**
 * 移动端工作流摘要（< md）。
 * 显示：当前步骤名称 / 序号 / 状态 / 上一阶段 / 下一阶段 / 展开全部。
 * 上一阶段：总有（已完成步可回看）；下一阶段：仅当下一步未锁定。
 */
export function MobileWorkflowSummary({ steps }: MobileWorkflowSummaryProps) {
  const [sheetOpen, setSheetOpen] = React.useState(false)
  const expandBtnRef = React.useRef<HTMLButtonElement>(null)

  // 当前步：优先 pathname 匹配，否则回退到工作步
  const current =
    steps.find((s) => s.isCurrent) ??
    steps.find((s) => s.status === 'active' || s.status === 'generating' || s.status === 'error') ??
    steps[0]

  const prev = current.index > 1 ? steps[current.index - 2] : null // 1-based → 前一个
  const next = current.index < steps.length ? steps[current.index] : null // 1-based → 下一个（数组 0-based 索引 = index）
  const nextEnabled = !!next && next.status !== 'locked'

  return (
    <>
      <div
        className="md:hidden flex items-center gap-2 px-3 py-2 bg-[var(--bg-surface)] border-b border-[var(--border-subtle)]"
        aria-label={`当前步骤 ${current.index} / ${steps.length}：${current.label}，${STATUS_ARIA_LABEL[current.status]}`}
      >
        {/* 上一阶段 */}
        {prev ? (
          <Link
            href={prev.href}
            aria-label="上一阶段"
            className="p-1.5 rounded-[var(--radius-sm)] text-[var(--text-tertiary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
          >
            <ChevronLeft size={18} />
          </Link>
        ) : (
          <span className="p-1.5 text-[var(--text-disabled)]" aria-hidden="true">
            <ChevronLeft size={18} />
          </span>
        )}

        {/* 当前步骤摘要 */}
        <div className="flex-1 min-w-0 flex items-center gap-2">
          <span className={cn('w-2 h-2 rounded-full shrink-0', DOT_CLASS[current.status])} aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-[var(--text-primary)] truncate leading-tight">
              {current.label}
            </p>
            <p className="text-[11px] text-[var(--text-tertiary)] leading-tight mt-0.5">
              <span className="font-mono">{current.index}/{steps.length}</span>
              <span className="mx-1">·</span>
              {STATUS_DISPLAY_TEXT[current.status]}
            </p>
          </div>
        </div>

        {/* 下一阶段 */}
        {nextEnabled ? (
          <Link
            href={next!.href}
            aria-label="下一阶段"
            className="p-1.5 rounded-[var(--radius-sm)] text-[var(--text-tertiary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
          >
            <ChevronRight size={18} />
          </Link>
        ) : (
          <span className="p-1.5 text-[var(--text-disabled)]" aria-hidden="true">
            <ChevronRight size={18} />
          </span>
        )}

        {/* 展开全部 */}
        <button
          ref={expandBtnRef}
          type="button"
          onClick={() => setSheetOpen(true)}
          aria-label="展开全部流程"
          aria-expanded={sheetOpen}
          className="p-1.5 rounded-[var(--radius-sm)] text-[var(--text-tertiary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
        >
          <List size={18} />
        </button>
      </div>

      <MobileWorkflowSheet
        steps={steps}
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
      />
    </>
  )
}
