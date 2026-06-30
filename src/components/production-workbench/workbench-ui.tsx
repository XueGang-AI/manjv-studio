'use client'

import type { ReactNode } from 'react'
import { AlertCircle, CheckCircle2, Circle, Clock, Loader2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { ProgressBar } from '@/components/ui/progress-bar'
import { cn } from '@/lib/utils'

type Tone = 'default' | 'success' | 'warning' | 'danger' | 'info' | 'primary'

const toneClasses: Record<Tone, string> = {
  default: 'bg-[var(--bg-panel)] text-[var(--color-text-secondary)] border-[var(--color-border-dim)]',
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
          <div className="mb-2 text-xs font-medium uppercase tracking-[0.18em] text-[var(--color-text-muted)]">
            {eyebrow}
          </div>
        )}
        <h1 className="text-2xl font-bold tracking-tight text-[var(--color-text-primary)]">{title}</h1>
        {description && (
          <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--color-text-muted)]">{description}</p>
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
    <Card className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-xs text-[var(--color-text-muted)]">{label}</div>
          <div className="mt-2 text-2xl font-semibold text-[var(--color-text-primary)]">{value}</div>
          {helper && <div className="mt-1 truncate text-xs text-[var(--color-text-muted)]">{helper}</div>}
        </div>
        {icon && (
          <div className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--radius-md)] border', toneClasses[tone])}>
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

export function Panel({
  title,
  description,
  action,
  children,
  className,
}: {
  title: string
  description?: string
  action?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <Card className={cn('overflow-hidden', className)}>
      <div className="flex items-start justify-between gap-3 border-b border-[var(--color-border-dim)] px-4 py-3">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-[var(--color-text-primary)]">{title}</h2>
          {description && <p className="mt-1 text-xs text-[var(--color-text-muted)]">{description}</p>}
        </div>
        {action}
      </div>
      <div className="p-4">{children}</div>
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
    <div className="flex min-h-[220px] flex-col items-center justify-center rounded-[var(--radius-lg)] border border-dashed border-[var(--color-border-dim)] bg-[var(--bg-surface)]/55 p-8 text-center">
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-[var(--radius-lg)] bg-[var(--bg-panel)] text-[var(--color-text-muted)]">
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
