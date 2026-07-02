'use client'

import { useState, type ReactNode } from 'react'
import { AlertCircle, CheckCircle2, Circle, Clock, ExternalLink, Image as ImageIcon, Loader2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { ProgressBar } from '@/components/ui/progress-bar'
import { cn } from '@/lib/utils'

export type Tone = 'default' | 'success' | 'warning' | 'danger' | 'info' | 'primary'

const toneClasses: Record<Tone, string> = {
  default: 'bg-[var(--bg-input)] text-[var(--color-text-secondary)] border-[var(--color-border-dim)]',
  success: 'bg-[var(--color-success-muted)] text-[var(--color-success)] border-[var(--color-success)]/25',
  warning: 'bg-[var(--color-warning-muted)] text-[var(--color-warning)] border-[var(--color-warning)]/25',
  danger: 'bg-[var(--color-danger-muted)] text-[var(--color-danger)] border-[var(--color-danger)]/25',
  info: 'bg-[var(--color-info-muted)] text-[var(--color-info)] border-[var(--color-info)]/25',
  primary: 'bg-[var(--color-primary-muted)] text-[var(--color-primary-hover)] border-[var(--color-primary)]/25',
}

export function WorkbenchPageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string
  title: string
  description?: string
  actions?: ReactNode
}) {
  return (
    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
      <div className="min-w-0">
        {eyebrow && (
          <div className="mb-2 text-[11px] font-medium uppercase tracking-[0.2em] text-[var(--color-text-muted)]">
            {eyebrow}
          </div>
        )}
        <h1 className="text-[22px] font-semibold tracking-tight text-[var(--color-text-primary)]">{title}</h1>
        {description && (
          <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--color-text-secondary)]">{description}</p>
        )}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap gap-2">{actions}</div>}
    </div>
  )
}

export function MetricCard({
  label,
  value,
  helper,
  icon,
  tone = 'default',
  progress,
}: {
  label: string
  value: string | number
  helper?: string
  icon?: ReactNode
  tone?: Tone
  progress?: number
}) {
  return (
    <Card className="workbench-glass p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-xs text-[var(--color-text-muted)]">{label}</div>
          <div className="mt-2 text-[28px] font-semibold leading-none text-[var(--color-text-primary)]">{value}</div>
          {helper && <div className="mt-1 truncate text-xs text-[var(--color-text-muted)]">{helper}</div>}
        </div>
        {icon && (
          <div className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--radius-md)] border shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]', toneClasses[tone])}>
            {icon}
          </div>
        )}
      </div>
      {typeof progress === 'number' && (
        <div className="mt-4">
          <ProgressBar value={progress} variant={tone === 'success' ? 'success' : tone === 'warning' ? 'warning' : 'aurora'} />
        </div>
      )}
    </Card>
  )
}

export function CompactMetricCard({
  label,
  value,
  helper,
  icon,
  tone = 'default',
  progress,
}: {
  label: string
  value: string | number
  helper?: string
  icon?: ReactNode
  tone?: Tone
  progress?: number
}) {
  return (
    <div className="rounded-[var(--radius-md)] border border-[var(--color-border-dim)] bg-[var(--bg-panel)]/72 p-2.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.035)]">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-[11px] text-[var(--color-text-muted)]">{label}</div>
          <div className="mt-1 text-lg font-semibold leading-none text-[var(--color-text-primary)]">{value}</div>
          {helper && <div className="mt-1 truncate text-[11px] text-[var(--color-text-muted)]">{helper}</div>}
        </div>
        {icon && (
          <div className={cn('flex h-7 w-7 shrink-0 items-center justify-center rounded-[var(--radius-sm)] border', toneClasses[tone])}>
            {icon}
          </div>
        )}
      </div>
      {typeof progress === 'number' && (
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[var(--bg-input)]">
          <div
            className={cn(
              'h-full rounded-full',
              tone === 'success' ? 'bg-[var(--color-success)]' : tone === 'warning' ? 'bg-[var(--color-warning)]' : tone === 'danger' ? 'bg-[var(--color-danger)]' : 'bg-[var(--gradient-aurora)]',
            )}
            style={{ width: `${Math.max(0, Math.min(100, progress))}%` }}
          />
        </div>
      )}
    </div>
  )
}

