'use client'

import * as React from 'react'
import {
  Send,
  StopCircle,
  ChevronDown,
  Paperclip,
  Image as ImageIcon,
  Loader2,
  ChevronUp,
  X,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type { GenerationState } from '../types'
import { generationStateLabels } from '../mock-data'

// ---- Prompt 类型选项 ----
const PROMPT_TYPES = [
  { id: 'character', label: '角色' },
  { id: 'scene', label: '场景' },
  { id: 'storyboard', label: '分镜' },
  { id: 'image', label: '图片' },
  { id: 'video', label: '视频' },
] as const

// ---- 宽高比选项 ----
const ASPECT_RATIOS = [
  { id: '1:1', label: '1:1' },
  { id: '9:16', label: '9:16' },
  { id: '16:9', label: '16:9' },
  { id: '4:3', label: '4:3' },
] as const

// ---- 内部模板/模型选项（仅 UI 展示，真实数据由外部传入） ----
const DEFAULT_TEMPLATES = [
  { id: '', name: '不使用模板' },
  { id: 'tpl-1', name: '角色正面半身' },
  { id: 'tpl-2', name: '角色全身像' },
  { id: 'tpl-3', name: '场景氛围图' },
  { id: 'tpl-4', name: '分镜特写' },
]

const DEFAULT_MODELS = [
  { id: 'agnes-image', name: 'Agnes-Image-V2.0' },
  { id: 'ark-image', name: '豆包-Seedream-5.0' },
  { id: 'agnes-video', name: 'Agnes-Video-V2.0' },
  { id: 'ark-video', name: '豆包-Seedance-1.5-Pro' },
]

export interface AIPromptBoxProps {
  promptType?: string
  onPromptTypeChange?: (type: string) => void
  templateId?: string
  onTemplateChange?: (id: string) => void
  modelId?: string
  onModelChange?: (id: string) => void
  promptValue?: string
  onPromptChange?: (value: string) => void
  generationState?: GenerationState
  onSubmit?: (prompt: string) => void
  onCancel?: () => void
  className?: string
}

const isGenerating = (state: GenerationState): boolean =>
  state === 'submitting' || state === 'queued' || state === 'running'

const AIPromptBox = React.forwardRef<HTMLDivElement, AIPromptBoxProps>(
  (
    {
      promptType = 'character',
      onPromptTypeChange,
      templateId = '',
      onTemplateChange,
      modelId = '',
      onModelChange,
      promptValue = '',
      onPromptChange,
      generationState = 'idle',
      onSubmit,
      onCancel,
      className,
    },
    ref
  ) => {
    // ---- 内部状态 ----
    const [internalPrompt, setInternalPrompt] = React.useState('')
    const prompt = promptValue ?? internalPrompt
    const handlePromptChange = onPromptChange ?? setInternalPrompt

    const [aspectRatio, setAspectRatio] = React.useState('9:16')
    const [styleStrength, setStyleStrength] = React.useState(7)
    const [advancedOpen, setAdvancedOpen] = React.useState(false)
    const [attachedFiles, setAttachedFiles] = React.useState<string[]>([])
    const [isDragOver, setIsDragOver] = React.useState(false)

    const textareaRef = React.useRef<HTMLTextAreaElement>(null)
    const fileInputRef = React.useRef<HTMLInputElement>(null)

    const generating = isGenerating(generationState)

    // ---- Auto-expand textarea ----
    const adjustTextareaHeight = React.useCallback(() => {
      const el = textareaRef.current
      if (el) {
        el.style.height = 'auto'
        el.style.height = `${Math.min(el.scrollHeight, 240)}px`
      }
    }, [])

    React.useEffect(() => {
      adjustTextareaHeight()
    }, [prompt, adjustTextareaHeight])

    // ---- Keyboard shortcut: Cmd/Ctrl+Enter ----
    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault()
        handleSubmit()
      }
    }

    // ---- Submit ----
    const handleSubmit = () => {
      if (!prompt.trim() || generating) return
      onSubmit?.(prompt.trim())
    }

    // ---- File attachment (visual only) ----
    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files
      if (!files) return
      const names = Array.from(files).map((f) => f.name)
      setAttachedFiles((prev) => [...prev, ...names])
      e.target.value = ''
    }

    const handleRemoveFile = (index: number) => {
      setAttachedFiles((prev) => prev.filter((_, i) => i !== index))
    }

    const handleDragOver = (e: React.DragEvent) => {
      e.preventDefault()
      setIsDragOver(true)
    }

    const handleDragLeave = (e: React.DragEvent) => {
      e.preventDefault()
      setIsDragOver(false)
    }

    const handleDrop = (e: React.DragEvent) => {
      e.preventDefault()
      setIsDragOver(false)
      const files = e.dataTransfer.files
      if (!files) return
      const names = Array.from(files).map((f) => f.name)
      setAttachedFiles((prev) => [...prev, ...names])
    }

    // ---- Status indicator color ----
    const statusColor: Record<GenerationState, string> = {
      idle: 'text-[var(--text-tertiary)]',
      submitting: 'text-[var(--status-generating)]',
      queued: 'text-[var(--status-generating)]',
      running: 'text-[var(--status-generating)]',
      success: 'text-[var(--status-success)]',
      error: 'text-[var(--status-error)]',
      cancelled: 'text-[var(--text-tertiary)]',
    }

    const statusDotColor: Record<GenerationState, string> = {
      idle: 'bg-[var(--text-tertiary)]',
      submitting: 'bg-[var(--status-generating)]',
      queued: 'bg-[var(--status-generating)]',
      running: 'bg-[var(--status-generating)] fa-animate-generating',
      success: 'bg-[var(--status-success)]',
      error: 'bg-[var(--status-error)]',
      cancelled: 'bg-[var(--text-tertiary)]',
    }

    return (
      <div
        ref={ref}
        className={cn(
          'flex flex-col gap-4 rounded-[var(--radius-lg)] bg-[var(--bg-card)] p-4',
          'border border-[var(--border-subtle)]',
          className
        )}
      >
        {/* ---- 顶部行：Prompt 类型 + 模板 + 模型 ---- */}
        <div className="flex items-center gap-3 flex-wrap">
          {/* Prompt 类型选择器 */}
          <div className="flex items-center rounded-[var(--radius-md)] bg-[var(--bg-input)] border border-[var(--border-subtle)] p-0.5 gap-0.5">
            {PROMPT_TYPES.map((type) => (
              <button
                key={type.id}
                type="button"
                onClick={() => onPromptTypeChange?.(type.id)}
                className={cn(
                  'px-2.5 py-1 text-xs rounded-[calc(var(--radius-md)-2px)] transition-colors duration-150 cursor-pointer',
                  promptType === type.id
                    ? 'bg-[var(--accent-soft)] text-[var(--accent-primary)] font-medium'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)]'
                )}
              >
                {type.label}
              </button>
            ))}
          </div>

          {/* 模板选择器 */}
          <div className="relative">
            <select
              value={templateId}
              onChange={(e) => onTemplateChange?.(e.target.value)}
              className={cn(
                'appearance-none h-7 pl-2.5 pr-7 text-xs rounded-[var(--radius-md)]',
                'bg-[var(--bg-input)] border border-[var(--border-subtle)] text-[var(--text-secondary)]',
                'hover:border-[var(--border-default)] hover:text-[var(--text-primary)]',
                'focus:outline-none focus:ring-2 focus:ring-[var(--focus-ring)] focus:border-transparent',
                'transition-colors duration-150 cursor-pointer'
              )}
            >
              {DEFAULT_TEMPLATES.map((tpl) => (
                <option key={tpl.id} value={tpl.id}>
                  {tpl.name}
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 h-3 w-3 text-[var(--text-tertiary)]" />
          </div>

          {/* 模型选择器 */}
          <div className="relative">
            <select
              value={modelId}
              onChange={(e) => onModelChange?.(e.target.value)}
              className={cn(
                'appearance-none h-7 pl-2.5 pr-7 text-xs rounded-[var(--radius-md)]',
                'bg-[var(--bg-input)] border border-[var(--border-subtle)] text-[var(--text-secondary)]',
                'hover:border-[var(--border-default)] hover:text-[var(--text-primary)]',
                'focus:outline-none focus:ring-2 focus:ring-[var(--focus-ring)] focus:border-transparent',
                'transition-colors duration-150 cursor-pointer'
              )}
            >
              {DEFAULT_MODELS.map((model) => (
                <option key={model.id} value={model.id}>
                  {model.name}
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 h-3 w-3 text-[var(--text-tertiary)]" />
          </div>
        </div>

        {/* ---- Prompt 输入区 ---- */}
        <div
          className={cn(
            'relative rounded-[var(--radius-md)] border transition-colors duration-150',
            isDragOver
              ? 'border-[var(--accent-primary)] bg-[var(--accent-soft)]'
              : 'border-[var(--border-default)] bg-[var(--bg-input)]'
          )}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          <textarea
            ref={textareaRef}
            value={prompt}
            onChange={(e) => handlePromptChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="输入创作描述，Ctrl/Cmd+Enter 快速提交..."
            rows={3}
            disabled={generating}
            className={cn(
              'w-full resize-none bg-transparent px-3 py-2.5 text-sm leading-relaxed',
              'text-[var(--text-primary)] placeholder:text-[var(--text-disabled)]',
              'focus:outline-none focus:ring-2 focus:ring-[var(--focus-ring)] focus:ring-inset',
              'disabled:opacity-50 disabled:cursor-not-allowed',
              'scrollbar-thin'
            )}
          />

          {/* 拖拽提示 */}
          {isDragOver && (
            <div className="absolute inset-0 flex items-center justify-center rounded-[var(--radius-md)] bg-[var(--accent-soft)] pointer-events-none">
              <div className="flex items-center gap-2 text-sm text-[var(--accent-primary)]">
                <ImageIcon className="h-4 w-4" />
                释放以添加参考图
              </div>
            </div>
          )}
        </div>

        {/* ---- 已附加文件 ---- */}
        {attachedFiles.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {attachedFiles.map((name, index) => (
              <span
                key={`${name}-${index}`}
                className="inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-[var(--radius-sm)] bg-[var(--accent-soft)] text-[var(--accent-primary)]"
              >
                <ImageIcon className="h-3 w-3" />
                <span className="max-w-[120px] truncate">{name}</span>
                <button
                  type="button"
                  onClick={() => handleRemoveFile(index)}
                  className="ml-0.5 hover:text-[var(--accent-hover)] transition-colors cursor-pointer"
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
          </div>
        )}

        {/* ---- 操作行：附件 + 宽高比 + 风格强度 + 高级 ---- */}
        <div className="flex items-center gap-3 flex-wrap">
          {/* 附件按钮 */}
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className={cn(
              'inline-flex items-center gap-1.5 h-7 px-2 text-xs rounded-[var(--radius-md)]',
              'text-[var(--text-secondary)] hover:text-[var(--text-primary)]',
              'bg-[var(--bg-input)] border border-[var(--border-subtle)]',
              'hover:border-[var(--border-default)] transition-colors duration-150 cursor-pointer'
            )}
          >
            <Paperclip className="h-3.5 w-3.5" />
            参考图
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            onChange={handleFileSelect}
            className="hidden"
          />

          {/* 宽高比选择 */}
          <div className="flex items-center gap-1">
            <span className="text-[10px] text-[var(--text-tertiary)] mr-1">比例</span>
            {ASPECT_RATIOS.map((ratio) => (
              <button
                key={ratio.id}
                type="button"
                onClick={() => setAspectRatio(ratio.id)}
                className={cn(
                  'h-6 min-w-[32px] px-1.5 text-[10px] rounded-[var(--radius-sm)] transition-colors duration-150 cursor-pointer',
                  aspectRatio === ratio.id
                    ? 'bg-[var(--accent-soft)] text-[var(--accent-primary)] font-medium'
                    : 'text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]'
                )}
              >
                {ratio.label}
              </button>
            ))}
          </div>

          {/* 风格强度 */}
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] text-[var(--text-tertiary)]">风格</span>
            <input
              type="range"
              min={1}
              max={10}
              value={styleStrength}
              onChange={(e) => setStyleStrength(Number(e.target.value))}
              className="h-1 w-16 appearance-none bg-[var(--border-default)] rounded-full cursor-pointer
                [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:w-3
                [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-[var(--accent-primary)]
                [&::-webkit-slider-thumb]:shadow-[var(--glow-accent)]"
            />
            <span className="text-[10px] text-[var(--accent-primary)] tabular-nums w-4 text-right">
              {styleStrength}
            </span>
          </div>

          {/* 高级参数折叠 */}
          <button
            type="button"
            onClick={() => setAdvancedOpen((prev) => !prev)}
            className={cn(
              'inline-flex items-center gap-1 h-7 px-2 text-xs rounded-[var(--radius-md)]',
              'text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]',
              'hover:bg-[var(--bg-hover)] transition-colors duration-150 cursor-pointer ml-auto'
            )}
          >
            高级参数
            {advancedOpen ? (
              <ChevronUp className="h-3 w-3" />
            ) : (
              <ChevronDown className="h-3 w-3" />
            )}
          </button>
        </div>

        {/* ---- 高级参数折叠区 ---- */}
        {advancedOpen && (
          <div className="grid grid-cols-2 gap-3 p-3 rounded-[var(--radius-md)] bg-[var(--bg-input)] border border-[var(--border-subtle)]">
            {/* 种子值 */}
            <label className="flex flex-col gap-1">
              <span className="text-[10px] text-[var(--text-tertiary)]">种子值 (Seed)</span>
              <input
                type="number"
                placeholder="随机"
                className={cn(
                  'h-7 px-2 text-xs rounded-[var(--radius-sm)]',
                  'bg-[var(--bg-card)] border border-[var(--border-subtle)] text-[var(--text-primary)]',
                  'placeholder:text-[var(--text-disabled)]',
                  'focus:outline-none focus:ring-2 focus:ring-[var(--focus-ring)] focus:border-transparent',
                  'transition-colors duration-150'
                )}
              />
            </label>
            {/* 步数 */}
            <label className="flex flex-col gap-1">
              <span className="text-[10px] text-[var(--text-tertiary)]">推理步数</span>
              <input
                type="number"
                placeholder="30"
                className={cn(
                  'h-7 px-2 text-xs rounded-[var(--radius-sm)]',
                  'bg-[var(--bg-card)] border border-[var(--border-subtle)] text-[var(--text-primary)]',
                  'placeholder:text-[var(--text-disabled)]',
                  'focus:outline-none focus:ring-2 focus:ring-[var(--focus-ring)] focus:border-transparent',
                  'transition-colors duration-150'
                )}
              />
            </label>
            {/* 引导系数 */}
            <label className="flex flex-col gap-1">
              <span className="text-[10px] text-[var(--text-tertiary)]">引导系数 (CFG)</span>
              <input
                type="number"
                step={0.5}
                placeholder="7.5"
                className={cn(
                  'h-7 px-2 text-xs rounded-[var(--radius-sm)]',
                  'bg-[var(--bg-card)] border border-[var(--border-subtle)] text-[var(--text-primary)]',
                  'placeholder:text-[var(--text-disabled)]',
                  'focus:outline-none focus:ring-2 focus:ring-[var(--focus-ring)] focus:border-transparent',
                  'transition-colors duration-150'
                )}
              />
            </label>
            {/* 负向提示 */}
            <label className="flex flex-col gap-1">
              <span className="text-[10px] text-[var(--text-tertiary)]">负向提示</span>
              <input
                type="text"
                placeholder="低质量, 模糊, 变形"
                className={cn(
                  'h-7 px-2 text-xs rounded-[var(--radius-sm)]',
                  'bg-[var(--bg-card)] border border-[var(--border-subtle)] text-[var(--text-primary)]',
                  'placeholder:text-[var(--text-disabled)]',
                  'focus:outline-none focus:ring-2 focus:ring-[var(--focus-ring)] focus:border-transparent',
                  'transition-colors duration-150'
                )}
              />
            </label>
          </div>
        )}

        {/* ---- 底部行：状态 + 按钮 ---- */}
        <div className="flex items-center gap-3">
          {/* 状态指示器 */}
          <div className="flex items-center gap-2 min-w-0">
            <span
              className={cn(
                'inline-block h-1.5 w-1.5 rounded-full shrink-0',
                statusDotColor[generationState]
              )}
            />
            <span className={cn('text-xs truncate', statusColor[generationState])}>
              {generationStateLabels[generationState]}
            </span>
          </div>

          <div className="flex items-center gap-2 ml-auto">
            {/* 生成中：停止按钮 */}
            {generating && (
              <button
                type="button"
                onClick={onCancel}
                className={cn(
                  'inline-flex items-center gap-1.5 h-8 px-3 text-xs rounded-[var(--radius-md)]',
                  'text-[var(--status-error)] bg-[var(--error-soft)] border border-transparent',
                  'hover:border-[var(--status-error)] transition-colors duration-150 cursor-pointer'
                )}
              >
                <StopCircle className="h-3.5 w-3.5" />
                停止
              </button>
            )}

            {/* 生成中：旋转 Loader */}
            {generating && (
              <div className="flex items-center gap-1.5 text-xs text-[var(--status-generating)]">
                <Loader2 className="h-4 w-4 fa-animate-spin-slow" />
              </div>
            )}

            {/* 主按钮 */}
            {!generating && (
              <button
                type="button"
                onClick={handleSubmit}
                disabled={!prompt.trim()}
                className={cn(
                  'inline-flex items-center gap-1.5 h-8 px-4 text-xs font-medium rounded-[var(--radius-md)]',
                  'text-[var(--text-inverse)] transition-all duration-200 cursor-pointer',
                  'disabled:opacity-40 disabled:cursor-not-allowed',
                  'active:scale-[0.97]'
                )}
                style={{ background: 'var(--gradient-brand)' }}
              >
                <Send className="h-3.5 w-3.5" />
                开始生成
              </button>
            )}
          </div>
        </div>
      </div>
    )
  }
)
AIPromptBox.displayName = 'AIPromptBox'

export { AIPromptBox }
