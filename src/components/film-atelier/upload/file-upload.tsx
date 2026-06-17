'use client'

import * as React from 'react'
import { cn } from '@/lib/utils'
import {
  Upload,
  FileText,
  Image,
  Film,
  Music,
  File,
  X,
  RotateCw,
  Check,
  AlertCircle,
  Loader2,
} from 'lucide-react'
import type { UploadFile, UploadState } from '@/components/film-atelier/types'

// ---- File size formatting ----

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
}

// ---- File type icon mapping ----

function getFileIcon(mimeType: string) {
  if (mimeType.startsWith('text/')) return FileText
  if (mimeType.startsWith('image/')) return Image
  if (mimeType.startsWith('video/')) return Film
  if (mimeType.startsWith('audio/')) return Music
  return File
}

// ---- Status config ----

const STATUS_TEXT: Record<UploadState, string> = {
  idle: '',
  validating: '校验中',
  uploading: '上传中',
  uploaded: '上传完成',
  parsing: '解析中',
  parsed: '解析完成',
  error: '上传失败',
}

const STATUS_TEXT_COLOR: Record<UploadState, string> = {
  idle: 'text-[var(--text-tertiary)]',
  validating: 'text-[var(--text-secondary)]',
  uploading: 'text-[var(--accent-primary)]',
  uploaded: 'text-[var(--status-success)]',
  parsing: 'text-[var(--text-secondary)]',
  parsed: 'text-[var(--status-success)]',
  error: 'text-[var(--status-error)]',
}

const DEFAULT_ACCEPT = '.txt,.md,.pdf,.doc,.docx,.png,.jpg,.jpeg,.gif,.webp,.mp4,.mov,.avi,.mp3,.wav,.ogg'

// ---- Props ----

export interface FileUploadProps extends React.HTMLAttributes<HTMLDivElement> {
  files?: UploadFile[]
  onUpload?: (files: File[]) => void
  onDelete?: (id: string) => void
  onRetry?: (id: string) => void
  accept?: string
  maxSize?: number
}

// ---- Drop zone ----

interface DropZoneProps {
  accept?: string
  onFilesSelected: (files: FileList) => void
  isDragOver: boolean
  onDragOver: (e: React.DragEvent) => void
  onDragLeave: (e: React.DragEvent) => void
  onDrop: (e: React.DragEvent) => void
}

function DropZone({
  accept,
  onFilesSelected,
  isDragOver,
  onDragOver,
  onDragLeave,
  onDrop,
}: DropZoneProps) {
  const inputRef = React.useRef<HTMLInputElement>(null)

  const handleClick = () => {
    inputRef.current?.click()
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      inputRef.current?.click()
    }
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      onFilesSelected(e.target.files)
      // Reset input so re-selecting the same file triggers change
      e.target.value = ''
    }
  }

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label="拖拽文件到此处，或点击选择"
      className={cn(
        'flex flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed px-6 py-10 transition-colors cursor-pointer',
        'outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-primary)]/50 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg-card)]',
        isDragOver
          ? 'border-[var(--accent-primary)] bg-[var(--accent-soft)]'
          : 'border-[var(--border-default)] bg-[var(--bg-input)] hover:border-[var(--border-strong)] hover:bg-[var(--bg-hover)]',
      )}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      <Upload
        size={28}
        className={cn(
          'transition-colors',
          isDragOver ? 'text-[var(--accent-primary)]' : 'text-[var(--text-tertiary)]',
        )}
      />
      <p
        className={cn(
          'text-sm transition-colors',
          isDragOver ? 'text-[var(--accent-primary)]' : 'text-[var(--text-secondary)]',
        )}
      >
        拖拽文件到此处，或点击选择
      </p>
      <p className="text-xs text-[var(--text-tertiary)]">
        支持文本、图片、视频、音频文件
      </p>
      <input
        ref={inputRef}
        type="file"
        className="hidden"
        accept={accept}
        multiple
        onChange={handleChange}
        aria-hidden="true"
        tabIndex={-1}
      />
    </div>
  )
}

