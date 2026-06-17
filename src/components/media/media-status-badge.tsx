/**
 * 媒体状态徽章（Phase 3）
 * --------------------------------------------
 * 将视频/图片组状态映射为 Film Atelier 状态色 + 文案 + 图标。
 * 状态不仅靠颜色：同时输出图标与可访问文本。
 * 不持续发光，不在卡片上大面积铺色。
 */
import { Check, Loader2, AlertCircle, Lock, HelpCircle } from 'lucide-react'
import { cn } from '@/lib/utils'

export type MediaStatus =
  | 'none'
  | 'generating'
  | 'generated'
  | 'selected'
  | 'confirmed'
  | 'failed'
  | 'disabled'

const STATUS_TEXT: Record<MediaStatus, string> = {
  none: '未生成',
  generating: '生成中',
  generated: '待选择',
  selected: '已选择',
  confirmed: '已确认',
  failed: '生成失败',
  disabled: '不可用',
}

const STATUS_ICON: Record<MediaStatus, React.ReactNode> = {
  none: <HelpCircle size={12} />,
  generating: <Loader2 size={12} className="animate-spin" />,
  generated: <HelpCircle size={12} />,
  selected: <Check size={12} />,
  confirmed: <Check size={12} />,
  failed: <AlertCircle size={12} />,
  disabled: <Lock size={12} />,
}

const STATUS_CLASS: Record<MediaStatus, string> = {
  none: 'text-[var(--text-tertiary)] border-[var(--border-subtle)]',
  generating: 'text-[var(--status-generating)] border-[var(--status-generating)]/40 bg-[var(--generating-soft)]',
  generated: 'text-[var(--text-secondary)] border-[var(--border-default)]',
  selected: 'text-[var(--accent-primary)] border-[var(--accent-border)] bg-[var(--accent-soft)]',
  confirmed: 'text-[var(--status-success)] border-[var(--status-success)]/40 bg-[var(--success-soft)]',
  failed: 'text-[var(--status-error)] border-[var(--status-error)]/40 bg-[var(--error-soft)]',
  disabled: 'text-[var(--text-disabled)] border-[var(--border-subtle)] opacity-60',
}

export function MediaStatusBadge({
  status,
  className,
  showText = true,
}: {
  status: MediaStatus
  className?: string
  showText?: boolean
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full border text-[11px] font-medium leading-none',
        STATUS_CLASS[status],
        className,
      )}
      aria-label={STATUS_TEXT[status]}
    >
      {STATUS_ICON[status]}
      {showText && <span>{STATUS_TEXT[status]}</span>}
    </span>
  )
}
