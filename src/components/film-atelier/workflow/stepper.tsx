'use client'

import * as React from 'react'
import { cn } from '@/lib/utils'
import { Check, Lock, AlertCircle, Loader2 } from 'lucide-react'
import type { WorkflowStep, WorkflowStatus } from '@/components/film-atelier/types'

// ---- Status color mapping ----

const STATUS_TEXT_COLOR: Record<WorkflowStatus, string> = {
  completed: 'text-[var(--text-secondary)]',
  active: 'text-[var(--accent-primary)]',
  generating: 'text-[var(--status-generating)]',
  error: 'text-[var(--status-error)]',
  locked: 'text-[var(--text-disabled)]',
}

const STATUS_DESC_COLOR: Record<WorkflowStatus, string> = {
  completed: 'text-[var(--text-tertiary)]',
  active: 'text-[var(--text-secondary)]',
  generating: 'text-[var(--text-secondary)]',
  error: 'text-[var(--text-tertiary)]',
  locked: 'text-[var(--text-disabled)]',
}

const STATUS_BG: Record<WorkflowStatus, string> = {
  completed: '',
  active: 'bg-[var(--bg-hover)]',
  generating: 'bg-[var(--generating-soft)]',
  error: 'bg-[var(--error-soft)]',
  locked: '',
}

const STATUS_CONNECTOR_COLOR: Record<WorkflowStatus, string> = {
  completed: 'bg-[var(--status-success)]',
  active: 'bg-[var(--accent-primary)]',
  generating: 'bg-[var(--status-generating)]',
  error: 'bg-[var(--status-error)]',
  locked: 'bg-[var(--border-subtle)]',
}

const STATUS_ARIA_LABEL: Record<WorkflowStatus, string> = {
  completed: '已完成',
  active: '当前步骤',
  generating: '生成中',
  error: '出错',
  locked: '未解锁',
}

// ---- Stepper props ----

export interface StepperProps extends React.HTMLAttributes<HTMLDivElement> {
  steps: WorkflowStep[]
  onStepChange?: (stepId: string) => void
}

// ---- Step icon ----

function StepIcon({ status, index }: { status: WorkflowStatus; index: number }) {
  switch (status) {
    case 'completed':
      return <Check size={14} className="text-white" />
    case 'generating':
      return <Loader2 size={14} className="text-[var(--status-generating)] animate-spin" />
    case 'error':
      return <AlertCircle size={14} className="text-[var(--status-error)]" />
    case 'locked':
      return <Lock size={12} className="text-[var(--text-disabled)]" />
    case 'active':
      return <span className="w-2 h-2 rounded-full bg-[var(--accent-primary)]" />
    default:
      return <span className="text-[var(--text-tertiary)] text-xs font-semibold">{index + 1}</span>
  }
}

// ---- Step indicator (circle) ----

function StepIndicator({
  status,
  index,
}: {
  status: WorkflowStatus
  index: number
}) {
  const isCompleted = status === 'completed'
  const isActive = status === 'active'
  const isGenerating = status === 'generating'

  return (
    <div
      className={cn(
        'relative flex items-center justify-center w-8 h-8 rounded-full shrink-0 transition-colors',
        isCompleted && 'bg-[var(--status-success)]',
        isActive && 'bg-[var(--accent-primary)]/15 border border-[var(--accent-primary)]/40',
        isGenerating && 'bg-[var(--status-generating)]/15 border border-[var(--status-generating)]/40',
        status === 'error' && 'bg-[var(--status-error)]/15 border border-[var(--status-error)]/40',
        status === 'locked' && 'bg-[var(--bg-card)] border border-[var(--border-subtle)]',
        !isCompleted && !isActive && !isGenerating && status !== 'error' && status !== 'locked' && 'bg-[var(--bg-card)] border border-[var(--border-default)]',
      )}
    >
      {/* Pulse ring for generating */}
      {isGenerating && (
        <span className="absolute inset-0 rounded-full bg-[var(--status-generating)]/20 motion-safe:animate-ping" />
      )}
      <StepIcon status={status} index={index} />
    </div>
  )
}

// ---- Vertical Stepper ----

const Stepper = React.forwardRef<HTMLDivElement, StepperProps>(
  ({ steps, onStepChange, className, ...props }, ref) => {
    return (
      <div
        ref={ref}
        role="list"
        aria-label="工作流步骤"
        className={cn('flex flex-col', className)}
        {...props}
      >
        {steps.map((step, index) => {
          const isLast = index === steps.length - 1
          const isLocked = step.status === 'locked'
          const isActive = step.status === 'active'
          const isClickable = !isLocked && onStepChange

          return (
            <div
              key={step.id}
              role="listitem"
              aria-current={isActive ? 'step' : undefined}
              aria-label={`${step.title} - ${STATUS_ARIA_LABEL[step.status]}`}
              className={cn('flex gap-3', !isLast && 'flex-1')}
            >
              {/* Left column: indicator + connector */}
              <div className="flex flex-col items-center w-8 shrink-0">
                <StepIndicator status={step.status} index={index} />
                {!isLast && (
                  <div
                    className={cn(
                      'w-px flex-1 min-h-6 my-1 transition-colors',
                      STATUS_CONNECTOR_COLOR[step.status],
                    )}
                  />
                )}
              </div>

              {/* Right column: title + description */}
              <div
                className={cn(
                  'flex-1 pb-4 pt-0.5',
                  isLocked && 'opacity-50',
                )}
              >
                <button
                  type="button"
                  disabled={isLocked}
                  onClick={isClickable ? () => onStepChange(step.id) : undefined}
                  className={cn(
                    'w-full text-left rounded-md px-2.5 py-1.5 -ml-2.5 transition-colors',
                    STATUS_BG[step.status],
                    isClickable
                      ? 'cursor-pointer hover:bg-[var(--bg-hover)]'
                      : isLocked
                        ? 'cursor-not-allowed'
                        : 'cursor-default',
                  )}
                >
                  <span
                    className={cn(
                      'text-sm font-medium leading-tight',
                      STATUS_TEXT_COLOR[step.status],
                    )}
                  >
                    {step.title}
                  </span>
                  {step.description && (
                    <p
                      className={cn(
                        'text-xs mt-0.5 leading-relaxed',
                        STATUS_DESC_COLOR[step.status],
                      )}
                    >
                      {step.description}
                    </p>
                  )}
                </button>
              </div>
            </div>
          )
        })}
      </div>
    )
  },
)
Stepper.displayName = 'Stepper'

export { Stepper }
