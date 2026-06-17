'use client'

/**
 * AIConsoleSheet — 移动端 AI 创作控制台 Sheet（Phase 4）
 * --------------------------------------------
 * 小于 md 时通过底部"AI 创作"入口打开，内嵌同一个 AIPromptBox 组件，
 * 与桌面共享业务状态与提交逻辑（不维护两套表单）。
 *
 * 复用 Phase 2 验证的焦点与滚动管理模式：
 * - Escape 关闭、点击遮罩关闭
 * - 打开聚焦标题、关闭恢复触发按钮
 * - body 滚动锁定
 * - 移动安全区 + 内部滚动 + 虚拟键盘适配
 * - 生成期间关闭后任务继续由后端运行，重新打开状态恢复（来自真实数据）
 */

import * as React from 'react'
import { X } from 'lucide-react'
import { AIPromptBox, type AIPromptBoxProps } from './ai-prompt-box'

export interface AIConsoleSheetProps extends AIPromptBoxProps {
  open: boolean
  onClose: () => void
  /** 关闭后焦点恢复目标（触发按钮） */
  returnFocusRef?: React.RefObject<HTMLElement | null>
}

export function AIConsoleSheet({ open, onClose, returnFocusRef, ...promptProps }: AIConsoleSheetProps) {
  const closeBtnRef = React.useRef<HTMLButtonElement>(null)
  const titleRef = React.useRef<HTMLHeadingElement>(null)

  // Escape 关闭
  React.useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  // body 滚动锁定 + 焦点进入/恢复
  React.useEffect(() => {
    if (!open) return
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    // 打开：聚焦标题（避免直接聚焦 textarea 弹起键盘打断布局）
    const t = window.setTimeout(() => titleRef.current?.focus(), 30)
    // 在 effect body 读取触发按钮，cleanup 用稳定引用
    const triggerEl = returnFocusRef?.current ?? null
    return () => {
      window.clearTimeout(t)
      document.body.style.overflow = prevOverflow
      const r = window.requestAnimationFrame(() => triggerEl?.focus())
      void r
    }
  }, [open, returnFocusRef])

  if (!open) return null

  return (
    <div
      className="md:hidden fixed inset-0 z-50 flex flex-col justify-end"
      role="dialog"
      aria-modal="true"
      aria-label="AI 视频创作控制台"
    >
      {/* backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />
      {/* panel：max-h 限制 + 内部滚动 + 安全区 */}
      <div className="relative bg-[var(--bg-surface)] border-t border-[var(--border-default)] rounded-t-[var(--radius-xl)] max-h-[85vh] flex flex-col pb-[env(safe-area-inset-bottom)] shadow-[var(--shadow-elevated)]">
        <div className="sticky top-0 flex items-center justify-between px-4 py-3 bg-[var(--bg-surface)] border-b border-[var(--border-subtle)]">
          <h2
            ref={titleRef}
            tabIndex={-1}
            className="text-sm font-semibold text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] rounded"
          >
            AI 视频 Prompt
          </h2>
          <button
            ref={closeBtnRef}
            type="button"
            onClick={onClose}
            aria-label="关闭 AI 控制台"
            className="p-1.5 rounded-[var(--radius-sm)] text-[var(--text-tertiary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
          >
            <X size={16} />
          </button>
        </div>
        {/* 内部滚动区：长 Prompt + 错误信息 */}
        <div className="overflow-y-auto p-4">
          <AIPromptBox {...promptProps} />
        </div>
      </div>
    </div>
  )
}
