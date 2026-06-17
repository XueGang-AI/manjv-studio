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

// ---- Horizontal Stepper props ----

export interface StepperHorizontalProps extends React.HTMLAttributes<HTMLDivElement> {
  steps: WorkflowStep[]
  onStepChange?: (stepId: string) => void
}

// ---- Step icon ----

function StepIcon({ status, index }: { status: WorkflowStatus; index: number }) {
  switch (status) {
    case 'completed':
      return <Check size={12} className="text-white" />
    case 'generating':
      return <Loader2 size={12} className="text-[var(--status-generating)] animate-spin" />
    case 'error':
      return <AlertCircle size={12} className="text-[var(--status-error)]" />
    case 'locked':
      return <Lock size={10} className="text-[var(--text-disabled)]" />
    case 'active':
      return <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent-primary)]" />
    default:
      return <span className="text-[var(--text-tertiary)] text-[10px] font-semibold">{index + 1}</span>
  }
}

// ---- Step indicator (circle, smaller for horizontal) ----

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
        'relative flex items-center justify-center w-6 h-6 rounded-full shrink-0 transition-colors',
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

// ---- Compact step (for mobile/narrow view: current + adjacent) ----

function CompactStepCard({
  step,
  index,
  onStepChange,
}: {
  step: WorkflowStep
  index: number
  onStepChange?: (stepId: string) => void
}) {
  const isLocked = step.status === 'locked'
  const isActive = step.status === 'active'
  const isClickable = !isLocked && onStepChange

  return (
    <button
      type="button"
      disabled={isLocked}
      onClick={isClickable ? () => onStepChange(step.id) : undefined}
      className={cn(
        'flex items-center gap-2.5 px-3 py-2 rounded-md transition-colors',
        isActive && 'bg-[var(--bg-hover)]',
        step.status === 'generating' && 'bg-[var(--generating-soft)]',
        step.status === 'error' && 'bg-[var(--error-soft)]',
        isClickable ? 'cursor-pointer hover:bg-[var(--bg-hover)]' : isLocked ? 'cursor-not-allowed opacity-50' : 'cursor-default',
      )}
      aria-current={isActive ? 'step' : undefined}
      aria-label={`${step.title} - ${STATUS_ARIA_LABEL[step.status]}`}
    >
      <StepIndicator status={step.status} index={index} />
      <div className="text-left min-w-0">
        <div className={cn('text-sm font-medium truncate', STATUS_TEXT_COLOR[step.status])}>
          {step.title}
        </div>
        {step.description && (
          <div className="text-xs text-[var(--text-tertiary)] truncate">
            {step.description}
          </div>
        )}
      </div>
    </button>
  )
}

// ---- Determine which steps to show on mobile ----

function getVisibleSteps(steps: WorkflowStep[]): WorkflowStep[] {
  const activeIndex = steps.findIndex(
    (s) => s.status === 'active' || s.status === 'generating',
  )
  // If no active/generating, show first 3
  if (activeIndex === -1) {
    return steps.slice(0, 3)
  }
  const start = Math.max(0, activeIndex - 1)
  const end = Math.min(steps.length, activeIndex + 2)
  return steps.slice(start, end)
}

// ---- Horizontal Stepper ----

const StepperHorizontal = React.forwardRef<HTMLDivElement, StepperHorizontalProps>(
  ({ steps, onStepChange, className, ...props }, ref) => {
    return (
      <div ref={ref} className={cn('w-full', className)} {...props}>
        {/* Full horizontal stepper (desktop) */}
        <div
          role="list"
          aria-label="工作流步骤"
          className="hidden sm:flex items-start"
        >
          {steps.map((step, index) => {
            const isLast = index === steps.length - 1
            const isLocked = step.status === 'locked'
            const isActive = step.status === 'active'
            const isClickable = !isLocked && onStepChange

            // Connector color: match the step's own status
            const connectorColor = STATUS_CONNECTOR_COLOR[step.status]

            return (
              <div
                key={step.id}
                role="listitem"
                aria-current={isActive ? 'step' : undefined}
                aria-label={`${step.title} - ${STATUS_ARIA_LABEL[step.status]}`}
                className={cn(
                  'flex flex-col items-center',
                  !isLast && 'flex-1',
                  isLocked && 'opacity-50',
                )}
              >
                {/* Top row: indicator + connector */}
                <div className="flex items-center w-full">
                  {/* Connector line (left) */}
                  {index > 0 && (
                    <div
                      className={cn(
                        'h-px flex-1',
                        STATUS_CONNECTOR_COLOR[steps[index - 1].status],
                      )}
                    />
                  )}

                  <button
                    type="button"
                    disabled={isLocked}
                    onClick={isClickable ? () => onStepChange(step.id) : undefined}
                    className={cn(
                      'shrink-0 rounded-md p-1 transition-colors',
                      isActive && 'bg-[var(--bg-hover)]',
                      step.status === 'generating' && 'bg-[var(--generating-soft)]',
                      step.status === 'error' && 'bg-[var(--error-soft)]',
                      isClickable ? 'cursor-pointer hover:bg-[var(--bg-hover)]' : isLocked ? 'cursor-not-allowed' : 'cursor-default',
                    )}
                  >
                    <StepIndicator status={step.status} index={index} />
                  </button>

                  {/* Connector line (right) */}
                  {!isLast && (
                    <div className={cn('h-px flex-1', connectorColor)} />
                  )}
                </div>

                {/* Label below */}
                <div className="mt-1.5 text-center max-w-20 px-1">
                  <span
                    className={cn(
                      'text-xs font-medium leading-tight block truncate',
                      STATUS_TEXT_COLOR[step.status],
                    )}
                  >
                    {step.title}
                  </span>
                  {step.description && (
                    <span className="text-[10px] text-[var(--text-tertiary)] leading-tight block truncate mt-0.5">
                      {step.description}
                    </span>
                  )}
                </div>
              </div>
            )
          })}
        </div>

        {/* Compact stepper (mobile) */}
        <div className="sm:hidden flex flex-col gap-1" role="list" aria-label="工作流步骤（精简）">
          {getVisibleSteps(steps).map((step) => {
            const originalIndex = steps.indexOf(step)
            return (
              <CompactStepCard
                key={step.id}
                step={step}
                index={originalIndex}
                onStepChange={onStepChange}
              />
            )
          })}
          {/* Indicate more steps exist */}
          {steps.length > 3 && (
            <div className="text-[10px] text-[var(--text-tertiary)] text-center py-1">
              共 {steps.length} 步
            </div>
          )}
        </div>
      </div>
    )
  },
)
StepperHorizontal.displayName = 'StepperHorizontal'

export { StepperHorizontal }
