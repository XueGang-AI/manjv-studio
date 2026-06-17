/**
 * Film Atelier — 视觉实验页面
 * AI 漫剧电影工坊配色方案
 * 路由: /preview/film-atelier
 */
'use client'

import React, { useState } from 'react'
import {
  Clapperboard,
  Save,
  Eye,
  Settings,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  X,
  MessageSquare,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { GridPattern } from '@/components/film-atelier/backgrounds/grid-pattern'
import { RadialGlow } from '@/components/film-atelier/backgrounds/radial-glow'
import { Stepper } from '@/components/film-atelier/workflow/stepper'
import { StepperHorizontal } from '@/components/film-atelier/workflow/stepper-horizontal'
import { AIPromptBox } from '@/components/film-atelier/prompt/ai-prompt-box'
import { AIInputLoading } from '@/components/film-atelier/prompt/ai-input-loading'
import { FileUpload } from '@/components/film-atelier/upload/file-upload'
import { HoverPlayCard } from '@/components/film-atelier/media/hover-play-card'
import { ImageComparison } from '@/components/film-atelier/media/image-comparison'
import { ChooseImageDialog } from '@/components/film-atelier/media/choose-image-dialog'
import { ModernTimeline } from '@/components/film-atelier/timeline/modern-timeline'
import {
  workflowSteps,
  mockProject,
  mockShotImages,
  mockVideoCards,
  mockImageCompare,
  mockUploadFiles,
  mockTaskTimeline,
  mockImageOptions,
} from '@/components/film-atelier/mock-data'
import type { GenerationState } from '@/components/film-atelier/types'

// ---- Tab 类型 ----
type MediaTab = 'images' | 'videos' | 'compare' | 'upload'
type ColorScheme = 'neutral' | 'warm'
type BackgroundMode = 'none' | 'grid' | 'glow' | 'both'

// ---- Neutral inline style map (仅用于历史比较) ----
// 暖炭黑 V2 已为全局默认（:root），中性方案仅作为历史对比保留。
const NEUTRAL_VARS: React.CSSProperties = {
  '--bg-base': '#0d0d0f',
  '--bg-sidebar': '#111114',
  '--bg-surface': '#17171b',
  '--bg-card': '#1d1d22',
  '--bg-elevated': '#24242a',
  '--bg-hover': '#29292f',
  '--bg-input': '#1a1a1f',
  '--text-primary': '#f3f0e9',
  '--text-secondary': '#aaa7ae',
  '--text-tertiary': '#75727b',
  '--text-disabled': '#545159',
  '--border-subtle': '#29292f',
  '--border-default': '#34343c',
  '--border-strong': '#464650',
} as React.CSSProperties

// ---- Mobile AI Bottom Sheet ----
function MobileAISheet({
  open,
  onClose,
  children,
}: {
  open: boolean
  onClose: () => void
  children: React.ReactNode
}) {
  const sheetRef = React.useRef<HTMLDivElement>(null)
  const previousFocusRef = React.useRef<HTMLElement | null>(null)

  // Store / restore focus
  React.useEffect(() => {
    if (open) {
      previousFocusRef.current = document.activeElement as HTMLElement
      const timer = setTimeout(() => {
        sheetRef.current?.focus()
      }, 50)
      return () => clearTimeout(timer)
    } else if (previousFocusRef.current) {
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

  // Escape key
  React.useEffect(() => {
    if (!open) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 md:hidden" role="presentation">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />
      {/* Sheet */}
      <div
        ref={sheetRef}
        role="dialog"
        aria-modal="true"
        aria-label="AI 创作控制台"
        tabIndex={-1}
        className={cn(
          'absolute inset-x-0 bottom-0 z-10',
          'max-h-[85vh] flex flex-col',
          'rounded-t-2xl border-t border-[var(--border-subtle)]',
          'bg-[var(--bg-surface)]',
          'shadow-[var(--shadow-elevated)]',
          // Safe area for mobile
          'pb-[env(safe-area-inset-bottom,0px)]',
          'focus:outline-none',
        )}
      >
        {/* Drag handle */}
        <div className="flex justify-center pt-2 pb-1">
          <div className="h-1 w-8 rounded-full bg-[var(--border-default)]" />
        </div>
        {/* Header */}
        <div className="flex items-center justify-between px-4 pb-2">
          <span className="text-sm font-medium text-[var(--text-primary)] flex items-center gap-2">
            <Sparkles size={14} className="text-[var(--accent-primary)]" />
            AI 创作控制台
          </span>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1.5 text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] transition-colors cursor-pointer"
            aria-label="关闭"
          >
            <X size={16} />
          </button>
        </div>
        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto px-4 pb-4">
          {children}
        </div>
      </div>
    </div>
  )
}

export default function FilmAtelierPage() {
  // ---- 状态 ----
  const [activeStep, setActiveStep] = useState('character')
  const [mediaTab, setMediaTab] = useState<MediaTab>('images')
  const [generationState, setGenerationState] = useState<GenerationState>('idle')
  const [quickGenState, setQuickGenState] = useState<GenerationState>('idle')
  const [rightPanelCollapsed, setRightPanelCollapsed] = useState(false)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [promptValue, setPromptValue] = useState('')
  const [colorScheme, setColorScheme] = useState<ColorScheme>('warm')
  const [bgMode, setBgMode] = useState<BackgroundMode>('glow')
  const [mobileSheetOpen, setMobileSheetOpen] = useState(false)

  // 模拟生成状态切换
  const handleStartGeneration = () => {
    setGenerationState('submitting')
    setTimeout(() => setGenerationState('queued'), 800)
    setTimeout(() => setGenerationState('running'), 2000)
    setTimeout(() => setGenerationState('success'), 6000)
    setTimeout(() => setGenerationState('idle'), 8000)
  }

  const handleQuickSubmit = () => {
    setQuickGenState('submitting')
    setTimeout(() => setQuickGenState('running'), 500)
    setTimeout(() => setQuickGenState('success'), 3000)
    setTimeout(() => setQuickGenState('idle'), 5000)
  }

  const currentStep = workflowSteps.find(s => s.id === activeStep)

  return (
    <div
      className="flex h-screen flex-col overflow-hidden"
      style={colorScheme === 'neutral' ? NEUTRAL_VARS : undefined}
    >
      {/* ========== 顶部导航栏 ========== */}
      <header className="h-12 shrink-0 border-b border-[var(--border-subtle)] bg-[var(--bg-surface)]/90 backdrop-blur-md flex items-center px-4 gap-3 z-20">
        {/* 品牌 */}
        <div className="flex items-center gap-2">
          <div
            className="w-7 h-7 rounded-[var(--radius-md,8px)] flex items-center justify-center"
            style={{ background: 'var(--gradient-brand)' }}
          >
            <Clapperboard size={14} className="text-[var(--text-inverse)]" />
          </div>
          <span className="font-bold text-[var(--text-primary)] tracking-tight text-sm">Manjv Studio</span>
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--accent-soft)] text-[var(--accent-primary)] font-medium">Film Atelier</span>
        </div>

        <div className="h-4 w-px bg-[var(--border-subtle)]" />

        {/* 项目名称 */}
        <span className="text-sm text-[var(--text-secondary)]">{mockProject.name}</span>

        {/* 水平步骤栏（中等宽度以上显示） */}
        <div className="hidden md:flex flex-1 justify-center max-w-xl mx-auto">
          <StepperHorizontal steps={workflowSteps} onStepChange={setActiveStep} />
        </div>

        {/* 右侧工具 */}
        <div className="flex items-center gap-2 ml-auto">
          {/* 配色方案切换 */}
          <div className="hidden md:flex items-center gap-1 bg-[var(--bg-card)] border border-[var(--border-subtle)] rounded-[var(--radius-md,8px)] p-0.5">
            {([
              { key: 'warm' as const, label: '暖炭' },
              { key: 'neutral' as const, label: '中性' },
            ]).map(scheme => (
              <button
                key={scheme.key}
                type="button"
                onClick={() => setColorScheme(scheme.key)}
                className={cn(
                  'px-2 py-0.5 text-[10px] rounded-[calc(var(--radius-md,8px)-4px)] transition-colors duration-150 cursor-pointer',
                  colorScheme === scheme.key
                    ? 'bg-[var(--accent-soft)] text-[var(--accent-primary)] font-medium'
                    : 'text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]',
                )}
              >
                {scheme.label}
              </button>
            ))}
          </div>

          {/* 背景模式切换 */}
          <div className="hidden lg:flex items-center gap-1 bg-[var(--bg-card)] border border-[var(--border-subtle)] rounded-[var(--radius-md,8px)] p-0.5">
            {([
              { key: 'none' as const, label: '无' },
              { key: 'grid' as const, label: 'Grid' },
              { key: 'glow' as const, label: 'Glow' },
              { key: 'both' as const, label: '全部' },
            ]).map(mode => (
              <button
                key={mode.key}
                type="button"
                onClick={() => setBgMode(mode.key)}
                className={cn(
                  'px-2 py-0.5 text-[10px] rounded-[calc(var(--radius-md,8px)-4px)] transition-colors duration-150 cursor-pointer',
                  bgMode === mode.key
                    ? 'bg-[var(--accent-soft)] text-[var(--accent-primary)] font-medium'
                    : 'text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]',
                )}
              >
                {mode.label}
              </button>
            ))}
          </div>

          <span className="flex items-center gap-1 text-[11px] text-[var(--text-tertiary)]">
            <Save size={12} />
            {mockProject.saveStatus}
          </span>
          <button
            type="button"
            className="p-1.5 rounded text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] transition-colors cursor-pointer"
            aria-label="预览模式"
          >
            <Eye size={14} />
          </button>
          <button
            type="button"
            className="p-1.5 rounded text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] transition-colors cursor-pointer"
            aria-label="设置"
          >
            <Settings size={14} />
          </button>
        </div>
      </header>

      {/* ========== 主体三列布局 ========== */}
      <div className="flex flex-1 overflow-hidden relative">
        {/* 背景层 */}
        <div className="absolute inset-0 bg-[var(--bg-base)]">
          {(bgMode === 'grid' || bgMode === 'both') && <GridPattern width={40} height={40} />}
          {(bgMode === 'glow' || bgMode === 'both') && <RadialGlow />}
        </div>

        {/* ---- 左侧：工作流步骤 ---- */}
        <aside className="relative z-10 w-[240px] shrink-0 border-r border-[var(--border-subtle)] bg-[var(--bg-sidebar)]/80 backdrop-blur-sm overflow-y-auto hidden lg:block">
          <div className="p-4">
            <h3 className="text-[11px] uppercase tracking-wider text-[var(--text-tertiary)] font-medium mb-3">生产流程</h3>
            <Stepper steps={workflowSteps} onStepChange={setActiveStep} />
          </div>

          {/* 当前步骤摘要 */}
          <div className="mt-4 mx-4 p-3 rounded-[var(--radius-md,8px)] bg-[var(--bg-card)] border border-[var(--border-subtle)]">
            <div className="flex items-center gap-2 mb-2">
              <Sparkles size={12} className="text-[var(--accent-primary)]" />
              <span className="text-xs font-medium text-[var(--accent-primary)]">当前步骤</span>
            </div>
            <p className="text-xs text-[var(--text-primary)] font-medium">
              {currentStep?.title ?? '项目创建'}
            </p>
            <p className="text-xs text-[var(--text-secondary)] mt-0.5">
              {currentStep?.description ?? '设置项目基本信息'}
            </p>
          </div>
        </aside>

        {/* ---- 中间：素材工作区 ---- */}
        <main className="relative z-10 flex-1 overflow-y-auto min-w-0 pb-16 md:pb-0">
          {/* 移动端当前步骤摘要 + Stepper */}
          <div className="lg:hidden px-4 py-3 border-b border-[var(--border-subtle)] bg-[var(--bg-surface)]/60">
            <StepperHorizontal steps={workflowSteps} onStepChange={setActiveStep} />
            {/* 移动端当前步骤摘要 */}
            {currentStep && (
              <div className="mt-2 p-2.5 rounded-[var(--radius-md,8px)] bg-[var(--bg-card)] border border-[var(--border-subtle)]">
                <div className="flex items-center gap-1.5 mb-1">
                  <Sparkles size={10} className="text-[var(--accent-primary)]" />
                  <span className="text-[10px] font-medium text-[var(--accent-primary)]">当前步骤</span>
                </div>
                <p className="text-xs text-[var(--text-primary)] font-medium">{currentStep.title}</p>
                <p className="text-[10px] text-[var(--text-secondary)]">{currentStep.description}</p>
              </div>
            )}
          </div>

          <div className="p-6 space-y-6">
            {/* 素材 Tab 栏 */}
            <div className="flex items-center gap-1 bg-[var(--bg-card)] border border-[var(--border-subtle)] rounded-[var(--radius-md,8px)] p-1 w-fit">
              {([
                { key: 'images', label: '分镜图片' },
                { key: 'videos', label: '视频候选' },
                { key: 'compare', label: '版本对比' },
                { key: 'upload', label: '文件上传' },
              ] as const).map(tab => (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setMediaTab(tab.key)}
                  className={cn(
                    'px-3 py-1.5 text-xs rounded-[calc(var(--radius-md,8px)-4px)] transition-colors duration-150 cursor-pointer',
                    mediaTab === tab.key
                      ? 'bg-[var(--accent-soft)] text-[var(--accent-primary)] font-medium'
                      : 'text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]',
                  )}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* ===== 图片网格 ===== */}
            {mediaTab === 'images' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4">
                {mockShotImages.map(card => (
                  <HoverPlayCard
                    key={card.id}
                    {...card}
                    onPreview={(id) => console.log('Preview:', id)}
                    onRegenerate={(id) => console.log('Regenerate:', id)}
                    onSetFinal={(id) => console.log('Set final:', id)}
                    onDelete={(id) => console.log('Delete:', id)}
                  />
                ))}
              </div>
            )}

            {/* ===== 视频候选 ===== */}
            {mediaTab === 'videos' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                {mockVideoCards.map(card => (
                  <HoverPlayCard
                    key={card.id}
                    {...card}
                    onPreview={(id) => console.log('Preview:', id)}
                    onRegenerate={(id) => console.log('Regenerate:', id)}
                    onSetFinal={(id) => console.log('Set final:', id)}
                    onDelete={(id) => console.log('Delete:', id)}
                  />
                ))}
              </div>
            )}

            {/* ===== 版本对比 ===== */}
            {mediaTab === 'compare' && (
              <div className="max-w-3xl space-y-6">
                <ImageComparison
                  beforeUrl={mockImageCompare.beforeUrl}
                  afterUrl={mockImageCompare.afterUrl}
                  beforeLabel={mockImageCompare.beforeLabel}
                  afterLabel={mockImageCompare.afterLabel}
                  beforeVersion={mockImageCompare.beforeVersion}
                  afterVersion={mockImageCompare.afterVersion}
                  beforeModel={mockImageCompare.beforeModel}
                  afterModel={mockImageCompare.afterModel}
                />

                {/* 选择图片入口 */}
                <button
                  type="button"
                  onClick={() => setDialogOpen(true)}
                  className={cn(
                    'h-9 px-4 text-sm font-medium rounded-[var(--radius-md,8px)]',
                    'text-[var(--text-inverse)] transition-all duration-200 cursor-pointer',
                    'active:scale-[0.97] flex items-center gap-2',
                  )}
                  style={{ background: 'var(--gradient-brand)' }}
                >
                  <Eye size={14} />
                  选择图片版本
                </button>
              </div>
            )}

            {/* ===== 文件上传 ===== */}
            {mediaTab === 'upload' && (
              <div className="max-w-2xl">
                <FileUpload
                  files={mockUploadFiles}
                  onUpload={(files) => console.log('Upload:', files.map(f => f.name))}
                  onDelete={(id) => console.log('Delete upload:', id)}
                  onRetry={(id) => console.log('Retry upload:', id)}
                />
              </div>
            )}

            {/* ===== 快速修改输入 ===== */}
            <div className="max-w-3xl">
              <AIInputLoading
                generationState={quickGenState}
                onSubmit={handleQuickSubmit}
                onCancel={() => setQuickGenState('idle')}
                onRetry={handleQuickSubmit}
                placeholder="输入修改描述，如：调整角色表情、更换背景色调..."
              />
            </div>

            {/* ===== 任务 Timeline ===== */}
            <div className="max-w-2xl">
              <h3 className="text-xs uppercase tracking-wider text-[var(--text-tertiary)] font-medium mb-3">任务执行记录</h3>
              <div className="p-4 rounded-[var(--radius-md,8px)] bg-[var(--bg-card)] border border-[var(--border-subtle)]">
                <ModernTimeline entries={mockTaskTimeline} />
              </div>
            </div>
          </div>
        </main>

        {/* ---- 右侧：AI 创作控制台（仅桌面端显示） ---- */}
        <aside
          className={cn(
            'hidden md:flex relative z-10 shrink-0 border-l border-[var(--border-subtle)] bg-[var(--bg-surface)]/80 backdrop-blur-sm overflow-y-auto transition-all duration-300',
            rightPanelCollapsed ? 'w-0 lg:w-10' : 'w-[360px]',
          )}
        >
          {/* 折叠按钮 */}
          <button
            type="button"
            onClick={() => setRightPanelCollapsed(!rightPanelCollapsed)}
            className="hidden lg:flex absolute -left-5 top-1/2 -translate-y-1/2 z-10 w-5 h-10 items-center justify-center rounded-l bg-[var(--bg-card)] border border-r-0 border-[var(--border-subtle)] text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] cursor-pointer transition-colors"
            aria-label={rightPanelCollapsed ? '展开控制台' : '收起控制台'}
          >
            {rightPanelCollapsed ? <ChevronLeft size={12} /> : <ChevronRight size={12} />}
          </button>

          {!rightPanelCollapsed && (
            <div className="p-4 space-y-4">
              <h3 className="text-xs uppercase tracking-wider text-[var(--text-tertiary)] font-medium flex items-center gap-2">
                <Sparkles size={12} className="text-[var(--accent-primary)]" />
                AI 创作控制台
              </h3>
              <AIPromptBox
                promptValue={promptValue}
                onPromptChange={setPromptValue}
                generationState={generationState}
                onSubmit={handleStartGeneration}
                onCancel={() => setGenerationState('idle')}
              />
            </div>
          )}
        </aside>
      </div>

      {/* ========== 图片选择 Dialog ========== */}
      <ChooseImageDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        options={mockImageOptions}
        onImageSelect={(id: string) => console.log('Selected:', id)}
        onConfirm={(id) => console.log('Confirmed:', id)}
        title="选择分镜图片"
      />

      {/* ========== 移动端底部 AI 入口 ========== */}
      <div className="fixed bottom-0 inset-x-0 z-30 md:hidden pointer-events-none">
        <div className="flex justify-center px-4 pb-[calc(env(safe-area-inset-bottom,0px)+12px)]">
          <button
            type="button"
            onClick={() => setMobileSheetOpen(true)}
            className={cn(
              'pointer-events-auto',
              'flex items-center gap-2 h-11 px-5 rounded-full',
              'text-sm font-medium text-[var(--text-inverse)]',
              'shadow-lg transition-all duration-200 cursor-pointer',
              'active:scale-[0.97]',
            )}
            style={{ background: 'var(--gradient-brand)' }}
          >
            <MessageSquare size={16} />
            AI 创作
          </button>
        </div>
      </div>

      {/* ========== 移动端 AI Bottom Sheet ========== */}
      <MobileAISheet
        open={mobileSheetOpen}
        onClose={() => setMobileSheetOpen(false)}
      >
        <AIPromptBox
          promptValue={promptValue}
          onPromptChange={setPromptValue}
          generationState={generationState}
          onSubmit={() => { handleStartGeneration(); setMobileSheetOpen(false) }}
          onCancel={() => setGenerationState('idle')}
        />
      </MobileAISheet>
    </div>
  )
}