export function WorkbenchImage({
  src,
  alt,
  className,
  imgClassName,
  fallback,
  loading = 'eager',
  showOpenAction = true,
  compact = false,
}: {
  src?: string | null
  alt: string
  className?: string
  imgClassName?: string
  fallback?: ReactNode
  loading?: 'eager' | 'lazy'
  showOpenAction?: boolean
  compact?: boolean
}) {
  const [imageState, setImageState] = useState<{ src?: string | null; state: 'idle' | 'loading' | 'loaded' | 'error' }>({
    src,
    state: src ? 'loading' : 'idle',
  })
  const state = imageState.src === src ? imageState.state : src ? 'loading' : 'idle'

  if (!src) {
    return (
      <div className={cn('flex items-center justify-center overflow-hidden rounded-[var(--radius-md)] border border-[var(--color-border-dim)] bg-[var(--bg-input)] text-[var(--color-text-muted)]', className)}>
        {fallback || (
          <div className="flex flex-col items-center gap-2 text-center text-xs">
            <ImageIcon size={22} />
            <span>暂无预览</span>
          </div>
        )}
      </div>
    )
  }

  if (state === 'error') {
    return (
      <div className={cn('relative flex items-center justify-center overflow-hidden rounded-[var(--radius-md)] border border-[var(--color-border-dim)] bg-[var(--bg-input)] text-[var(--color-text-muted)]', className)}>
        <div className={cn('flex flex-col items-center text-center text-xs', compact ? 'gap-1 px-1.5' : 'max-w-[220px] gap-2 px-3')}>
          <AlertCircle size={22} className="text-[var(--color-warning)]" />
          <span className={cn('font-medium text-[var(--color-text-secondary)]', compact && 'text-[10px] leading-4')}>{compact ? '不可读' : '素材读取失败'}</span>
          {!compact && (
            <span className="text-[11px] leading-5 text-[var(--color-text-muted)]">
              已有媒体记录存在，但当前存储链接不可读。
            </span>
          )}
          {!compact && showOpenAction && (
            <a
              href={src}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 rounded-[var(--radius-sm)] border border-[var(--color-border-dim)] px-2 py-1 text-[11px] text-[var(--color-text-secondary)] hover:border-[var(--color-border-bright)] hover:text-[var(--color-text-primary)]"
            >
              检查文件链接 <ExternalLink size={11} />
            </a>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className={cn('relative overflow-hidden rounded-[var(--radius-md)] border border-[var(--color-border-dim)] bg-[var(--bg-input)]', className)}>
      {state === 'loading' && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 bg-[var(--bg-input)] text-xs text-[var(--color-text-muted)]">
          <Loader2 size={18} className="animate-spin text-[var(--color-info)]" />
          <span>读取预览</span>
        </div>
      )}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt}
        className={cn('h-full w-full object-cover', imgClassName)}
        loading={loading}
        onLoad={() => setImageState({ src, state: 'loaded' })}
        onError={() => setImageState({ src, state: 'error' })}
      />
    </div>
  )
}

export function ProductionTable({
  columns,
  children,
  className,
}: {
  columns: string
  children: ReactNode
  className?: string
}) {
  return (
    <div className={cn('overflow-hidden rounded-[var(--radius-lg)] border border-[var(--color-border-dim)] bg-[var(--bg-input)]', className)}>
      <div
        className="grid gap-3 border-b border-[var(--color-border-dim)] bg-[var(--bg-panel)]/90 px-3 py-2 text-[11px] font-medium uppercase tracking-[0.12em] text-[var(--color-text-muted)]"
        style={{ gridTemplateColumns: columns }}
      >
        {children}
      </div>
    </div>
  )
}

export function Panel({
  title,
  description,
  action,
  children,
  className,
  bodyClassName,
}: {
  title: string
  description?: string
  action?: ReactNode
  children: ReactNode
  className?: string
  bodyClassName?: string
}) {
  return (
    <Card className={cn('workbench-glass overflow-hidden', className)}>
      <div className="flex items-start justify-between gap-3 border-b border-[var(--color-border-dim)] px-3.5 py-2.5">
        <div className="min-w-0">
          <h2 className="text-[15px] font-semibold text-[var(--color-text-primary)]">{title}</h2>
          {description && <p className="mt-1 text-xs text-[var(--color-text-muted)]">{description}</p>}
        </div>
        {action}
      </div>
      <div className={cn('p-4', bodyClassName)}>{children}</div>
    </Card>
  )
}

export function StatusPill({
  status,
  label,
  tone,
}: {
  status?: string | null
  label?: string
  tone?: Tone
}) {
  const resolvedTone = tone || toneFromStatus(status)
  return (
    <Badge variant={badgeVariantFromTone(resolvedTone)} dot>
      {label || statusLabel(status)}
    </Badge>
  )
}

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: ReactNode
  title: string
  description?: string
  action?: ReactNode
}) {
  return (
    <div className="flex min-h-[220px] flex-col items-center justify-center rounded-[var(--radius-lg)] border border-dashed border-[var(--color-border-default)] bg-[var(--bg-input)]/60 p-8 text-center">
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-[var(--radius-lg)] border border-[var(--color-border-dim)] bg-[var(--bg-panel)] text-[var(--color-text-muted)]">
        {icon || <Circle size={22} />}
      </div>
      <div className="text-sm font-semibold text-[var(--color-text-primary)]">{title}</div>
      {description && <p className="mt-2 max-w-md text-xs leading-5 text-[var(--color-text-muted)]">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

export function formatDateTime(value?: string | null) {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '-'
  return date.toLocaleString('zh-CN')
}

export function formatDuration(seconds?: number | null) {
  if (seconds == null || Number.isNaN(seconds)) return '-'
  if (seconds < 60) return `${seconds.toFixed(seconds % 1 ? 1 : 0)}s`
  const min = Math.floor(seconds / 60)
  const sec = Math.round(seconds % 60)
  return `${min}:${String(sec).padStart(2, '0')}`
}

export function statusLabel(status?: string | null) {
  if (!status) return '未知'
  const map: Record<string, string> = {
    pending: '队列中',
    retrying: '重试中',
    running: '运行中',
    success: '成功',
    failed: '失败',
    cancelled: '已取消',
    READY: '已生成',
    PENDING: '等待中',
    DRAFT: '草稿',
    RENDERED: '已成片',
    FINAL_CONFIRMED: '已交付',
  }
  return map[status] || status
}

export function toneFromStatus(status?: string | null): Tone {
  if (!status) return 'default'
  if (['success', 'READY', 'RENDERED', 'FINAL_CONFIRMED', 'healthy', 'ok'].includes(status)) return 'success'
  if (['running', 'retrying', 'RENDERING'].includes(status)) return 'info'
  if (['pending', 'PENDING', 'degraded', 'unknown'].includes(status)) return 'warning'
  if (['failed', 'cancelled', 'unhealthy', 'error'].includes(status)) return 'danger'
  return 'default'
}

function badgeVariantFromTone(tone: Tone): 'default' | 'primary' | 'success' | 'warning' | 'danger' | 'info' {
  if (tone === 'primary') return 'primary'
  if (tone === 'success') return 'success'
  if (tone === 'warning') return 'warning'
  if (tone === 'danger') return 'danger'
  if (tone === 'info') return 'info'
  return 'default'
}

export function TaskStatusIcon({ status }: { status?: string | null }) {
  if (status === 'success') return <CheckCircle2 size={16} className="text-[var(--color-success)]" />
  if (status === 'failed') return <AlertCircle size={16} className="text-[var(--color-danger)]" />
  if (status === 'running' || status === 'retrying') return <Loader2 size={16} className="animate-spin text-[var(--color-info)]" />
  return <Clock size={16} className="text-[var(--color-text-muted)]" />
}