// ---- Progress bar ----

function ProgressBar({ progress }: { progress?: number }) {
  const clamped = Math.max(0, Math.min(100, progress ?? 0))

  return (
    <div className="h-1 w-full rounded-full bg-[var(--border-subtle)] overflow-hidden">
      <div
        className="h-full rounded-full bg-[var(--accent-primary)] transition-all duration-300 ease-out"
        style={{ width: `${clamped}%` }}
      />
    </div>
  )
}

// ---- File item ----

interface FileItemProps {
  file: UploadFile
  onDelete?: (id: string) => void
  onRetry?: (id: string) => void
}

function FileItem({ file, onDelete, onRetry }: FileItemProps) {
  const handleDelete = () => {
    onDelete?.(file.id)
  }

  const handleRetry = () => {
    onRetry?.(file.id)
  }

  const FileIcon = getFileIcon(file.type)

  return (
    <div className="flex items-start gap-3 rounded-md bg-[var(--bg-input)] px-3 py-2.5 transition-colors hover:bg-[var(--bg-hover)]">
      {/* File icon */}
      {React.createElement(FileIcon, { size: 18, className: 'mt-0.5 shrink-0 text-[var(--text-tertiary)]' })}

      {/* File info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          {/* File name */}
          <span
            className="truncate text-sm text-[var(--text-primary)]"
            title={file.name}
          >
            {file.name}
          </span>

          {/* Actions */}
          <div className="flex items-center gap-1 shrink-0">
            {file.status === 'error' && onRetry && (
              <button
                type="button"
                onClick={handleRetry}
                className="rounded p-0.5 text-[var(--text-tertiary)] transition-colors hover:text-[var(--accent-primary)] hover:bg-[var(--accent-soft)]"
                aria-label="重试上传"
              >
                <RotateCw size={14} />
              </button>
            )}
            {onDelete && (
              <button
                type="button"
                onClick={handleDelete}
                className="rounded p-0.5 text-[var(--text-tertiary)] transition-colors hover:text-[var(--status-error)] hover:bg-[var(--error-soft)]"
                aria-label="删除文件"
              >
                <X size={14} />
              </button>
            )}
          </div>
        </div>

        {/* Size + status row */}
        <div className="flex items-center gap-2 mt-1">
          <span className="text-xs text-[var(--text-tertiary)]">
            {formatFileSize(file.size)}
          </span>

          {/* Status indicator */}
          {file.status !== 'idle' && (
            <span
              className={cn(
                'flex items-center gap-1 text-xs',
                STATUS_TEXT_COLOR[file.status],
              )}
            >
              {file.status === 'validating' && (
                <Loader2 size={12} className="animate-spin" />
              )}
              {file.status === 'uploading' && (
                <Loader2 size={12} className="animate-spin" />
              )}
              {file.status === 'uploaded' && <Check size={12} />}
              {file.status === 'parsing' && (
                <Loader2 size={12} className="animate-spin" />
              )}
              {file.status === 'parsed' && <Check size={12} />}
              {file.status === 'error' && <AlertCircle size={12} />}
              {STATUS_TEXT[file.status]}
            </span>
          )}

          {/* Upload progress percentage */}
          {file.status === 'uploading' && typeof file.progress === 'number' && (
            <span className="text-xs text-[var(--text-tertiary)]">
              {file.progress}%
            </span>
          )}
        </div>

        {/* Progress bar (uploading) */}
        {file.status === 'uploading' && (
          <div className="mt-1.5">
            <ProgressBar progress={file.progress} />
          </div>
        )}

        {/* Parse result */}
        {file.status === 'parsed' && file.parseResult && (
          <p className="mt-1 text-xs text-[var(--text-secondary)] truncate" title={file.parseResult}>
            {file.parseResult}
          </p>
        )}

        {/* Error message */}
        {file.status === 'error' && file.error && (
          <p className="mt-1 text-xs text-[var(--status-error)] truncate" title={file.error}>
            {file.error}
          </p>
        )}
      </div>
    </div>
  )
}

