'use client'

import * as React from 'react'
import { cn } from '@/lib/utils'
import { X, Check, Loader2, AlertCircle } from 'lucide-react'
import type { ImageOption } from '../types'
import { getPlaceholderImage } from '../mock-data'

export interface ChooseImageDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  options: ImageOption[]
  onImageSelect?: (id: string) => void
  onConfirm?: (id: string) => void
  title?: string
  className?: string
}

/** Media query subscription via useSyncExternalStore */
function subscribeMediaQuery(query: string, callback: () => void) {
  const mql = window.matchMedia(query)
  mql.addEventListener('change', callback)
  return () => mql.removeEventListener('change', callback)
}

function useMediaQuery(query: string): boolean {
  const getSnapshot = React.useCallback(() => window.matchMedia(query).matches, [query])
  const getServerSnapshot = React.useCallback(() => false, [])
  const subscribe = React.useCallback(
    (callback: () => void) => subscribeMediaQuery(query, callback),
    [query]
  )
  return React.useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}

function usePrefersReducedMotion(): boolean {
  return useMediaQuery('(prefers-reduced-motion: reduce)')
}

/**
 * Film Atelier — Choose Image Dialog
 * 图片网格选择对话框
 * 独立实现，不依赖 confirm-dialog
 * 选中状态使用琥珀橙边框，不使用紫色发光
 */
