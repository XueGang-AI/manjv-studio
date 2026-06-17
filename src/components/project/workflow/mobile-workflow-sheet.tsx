'use client'

import * as React from 'react'
import Link from 'next/link'
import { Check, Lock, AlertCircle, Loader2, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { WorkflowStatus, WorkflowStepView } from './workflow-status-mapper'
import { STATUS_ARIA_LABEL } from './workflow-status-mapper'

const ROW_INDICATOR: Record<WorkflowStatus, string> = {
  completed: 'bg-[var(--status-success)] border-transparent',
  active: 'bg-[var(--accent-soft)] border-[var(--accent-primary)]',
  generating: 'bg-[var(--generating-soft)] border-[var(--status-generating)]',
  error: 'bg-[var(--error-soft)] border-[var(--status-error)]',
  locked: 'bg-[var(--bg-card)] border-[var(--border-subtle)]',
}

const ROW_TEXT: Record<WorkflowStatus, string> = {
  completed: 'text-[var(--text-secondary)]',
  active: 'text-[var(--accent-primary)]',
  generating: 'text-[var(--status-generating)]',
  error: 'text-[var(--status-error)]',
  locked: 'text-[var(--text-disabled)]',
}

function RowIcon({ status, index }: { status: WorkflowStatus; index: number }) {
  switch (status) {
    case 'completed': return <Check size={14} className="text-white" />
    case 'generating': return <Loader2 size={14} className="text-[var(--status-generating)] animate-spin" />
    case 'error': return <AlertCircle size={14} className="text-[var(--status-error)]" />
    case 'locked': return <Lock size={12} className="text-[var(--text-disabled)]" />
    case 'active': return <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent-primary)]" />
    default: return <span className="text-[11px] font-bold text-[var(--text-tertiary)]">{index}</span>
  }
}

export interface MobileWorkflowSheetProps {
  steps: WorkflowStepView[]
  open: boolean
  onClose: () => void
}

/**
 * 移动端全流程 Sheet（自实现，不引入新依赖）。
 * - Escape 关闭、背景点击关闭
 * - 打开时锁定 body 滚动
 * - 焦点：打开聚焦关闭按钮，关闭恢复触发元素（由父组件管理 ref 传递）
 */
export function MobileWorkflowSheet({ steps, open, onClose }: MobileWorkflowSheetProps) {
  const panelRef = React.useRef<HTMLDivElement>(null)
  const closeBtnRef = React.useRef<HTMLButtonElement>(null)

  // Escape 关闭
  React.useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  // body 滚动锁定 + 焦点
  React.useEffect(() => {
    if (!open) return
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    // 聚焦面板
    const t = window.setTimeout(() => closeBtnRef.current?.focus(), 30)
    return () => {
      window.clearTimeout(t)
      document.body.style.overflow = prevOverflow
    }
  }, [open])

  if (!open) return null

  return (
    <div className="md:hidden fixed inset-0 z-50 flex flex-col justify-end" role="dialog" aria-modal="true" aria-label="全部生产流程">
      {/* backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />
      {/* panel */}
      <div
        ref={panelRef}
        className="relative bg-[var(--bg-surface)] border-t border-[var(--border-default)] rounded-t-[var(--radius-xl)] max-h-[80vh] overflow-y-auto pb-[env(safe-area-inset-bottom)] shadow-[var(--shadow-elevated)]"
      >
        <div className="sticky top-0 flex items-center justify-between px-4 py-3 bg-[var(--bg-surface)] border-b border-[var(--border-subtle)]">
          <h2 className="text-sm font-semibold text-[var(--text-primary)]">生产流程</h2>
          <button
            ref={closeBtnRef}
            type="button"
            onClick={onClose}
            aria-label="关闭流程列表"
            className="p-1.5 rounded-[var(--radius-sm)] text-[var(--text-tertiary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
          >
            <X size={16} />
          </button>
        </div>

        <ol className="px-4 py-2">
          {steps.map((step) => {
            const isLocked = step.status === 'locked'
            const content = (
              <>
                <span
                  className={cn(
                    'relative flex items-center justify-center w-8 h-8 rounded-full border shrink-0',
                    ROW_INDICATOR[step.status],
                  )}
                >
                  {step.status === 'generating' && (
                    <span className="absolute inset-0 rounded-full bg-[var(--status-generating)]/25 motion-safe:animate-ping" aria-hidden="true" />
                  )}
                  <RowIcon status={step.status} index={step.index} />
                </span>
                <span className="flex-1 min-w-0">
                  <span className={cn('block text-sm font-medium truncate', ROW_TEXT[step.status])}>
                    {step.label}
                  </span>
                  <span className="block text-xs text-[var(--text-tertiary)] mt-0.5">
                    {step.index}/{steps.length} · {STATUS_ARIA_LABEL[step.status]}
                  </span>
                </span>
              </>
            )

            return (
              <li
                key={step.id}
                aria-current={step.isCurrent ? 'step' : undefined}
                className="border-b border-[var(--border-subtle)] last:border-b-0"
              >
                {isLocked ? (
                  <span
                    aria-disabled="true"
                    className="flex items-center gap-3 py-2.5 opacity-55 cursor-not-allowed"
                    aria-label={`${step.label} - ${STATUS_ARIA_LABEL[step.status]}`}
                  >
                    {content}
                  </span>
                ) : (
                  <Link
                    href={step.href}
                    onClick={onClose}
                    className={cn(
                      'flex items-center gap-3 py-2.5 rounded-[var(--radius-md)] transition-colors',
                      'hover:bg-[var(--bg-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]',
                    )}
                    aria-label={`${step.label} - ${STATUS_ARIA_LABEL[step.status]}`}
                  >
                    {content}
                  </Link>
                )}
              </li>
            )
          })}
        </ol>
      </div>
    </div>
  )
}