// ---- Add-more trigger (shown when files already exist) ----

interface AddMoreTriggerProps {
  accept?: string
  onFilesSelected: (files: FileList) => void
  onDragOver: (e: React.DragEvent) => void
  onDragLeave: (e: React.DragEvent) => void
  onDrop: (e: React.DragEvent) => void
}

function AddMoreTrigger({ accept, onFilesSelected, onDragOver, onDragLeave, onDrop }: AddMoreTriggerProps) {
  const inputRef = React.useRef<HTMLInputElement>(null)

  const handleClick = () => {
    inputRef.current?.click()
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      inputRef.current?.click()
    }
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      onFilesSelected(e.target.files)
      e.target.value = ''
    }
  }

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label="添加更多文件"
      className={cn(
        'flex items-center gap-2 rounded-md border border-dashed border-[var(--border-default)] px-3 py-2 cursor-pointer transition-colors',
        'text-xs text-[var(--text-tertiary)]',
        'hover:border-[var(--border-strong)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]',
        'outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-primary)]/50',
      )}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      <Upload size={14} />
      <span>添加更多文件</span>
      <input
        ref={inputRef}
        type="file"
        className="hidden"
        accept={accept}
        multiple
        onChange={handleChange}
        aria-hidden="true"
        tabIndex={-1}
      />
    </div>
  )
}

// ---- Main component ----

const FileUpload = React.forwardRef<HTMLDivElement, FileUploadProps>(
  (
    {
      files = [],
      onUpload,
      onDelete,
      onRetry,
      accept = DEFAULT_ACCEPT,
      maxSize,
      className,
      ...props
    },
    ref,
  ) => {
    const [isDragOver, setIsDragOver] = React.useState(false)

    const handleFilesSelected = React.useCallback(
      (fileList: FileList) => {
        if (!onUpload) return

        const selected = Array.from(fileList)

        // Filter by maxSize if specified
        const valid = maxSize
          ? selected.filter((f) => f.size <= maxSize)
          : selected

        if (valid.length > 0) {
          onUpload(valid)
        }
      },
      [onUpload, maxSize],
    )

    const handleDragOver = React.useCallback((e: React.DragEvent) => {
      e.preventDefault()
      e.stopPropagation()
      setIsDragOver(true)
    }, [])

    const handleDragLeave = React.useCallback((e: React.DragEvent) => {
      e.preventDefault()
      e.stopPropagation()
      // Only set false if leaving the drop zone itself
      const relatedTarget = e.relatedTarget as Node | null
      if (!e.currentTarget.contains(relatedTarget)) {
        setIsDragOver(false)
      }
    }, [])

    const handleDrop = React.useCallback(
      (e: React.DragEvent) => {
        e.preventDefault()
        e.stopPropagation()
        setIsDragOver(false)

        if (e.dataTransfer.files.length > 0) {
          handleFilesSelected(e.dataTransfer.files)
        }
      },
      [handleFilesSelected],
    )

    const hasFiles = files.length > 0

    return (
      <div
        ref={ref}
        className={cn('flex flex-col gap-3', className)}
        {...props}
      >
        {/* Drop zone — always visible when no files, or shown above file list */}
        {(!hasFiles || isDragOver) && (
          <DropZone
            accept={accept}
            onFilesSelected={handleFilesSelected}
            isDragOver={isDragOver}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          />
        )}

        {/* When files exist, show compact add-more trigger */}
        {hasFiles && !isDragOver && (
          <AddMoreTrigger accept={accept} onFilesSelected={handleFilesSelected} onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop} />
        )}

        {/* File list */}
        {hasFiles && (
          <div className="flex flex-col gap-2" role="list" aria-label="已选文件列表">
            {files.map((file) => (
              <div key={file.id} role="listitem">
                <FileItem file={file} onDelete={onDelete} onRetry={onRetry} />
              </div>
            ))}
          </div>
        )}
      </div>
    )
  },
)
FileUpload.displayName = 'FileUpload'

export { FileUpload }