const ChooseImageDialog = React.forwardRef<HTMLDivElement, ChooseImageDialogProps>(
  (
    {
      open,
      onOpenChange,
      options,
      onImageSelect,
      onConfirm,
      title = '选择图片',
      className,
    },
    forwardedRef,
  ) => {
    const prefersReduced = usePrefersReducedMotion()
    const dialogRef = React.useRef<HTMLDivElement>(null)
    const gridRef = React.useRef<HTMLDivElement>(null)
    const previousFocusRef = React.useRef<HTMLElement | null>(null)

    const [selectedId, setSelectedId] = React.useState<string | null>(null)
    const [focusIndex, setFocusIndex] = React.useState(0)
    const [imageErrors, setImageErrors] = React.useState<Set<string>>(new Set())
    const [imageLoaded, setImageLoaded] = React.useState<Set<string>>(new Set())

    // Track dialog open state and initialize selection
    React.useEffect(() => {
      if (open) {
        const preselected = options.find((o) => o.selected)
        // Use microtask to avoid synchronous setState in effect
        queueMicrotask(() => {
          setSelectedId(preselected?.id ?? null)
          setFocusIndex(0)
          setImageErrors(new Set())
          setImageLoaded(new Set())
        })
        // Store previously focused element for restoration
        previousFocusRef.current = document.activeElement as HTMLElement
      }
    }, [open, options])

    // Restore focus on close
    React.useEffect(() => {
      if (!open && previousFocusRef.current) {
        previousFocusRef.current.focus()
        previousFocusRef.current = null
      }
    }, [open])

    // Body scroll lock
    React.useEffect(() => {
      if (open) {
        document.body.style.overflow = 'hidden'
      } else {
        document.body.style.overflow = ''
      }
      return () => { document.body.style.overflow = '' }
    }, [open])

    // Focus trap + keyboard handling
    React.useEffect(() => {
      if (!open) return

      // Focus the dialog on open
      const timer = setTimeout(() => {
        dialogRef.current?.focus()
      }, 0)

      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          e.preventDefault()
          onOpenChange(false)
          return
        }

        // Focus trap
        if (e.key === 'Tab' && dialogRef.current) {
          const focusable = dialogRef.current.querySelectorAll<HTMLElement>(
            'button, [tabindex]:not([tabindex="-1"])',
          )
          if (focusable.length === 0) return
          const first = focusable[0]
          const last = focusable[focusable.length - 1]

          if (e.shiftKey && document.activeElement === first) {
            e.preventDefault()
            last.focus()
          } else if (!e.shiftKey && document.activeElement === last) {
            e.preventDefault()
            first.focus()
          }
        }
      }

      document.addEventListener('keydown', handleKeyDown)
      return () => {
        clearTimeout(timer)
        document.removeEventListener('keydown', handleKeyDown)
      }
    }, [open, onOpenChange])

    const handleSelect = React.useCallback(
      (id: string) => {
        setSelectedId(id)
        onImageSelect?.(id)
      },
      [onImageSelect],
    )

    const handleDoubleClick = React.useCallback(
      (id: string) => {
        setSelectedId(id)
        onConfirm?.(id)
        onOpenChange(false)
      },
      [onConfirm, onOpenChange],
    )

    const handleConfirm = React.useCallback(() => {
      if (selectedId) {
        onConfirm?.(selectedId)
      }
      onOpenChange(false)
    }, [selectedId, onConfirm, onOpenChange])

    const handleCancel = React.useCallback(() => {
      onOpenChange(false)
    }, [onOpenChange])

    const handleImageError = React.useCallback((id: string) => {
      setImageErrors((prev) => new Set(prev).add(id))
    }, [])

    const handleImageLoad = React.useCallback((id: string) => {
      setImageLoaded((prev) => new Set(prev).add(id))
    }, [])

    // Grid keyboard navigation
    const handleGridKeyDown = React.useCallback(
      (e: React.KeyboardEvent) => {
        const cols = 3
        if (e.key === 'ArrowRight') {
          e.preventDefault()
          setFocusIndex((i) => Math.min(options.length - 1, i + 1))
        } else if (e.key === 'ArrowLeft') {
          e.preventDefault()
          setFocusIndex((i) => Math.max(0, i - 1))
        } else if (e.key === 'ArrowDown') {
          e.preventDefault()
          setFocusIndex((i) => Math.min(options.length - 1, i + cols))
        } else if (e.key === 'ArrowUp') {
          e.preventDefault()
          setFocusIndex((i) => Math.max(0, i - cols))
        } else if (e.key === 'Enter') {
          e.preventDefault()
          const option = options[focusIndex]
          if (option) {
            handleSelect(option.id)
          }
        } else if (e.key === ' ' && !e.repeat) {
          e.preventDefault()
          const option = options[focusIndex]
          if (option) {
            handleSelect(option.id)
          }
        }
      },
      [options, focusIndex, handleSelect],
    )

    // Programmatically focus the current focus index item
    React.useEffect(() => {
      if (!open || !gridRef.current) return
      const items = gridRef.current.querySelectorAll<HTMLElement>('[role="option"]')
      const target = items[focusIndex]
      if (target) target.focus()
    }, [focusIndex, open])

    // Responsive columns: 2 on mobile, 3 on desktop
    const gridCols = 'grid-cols-2 md:grid-cols-3'

    if (!open) return null

    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="presentation">
        {/* Backdrop */}
        <div
          className="absolute inset-0 bg-black/60 backdrop-blur-sm"
          onClick={handleCancel}
          aria-hidden="true"
        />

        {/* Dialog */}
        <div
          ref={(node) => {
            (dialogRef as React.MutableRefObject<HTMLDivElement | null>).current = node
            if (typeof forwardedRef === 'function') forwardedRef(node)
            else if (forwardedRef) (forwardedRef as React.MutableRefObject<HTMLDivElement | null>).current = node
          }}
          className={cn(
            'relative z-10 flex w-full max-w-2xl flex-col max-h-[85vh]',
            'rounded-lg border border-[var(--border-default)] bg-[var(--bg-card)]',
            'shadow-[var(--shadow-elevated)]',
            className,
          )}
          role="dialog"
          aria-modal="true"
          aria-label={title}
          tabIndex={-1}
        >
          {/* ---- Header ---- */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border-subtle)]">
            <h2 className="text-base font-semibold text-[var(--text-primary)]">{title}</h2>
            <button
              type="button"
              onClick={handleCancel}
              className={cn(
                'rounded p-1.5 text-[var(--text-tertiary)] cursor-pointer',
                'hover:text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]',
                'transition-colors duration-150',
                'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent-primary)]/50',
              )}
              aria-label="关闭"
            >
              <X size={18} />
            </button>
          </div>

          {/* ---- Image grid ---- */}
          <div ref={gridRef} className="flex-1 overflow-y-auto p-4" onKeyDown={handleGridKeyDown}>
            <div className={cn('grid gap-3', gridCols)} role="listbox" aria-label="图片选项">
              {options.map((option, index) => {
                const isSelected = selectedId === option.id
                const isFocused = index === focusIndex
                const hasError = imageErrors.has(option.id)
                const isLoaded = imageLoaded.has(option.id)
                const imgSrc = option.url || getPlaceholderImage(300, 200, option.label)

                return (
                  <div
                    key={option.id}
                    role="option"
                    aria-selected={isSelected}
                    tabIndex={isFocused ? 0 : -1}
                    className={cn(
                      'relative overflow-hidden rounded-lg cursor-pointer',
                      'border-2 outline-none',
                      !prefersReduced && 'transition-all duration-200',
                      isSelected
                        ? 'border-[var(--accent-primary)] shadow-[0_0_0_1px_var(--accent-border)]'
                        : 'border-transparent hover:border-[var(--border-default)]',
                      isFocused && !isSelected && 'ring-2 ring-[var(--focus-ring)]',
                      isFocused && isSelected && 'ring-2 ring-[var(--focus-ring)]',
                    )}
                    onClick={() => handleSelect(option.id)}
                    onDoubleClick={() => handleDoubleClick(option.id)}
                    onFocus={() => setFocusIndex(index)}
                  >
                    {/* Image container */}
                    <div className="relative aspect-[3/2] bg-[var(--media-placeholder)]">
                      {!hasError ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={imgSrc}
                          alt={option.label}
                          className="h-full w-full object-cover"
                          loading="lazy"
                          onLoad={() => handleImageLoad(option.id)}
                          onError={() => handleImageError(option.id)}
                          draggable={false}
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center">
                          <AlertCircle size={24} className="text-[var(--status-error)]" />
                        </div>
                      )}

                      {/* Loading state */}
                      {!isLoaded && !hasError && (
                        <div className="absolute inset-0 flex items-center justify-center bg-[var(--media-scrim)]">
                          <Loader2 size={20} className="animate-spin text-[var(--text-tertiary)]" />
                        </div>
                      )}

                      {/* Selected indicator (amber, not purple) */}
                      {isSelected && (
                        <div className="absolute top-2 right-2 flex h-5 w-5 items-center justify-center rounded-full bg-[var(--accent-primary)]">
                          <Check size={12} className="text-[var(--text-inverse)]" />
                        </div>
                      )}

                      {/* Info overlay at bottom */}
                      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent px-2 py-1.5">
                        <div className="truncate text-[11px] font-medium text-white">
                          {option.label}
                        </div>
                        <div className="flex items-center gap-1 text-[10px] text-white/60">
                          {option.version && <span>{option.version}</span>}
                          {option.modelName && (
                            <>
                              <span>&middot;</span>
                              <span className="truncate">{option.modelName}</span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Created time below image */}
                    {option.createdAt && (
                      <div className="px-2 py-1 text-[10px] text-[var(--text-tertiary)]">
                        {option.createdAt}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>

            {/* Empty state */}
            {options.length === 0 && (
              <div className="flex flex-col items-center justify-center py-12 text-[var(--text-tertiary)]">
                <AlertCircle size={32} className="mb-2" />
                <p className="text-sm">暂无可选图片</p>
              </div>
            )}
          </div>

          {/* ---- Footer ---- */}
          <div className="flex items-center justify-end gap-3 px-5 py-4 border-t border-[var(--border-subtle)]">
            <button
              type="button"
              onClick={handleCancel}
              className={cn(
                'h-9 rounded-lg px-4 text-sm cursor-pointer',
                'border border-[var(--border-default)] bg-[var(--bg-elevated)] text-[var(--text-secondary)]',
                'hover:bg-[var(--bg-hover)] hover:border-[var(--border-strong)]',
                'transition-colors duration-150',
                'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent-primary)]/50',
              )}
            >
              取消
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              disabled={!selectedId}
              className={cn(
                'h-9 rounded-lg px-4 text-sm font-medium cursor-pointer',
                'text-[var(--text-inverse)]',
                'transition-all duration-200',
                !prefersReduced && 'active:scale-[0.97]',
                'disabled:opacity-40 disabled:cursor-not-allowed',
                'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent-primary)]/50',
              )}
              style={{ background: 'var(--gradient-brand)' }}
            >
              确认选择
            </button>
          </div>
        </div>
      </div>
    )
  },
)
ChooseImageDialog.displayName = 'ChooseImageDialog'

export { ChooseImageDialog }
