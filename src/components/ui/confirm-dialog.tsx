'use client'

import * as React from 'react'
import { cn } from '@/lib/utils'
import { Button } from './button'
import { AlertTriangle, X } from 'lucide-react'

type ConfirmVariant = 'danger' | 'warning' | 'info'

export interface ConfirmDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description: string
  variant?: ConfirmVariant
  confirmLabel?: string
  cancelLabel?: string
  onConfirm: () => void | Promise<void>
  loading?: boolean
}

const VARIANT_ICON: Record<ConfirmVariant, { icon: React.ReactNode; color: string }> = {
  danger: {
    icon: <AlertTriangle size={24} />,
    color: 'text-[var(--color-danger)]',
  },
  warning: {
    icon: <AlertTriangle size={24} />,
    color: 'text-[var(--color-warning)]',
  },
  info: {
    icon: <AlertTriangle size={24} />,
    color: 'text-[var(--color-info)]',
  },
}

export function ConfirmDialog({
  open, onOpenChange, title, description,
  variant = 'danger', confirmLabel = '确认', cancelLabel = '取消',
  onConfirm, loading,
}: ConfirmDialogProps) {
  if (!open) return null

  const cfg = VARIANT_ICON[variant]

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => onOpenChange(false)} />

      {/* Dialog */}
      <div className={cn(
        'relative w-full max-w-md mx-4 rounded-[var(--radius-lg)] p-6',
        'bg-[var(--bg-elevated)] border border-[var(--color-border-default)] shadow-[var(--shadow-elevated)]',
      )}>
        {/* Close button */}
        <button onClick={() => onOpenChange(false)}
          className="absolute top-4 right-4 text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-colors cursor-pointer">
          <X size={16} />
        </button>

        {/* Icon + Title */}
        <div className="flex items-start gap-4 mb-4">
          <div className={cn('mt-0.5 shrink-0', cfg.color)}>{cfg.icon}</div>
          <div>
            <h3 className="text-base font-semibold text-[var(--color-text-primary)]">{title}</h3>
            <p className="text-sm text-[var(--color-text-muted)] mt-1.5 leading-relaxed">{description}</p>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-3 mt-6">
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)} disabled={loading}>
            {cancelLabel}
          </Button>
          <Button
            variant={variant === 'danger' ? 'destructive' : 'default'}
            size="sm"
            onClick={onConfirm}
            disabled={loading}
          >
            {loading ? '处理中…' : confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  )
}
