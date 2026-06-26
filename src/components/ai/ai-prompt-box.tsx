'use client'

/**
 * AIPromptBox — 正式 AI 创作控制台展示组件（Phase 4/5）
 * --------------------------------------------
 * 受控展示组件：状态由 useAIPromptBox hook 提供（提升到调用方），
 * 桌面常驻控制台与移动 Sheet 共用同一份 hook 状态，不各自维护副本。
 *
 * 接入真实链路：
 * - 数据：videoPrompt（DB 真实字段）
 * - 模型：modelProvider（只读展示，后端按此选模型）
 * - 提交/状态/错误：由 AIPromptBoxState 提供
 *
 * 不做：联网搜索、语音、Canvas、假停止按钮、setTimeout 模拟、硬编码 API 地址。
 * 停止按钮仅在真实取消能力存在时显示（视频远端任务无取消 API → 不显示）。
 */

import * as React from 'react'
import { RefreshCw, Loader2, AlertCircle, CheckCircle2, Film } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { GENERATION_STATE_LABEL, type GenerationState } from './generation-state'
import type { AIPromptBoxState } from './use-ai-prompt-box'

const MOTION_OPTIONS: Array<{ value: 'low' | 'medium' | 'high'; label: string }> = [
  { value: 'low', label: '低' },
  { value: 'medium', label: '中' },
  { value: 'high', label: '高' },
]

const STATE_ACCENT: Record<GenerationState, string> = {
  idle: 'text-[var(--text-tertiary)]',
  submitting: 'text-[var(--accent-primary)]',
  queued: 'text-[var(--status-generating)]',
  running: 'text-[var(--status-generating)]',
  success: 'text-[var(--status-success)]',
  error: 'text-[var(--status-error)]',
  cancelled: 'text-[var(--text-tertiary)]',
}

const STATE_ICON: Record<GenerationState, React.ReactNode> = {
  idle: <Film size={14} />,
  submitting: <Loader2 size={14} className="animate-spin" />,
  queued: <Loader2 size={14} className="animate-spin" />,
  running: <Loader2 size={14} className="animate-spin" />,
  success: <CheckCircle2 size={14} />,
  error: <AlertCircle size={14} />,
  cancelled: <AlertCircle size={14} />,
}

export interface AIPromptBoxProps {
  shotId: string
  shotNo: number
  modelProvider: string
  state: AIPromptBoxState
  className?: string
}

export function AIPromptBox({
  shotId,
  shotNo,
  modelProvider: _modelProvider,
  state: s,
  className,
}: AIPromptBoxProps) {
  const showState = s.state !== 'idle' || s.error !== null

  return (
    <div className={cn('rounded-[var(--radius-lg)] border border-[var(--border-default)] bg-[var(--bg-card)] p-4 space-y-3', className)}>
      {/* 头部：标题 + 模型 + 状态 */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-sm font-semibold text-[var(--text-primary)] truncate">
            视频 Prompt · 镜头 {shotNo}
          </span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-[10px] text-[var(--text-tertiary)] font-mono px-1.5 py-0.5 rounded border border-[var(--border-subtle)]">
            豆包 Ark
          </span>
          {showState && (
            <span className={cn('inline-flex items-center gap-1 text-[11px] font-medium', STATE_ACCENT[s.state])}>
              {STATE_ICON[s.state]}
              {GENERATION_STATE_LABEL[s.state]}
            </span>
          )}
        </div>
      </div>

      {/* Prompt 输入：textarea 自动增长 */}
      <div>
        <label htmlFor={`ai-prompt-${shotId}`} className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
          创作提示词
        </label>
        <textarea
          id={`ai-prompt-${shotId}`}
          value={s.prompt}
          onChange={(e) => s.setPrompt(e.target.value)}
          disabled={s.isBusy}
          rows={4}
          maxLength={2000}
          placeholder="描述镜头的动作、运镜与氛围，例如：特写女主转身，镜头缓慢推进，雨夜霓虹光影…"
          className={cn(
            'w-full rounded-[var(--radius-md)] border bg-[var(--bg-input)] px-3 py-2 text-sm text-[var(--text-primary)] resize-y',
            'placeholder:text-[var(--text-tertiary)] focus:outline-none focus:ring-2 focus:ring-[var(--focus-ring)] focus:border-transparent',
            'disabled:opacity-60 disabled:cursor-not-allowed',
            'border-[var(--border-default)]',
          )}
          aria-label={`镜头 ${shotNo} 视频 Prompt`}
        />
        <div className="flex items-center justify-between mt-1">
          <span className="text-[10px] text-[var(--text-tertiary)]">
            {s.prompt.length}/2000
          </span>
          {s.prompt.trim().length === 0 && !s.isBusy && (
            <span className="text-[10px] text-[var(--status-warning)]">提示词不能为空</span>
          )}
        </div>
      </div>

      {/* 生成参数：运动强度 */}
      <div className="flex items-center gap-2">
        <span className="text-xs text-[var(--text-secondary)] shrink-0">运动强度</span>
        <div className="flex gap-1">
          {MOTION_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              disabled={s.isBusy}
              onClick={() => s.setMotion(opt.value)}
              className={cn(
                'px-2.5 py-1 rounded-full text-xs border transition-colors',
                s.motion === opt.value
                  ? 'bg-[var(--accent-primary)] text-[var(--text-inverse)] border-[var(--accent-primary)]'
                  : 'border-[var(--border-default)] text-[var(--text-secondary)] hover:border-[var(--accent-border)] hover:text-[var(--accent-primary)]',
                'disabled:opacity-60 disabled:cursor-not-allowed',
              )}
              aria-pressed={s.motion === opt.value}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* 错误信息 */}
      {s.error && (
        <div className="rounded-[var(--radius-md)] bg-[var(--error-soft)] border border-[var(--status-error)]/40 px-3 py-2 flex items-start gap-2">
          <AlertCircle size={14} className="text-[var(--status-error)] mt-0.5 shrink-0" />
          <p className="text-xs text-[var(--status-error)] flex-1">{s.error}</p>
          <button
            type="button"
            onClick={s.handleRetry}
            disabled={s.isBusy}
            className="text-xs text-[var(--status-error)] underline hover:opacity-70 disabled:opacity-40"
          >
            重试
          </button>
        </div>
      )}

      {/* 提交按钮 */}
      <div className="flex items-center justify-end gap-2">
        <Button
          type="button"
          size="sm"
          onClick={s.handleSubmit}
          disabled={!s.canSubmit}
          icon={s.submitting ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
        >
          {s.submitting ? '提交中…' : s.state === 'error' ? '重新生成' : '生成视频'}
        </Button>
      </div>
      {/* 注：视频远端任务无取消 API，故不显示停止按钮（不造假按钮） */}
    </div>
  )
}
