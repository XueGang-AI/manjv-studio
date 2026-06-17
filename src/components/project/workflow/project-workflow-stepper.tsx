'use client'

import * as React from 'react'
import Link from 'next/link'
import { Check, Lock, AlertCircle, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { WorkflowStatus, WorkflowStepView } from './workflow-status-mapper'
import { STATUS_ARIA_LABEL } from './workflow-status-mapper'

/** 状态 → 圆形指示器背景/边框 */
const INDICATOR_CLASS: Record<WorkflowStatus, string> = {
  completed: 'bg-[var(--status-success)] border-transparent',
  active: 'bg-[var(--accent-soft)] border-[var(--accent-primary)]',
  generating: 'bg-[var(--generating-soft)] border-[var(--status-generating)]',
  error: 'bg-[var(--error-soft)] border-[var(--status-error)]',
  locked: 'bg-[var(--bg-card)] border-[var(--border-subtle)]',
}

const LABEL_CLASS: Record<WorkflowStatus, string> = {
  completed: 'text-[var(--text-secondary)]',
  active: 'text-[var(--accent-primary)] font-semibold',
  generating: 'text-[var(--status-generating)] font-semibold',
  error: 'text-[var(--status-error)] font-semibold',
  locked: 'text-[var(--text-disabled)]',
}

const CONNECTOR_CLASS: Record<WorkflowStatus, string> = {
  completed: 'bg-[var(--status-success)]/45',
  active: 'bg-[var(--accent-primary)]/55',
  generating: 'bg-[var(--status-generating)]/55',
  error: 'bg-[var(--status-error)]/55',
  locked: 'bg-[var(--border-subtle)]',
}

function StepIcon({ status, index }: { status: WorkflowStatus; index: number }) {
  switch (status) {
    case 'completed':
      return <Check size={13} className="text-white" />
    case 'generating':
      return <Loader2 size={13} className="text-[var(--status-generating)] animate-spin" />
    case 'error':
      return <AlertCircle size={13} className="text-[var(--status-error)]" />
    case 'locked':
      return <Lock size={11} className="text-[var(--text-disabled)]" />
    case 'active':
      return <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent-primary)]" />
    default:
      return <span className="text-[10px] font-bold text-[var(--text-tertiary)]">{index}</span>
  }
}

export interface ProjectWorkflowStepperProps {
  steps: WorkflowStepView[]
  className?: string
}

/**
 * 桌面端水平工作流 Stepper（md+）。
 * 仅视觉与可访问性升级，路由与状态判定由 workflow-status-mapper 提供。
 */
export function ProjectWorkflowStepper({ steps, className }: ProjectWorkflowStepperProps) {
  return (
    <nav aria-label="项目生产流程" className={cn('w-full', className)}>
      <ol className="flex items-center gap-0 overflow-x-auto py-2.5 px-6">
        {steps.map((step, i) => {
          const isLocked = step.status === 'locked'
          const isGenerating = step.status === 'generating'
          const indicator = (
            <span
              className={cn(
                'relative flex items-center justify-center w-7 h-7 rounded-full border shrink-0 transition-colors',
                INDICATOR_CLASS[step.status],
              )}
            >
              {isGenerating && (
                <span
                  className="absolute inset-0 rounded-full bg-[var(--status-generating)]/25 motion-safe:animate-ping"
                  aria-hidden="true"
                />
              )}
              <StepIcon status={step.status} index={step.index} />
            </span>
          )

          const labelEl = (
            <span className={cn('text-xs whitespace-nowrap transition-colors', LABEL_CLASS[step.status])}>
              {step.label}
            </span>
          )

          return (
            <li
              key={step.id}
              className="flex items-center"
              aria-current={step.isCurrent ? 'step' : undefined}
            >
              {i > 0 && (
                <div
                  className={cn(
                    'w-6 h-0.5 mx-1.5 rounded-full shrink-0 transition-colors',
                    CONNECTOR_CLASS[steps[i - 1].status],
                  )}
                  aria-hidden="true"
                />
              )}

              {isLocked ? (
                <span
                  aria-disabled="true"
                  className="flex items-center gap-2 px-2 py-1.5 rounded-[var(--radius-md)] opacity-55 cursor-not-allowed"
                  aria-label={`${step.label} - ${STATUS_ARIA_LABEL[step.status]}`}
                >
                  {indicator}
                  {labelEl}
                </span>
              ) : (
                <Link
                  href={step.href}
                  className={cn(
                    'flex items-center gap-2 px-2 py-1.5 rounded-[var(--radius-md)] transition-colors',
                    'hover:bg-[var(--bg-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]',
                  )}
                  aria-label={`${step.label} - ${STATUS_ARIA_LABEL[step.status]}`}
                >
                  {indicator}
                  {labelEl}
                </Link>
              )}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
