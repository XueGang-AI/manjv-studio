'use client'

import * as React from 'react'
import { Send, StopCircle, RotateCcw, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { GenerationState } from '../types'
import { generationStateLabels } from '../mock-data'

export interface AIInputLoadingProps {
  value?: string
  onChange?: (value: string) => void
  generationState?: GenerationState
  statusText?: string
  onSubmit?: (value: string) => void
  onCancel?: () => void
  onRetry?: () => void
  placeholder?: string
  className?: string
}

const isGenerating = (state: GenerationState): boolean =>
  state === 'submitting' || state === 'queued' || state === 'running'

const AIInputLoading = React.forwardRef<HTMLDivElement, AIInputLoadingProps>(
  (
    {
      value = '',
      onChange,
      generationState = 'idle',
      statusText,
      onSubmit,
      onCancel,
      onRetry,
      placeholder = '输入修改描述...',
      className,
    },
    ref
  ) => {
    const [internalValue, setInternalValue] = React.useState('')
    const inputValue = value ?? internalValue
    const handleChange = onChange ?? setInternalValue

    const textareaRef = React.useRef<HTMLTextAreaElement>(null)
    const generating = isGenerating(generationState)

    // ---- Auto-expand textarea (compact: max 3 lines) ----
    const adjustHeight = React.useCallback(() => {
      const el = textareaRef.current
      if (el) {
        el.style.height = 'auto'
        el.style.height = `${Math.min(el.scrollHeight, 72)}px`
      }
    }, [])

    React.useEffect(() => {
      adjustHeight()
    }, [inputValue, adjustHeight])

    // ---- Keyboard shortcut: Cmd/Ctrl+Enter ----
    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault()
        handleSubmit()
      }
    }

    const handleSubmit = () => {
      if (!inputValue.trim() || generating) return
      onSubmit?.(inputValue.trim())
    }

    // ---- Display status text ----
    const displayStatus = statusText ?? generationStateLabels[generationState]

    // ---- Status dot color ----
    const statusDotColor: Record<GenerationState, string> = {
      idle: 'bg-[var(--text-tertiary)]',
      submitting: 'bg-[var(--status-generating)]',
      queued: 'bg-[var(--status-generating)]',
      running: 'bg-[var(--status-generating)] fa-animate-generating',
      success: 'bg-[var(--status-success)]',
      error: 'bg-[var(--status-error)]',
      cancelled: 'bg-[var(--text-tertiary)]',
    }

    const statusTextColor: Record<GenerationState, string> = {
      idle: 'text-[var(--text-tertiary)]',
      submitting: 'text-[var(--status-generating)]',
      queued: 'text-[var(--status-generating)]',
      running: 'text-[var(--status-generating)]',
      success: 'text-[var(--status-success)]',
      error: 'text-[var(--status-error)]',
      cancelled: 'text-[var(--text-tertiary)]',
    }

    return (
      <div
        ref={ref}
        className={cn(
          'flex flex-col gap-2 rounded-[var(--radius-md)] bg-[var(--bg-card)] p-3',
          'border border-[var(--border-subtle)]',
          className
        )}
      >
        {/* ---- 输入行 ---- */}
        <div className="flex items-end gap-2">
          {/* 输入框 */}
          <div
            className={cn(
              'flex-1 rounded-[var(--radius-md)] border transition-colors duration-150',
              generationState === 'error'
                ? 'border-[var(--status-error)]'
                : 'border-[var(--border-default)]',
              'bg-[var(--bg-input)]'
            )}
          >
            <textarea
              ref={textareaRef}
              value={inputValue}
              onChange={(e) => handleChange(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={placeholder}
              rows={1}
              disabled={generating}
              className={cn(
                'w-full resize-none bg-transparent px-2.5 py-1.5 text-xs leading-relaxed',
                'text-[var(--text-primary)] placeholder:text-[var(--text-disabled)]',
                'focus:outline-none focus:ring-2 focus:ring-[var(--focus-ring)] focus:ring-inset',
                'disabled:opacity-50 disabled:cursor-not-allowed',
                'scrollbar-thin'
              )}
            />
          </div>

          {/* 操作按钮组 */}
          <div className="flex items-center gap-1.5 shrink-0">
            {/* 生成中：取消 */}
            {generating && (
              <button
                type="button"
                onClick={onCancel}
                className={cn(
                  'inline-flex items-center justify-center h-7 w-7 rounded-[var(--radius-md)]',
                  'text-[var(--status-error)] bg-[var(--error-soft)]',
                  'hover:border-[var(--status-error)] border border-transparent',
                  'transition-colors duration-150 cursor-pointer'
                )}
                title="停止生成"
              >
                <StopCircle className="h-3.5 w-3.5" />
              </button>
            )}

            {/* 错误：重试 */}
            {generationState === 'error' && onRetry && (
              <button
                type="button"
                onClick={onRetry}
                className={cn(
                  'inline-flex items-center justify-center h-7 w-7 rounded-[var(--radius-md)]',
                  'text-[var(--accent-primary)] bg-[var(--accent-soft)]',
                  'hover:border-[var(--accent-primary)] border border-transparent',
                  'transition-colors duration-150 cursor-pointer'
                )}
                title="重试"
              >
                <RotateCcw className="h-3.5 w-3.5" />
              </button>
            )}

            {/* 生成中：Loader */}
            {generating && (
              <div className="flex items-center justify-center h-7 w-7">
                <Loader2 className="h-4 w-4 text-[var(--status-generating)] fa-animate-spin-slow" />
              </div>
            )}

            {/* 空闲/错误/成功/取消：提交按钮 */}
            {!generating && (
              <button
                type="button"
                onClick={handleSubmit}
                disabled={!inputValue.trim()}
                className={cn(
                  'inline-flex items-center justify-center h-7 w-7 rounded-[var(--radius-md)]',
                  'text-[var(--text-inverse)] transition-all duration-200 cursor-pointer',
                  'disabled:opacity-40 disabled:cursor-not-allowed',
                  'active:scale-[0.95]'
                )}
                style={{ background: 'var(--gradient-brand)' }}
                title="提交"
              >
                <Send className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* ---- 状态行 ---- */}
        <div className="flex items-center gap-1.5 min-h-4">
          <span
            className={cn(
              'inline-block h-1.5 w-1.5 rounded-full shrink-0',
              statusDotColor[generationState]
            )}
          />
          <span className={cn('text-[10px] truncate', statusTextColor[generationState])}>
            {displayStatus}
          </span>
        </div>
      </div>
    )
  }
)
AIInputLoading.displayName = 'AIInputLoading'

export { AIInputLoading }
