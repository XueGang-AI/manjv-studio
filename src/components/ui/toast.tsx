'use client'

import * as React from 'react'
import { cn } from '@/lib/utils'
import { X, CheckCircle2, AlertTriangle, XCircle, Info } from 'lucide-react'

// ---- Types ----
type ToastType = 'success' | 'error' | 'warning' | 'info'

export interface Toast {
  id: string
  type: ToastType
  title: string
  description?: string
  duration?: number
}

interface ToastContextValue {
  toasts: Toast[]
  addToast: (toast: Omit<Toast, 'id'>) => void
  removeToast: (id: string) => void
}

const ToastContext = React.createContext<ToastContextValue | null>(null)

export function useToast() {
  const ctx = React.useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used within ToastProvider')
  return ctx
}

// ---- Provider ----
let toastCounter = 0

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = React.useState<Toast[]>([])

  const addToast = React.useCallback((toast: Omit<Toast, 'id'>) => {
    const id = `toast-${++toastCounter}`
    const duration = toast.duration ?? 4000
    setToasts(prev => [...prev, { ...toast, id }])
    if (duration > 0) {
      setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), duration)
    }
  }, [])

  const removeToast = React.useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id))
  }, [])

  return (
    <ToastContext.Provider value={{ toasts, addToast, removeToast }}>
      {children}
      <ToastContainer toasts={toasts} onRemove={removeToast} />
    </ToastContext.Provider>
  )
}

// ---- Container ----
function ToastContainer({ toasts, onRemove }: { toasts: Toast[]; onRemove: (id: string) => void }) {
  if (toasts.length === 0) return null
  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm">
      {toasts.map(toast => (
        <ToastItem key={toast.id} toast={toast} onRemove={onRemove} />
      ))}
    </div>
  )
}

// ---- Single Toast ----
const TYPE_CONFIG: Record<ToastType, { icon: React.ReactNode; border: string; iconColor: string }> = {
  success: {
    icon: <CheckCircle2 size={18} />,
    border: 'border-l-[var(--color-success)]',
    iconColor: 'text-[var(--color-success)]',
  },
  error: {
    icon: <XCircle size={18} />,
    border: 'border-l-[var(--color-danger)]',
    iconColor: 'text-[var(--color-danger)]',
  },
  warning: {
    icon: <AlertTriangle size={18} />,
    border: 'border-l-[var(--color-warning)]',
    iconColor: 'text-[var(--color-warning)]',
  },
  info: {
    icon: <Info size={18} />,
    border: 'border-l-[var(--color-info)]',
    iconColor: 'text-[var(--color-info)]',
  },
}

function ToastItem({ toast, onRemove }: { toast: Toast; onRemove: (id: string) => void }) {
  const cfg = TYPE_CONFIG[toast.type]
  return (
    <div className={cn(
      'flex items-start gap-3 px-4 py-3 rounded-[var(--radius-md)] border-l-4',
      'bg-[var(--bg-elevated)] border-[var(--color-border-dim)] shadow-[var(--shadow-elevated)]',
      'animate-in slide-in-from-right',
      cfg.border
    )}>
      <div className={cn('mt-0.5 shrink-0', cfg.iconColor)}>{cfg.icon}</div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-[var(--color-text-primary)]">{toast.title}</p>
        {toast.description && <p className="text-xs text-[var(--color-text-muted)] mt-0.5">{toast.description}</p>}
      </div>
      <button onClick={() => onRemove(toast.id)} className="shrink-0 text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-colors cursor-pointer">
        <X size={14} />
      </button>
    </div>
  )
}
