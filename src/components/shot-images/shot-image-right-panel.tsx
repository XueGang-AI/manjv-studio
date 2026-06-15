'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, ArrowRight, CheckCircle2, Sparkles, RefreshCw, Zap, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { ProgressBar } from '@/components/ui/progress-bar'
import type { ShotGroup } from './shot-images-types'

interface ShotImageRightPanelProps {
  projectId: string
  episodeId: string
  shots: ShotGroup[]
  allConfirmed: boolean
  projectStatus: string
  isGenerating: boolean
  onGenerate: () => void
  onBatchConfirm: () => void
}

export function ShotImageRightPanel({
  projectId, episodeId, shots, allConfirmed, isGenerating,
  onGenerate, onBatchConfirm,
}: ShotImageRightPanelProps) {
  const totalShots = shots.length
  const confirmedShots = shots.filter(s => s.confirmed).length
  const generatedShots = shots.filter(s => s.images.length > 0).length
  const failedShots = shots.filter(s => s.images.length === 0 && !isGenerating).length
  const hasAnyImages = generatedShots > 0
  const canBatchConfirm = hasAnyImages && !allConfirmed && !isGenerating

  // Mobile drawer toggle
  const [mobileOpen, setMobileOpen] = useState(false)

  const panelContent = (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 py-3 border-b border-[var(--color-border-dim)] flex items-center justify-between">
        <h3 className="text-sm font-semibold text-[var(--color-text-primary)] flex items-center gap-2">
          <Zap size={14} className="text-[var(--color-accent-cyan)]" />分镜图工作台
        </h3>
        {/* Mobile close button */}
        <button className="lg:hidden p-1 cursor-pointer text-[var(--color-text-muted)]" onClick={() => setMobileOpen(false)} aria-label="关闭面板">
          <X size={14} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Progress overview */}
        <Card className="p-3">
          <h4 className="text-xs font-semibold text-[var(--color-text-primary)] mb-3">生成进度</h4>
          <div className="space-y-2 text-xs">
            <div className="flex justify-between"><span className="text-[var(--color-text-muted)]">总镜头</span><span className="text-[var(--color-text-primary)] font-mono">{totalShots}</span></div>
            <div className="flex justify-between"><span className="text-[var(--color-text-muted)]">已生成</span><span className="text-[var(--color-text-primary)] font-mono">{generatedShots}</span></div>
            <div className="flex justify-between"><span className="text-[var(--color-text-muted)]">已确认</span><span className="text-[var(--color-text-primary)] font-mono">{confirmedShots}</span></div>
            {failedShots > 0 && (
              <div className="flex justify-between"><span className="text-[var(--color-danger)]">未生成</span><span className="text-[var(--color-danger)] font-mono">{failedShots}</span></div>
            )}
          </div>
          <div className="mt-3">
            <ProgressBar
              value={totalShots > 0 ? (confirmedShots / totalShots) * 100 : 0}
              variant={allConfirmed ? 'success' : 'aurora'}
              size="md"
            />
            <div className="text-[10px] text-[var(--color-text-muted)] mt-1 text-right font-mono">{confirmedShots}/{totalShots}</div>
          </div>
        </Card>

        {/* Actions */}
        <Card className="p-3">
          <h4 className="text-xs font-semibold text-[var(--color-text-muted)] mb-3">操作</h4>
          <div className="space-y-2">
            {!hasAnyImages && !isGenerating && (
              <Button variant="aurora" size="sm" className="w-full" icon={<Sparkles size={12} />} onClick={onGenerate}>
                生成全部分镜图
              </Button>
            )}
            {hasAnyImages && !allConfirmed && (
              <>
                <Button variant="outline" size="sm" className="w-full" icon={<RefreshCw size={12} />} onClick={onGenerate} disabled={isGenerating}>
                  {isGenerating ? '生成中…' : '重新生成缺失图片'}
                </Button>
                {canBatchConfirm && (
                  <Button variant="aurora" size="sm" className="w-full" icon={<CheckCircle2 size={12} />} onClick={onBatchConfirm}>
                    批量确认（自动选择最佳图片）
                  </Button>
                )}
              </>
            )}
            {allConfirmed && (
              <Card className="p-3 bg-[var(--color-success-muted)]">
                <div className="flex items-center gap-2 mb-2">
                  <CheckCircle2 size={16} className="text-[var(--color-success)]" />
                  <span className="text-sm font-semibold text-[var(--color-text-primary)]">全部已确认</span>
                </div>
                <p className="text-[11px] text-[var(--color-text-muted)] mb-3">可以进入视频生成阶段</p>
                <Link href={`/projects/${projectId}/episodes/${episodeId}/shot-videos`}>
                  <Button variant="aurora" size="sm" className="w-full" icon={<ArrowRight size={12} />}>
                    进入视频生成
                  </Button>
                </Link>
              </Card>
            )}
          </div>
        </Card>

        {/* Status indicator */}
        {isGenerating && (
          <Card className="p-3 border-l-2 border-l-[var(--color-accent-cyan)]">
            <div className="flex items-center gap-2 mb-1">
              <span className="w-2 h-2 rounded-full bg-[var(--color-accent-cyan)] animate-pulse-glow" />
              <span className="text-xs font-semibold text-[var(--color-accent-cyan)]">生成中</span>
            </div>
            <p className="text-[11px] text-[var(--color-text-muted)]">AI 正在生成分镜图片，页面将自动刷新</p>
          </Card>
        )}

        {/* Navigation */}
        <Card className="p-3">
          <h4 className="text-xs font-semibold text-[var(--color-text-muted)] mb-3">导航</h4>
          <div className="space-y-2">
            <Link href={`/projects/${projectId}/episodes/${episodeId}/storyboard`} className="flex items-center gap-2 text-xs text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] transition-colors">
              <ArrowLeft size={12} />返回分镜脚本
            </Link>
            {allConfirmed && (
              <Link href={`/projects/${projectId}/episodes/${episodeId}/shot-videos`} className="flex items-center gap-2 text-xs text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] transition-colors">
                进入视频生成 <ArrowRight size={12} />
              </Link>
            )}
          </div>
        </Card>
      </div>
    </div>
  )

  return (
    <>
      {/* Desktop panel */}
      <div className="hidden lg:flex w-80 border-l border-[var(--color-border-dim)] bg-[var(--bg-surface)] overflow-hidden shrink-0">
        {panelContent}
      </div>

      {/* Mobile toggle button */}
      <button
        className="lg:hidden fixed bottom-4 right-4 z-40 w-12 h-12 rounded-full bg-[var(--color-primary)] text-white flex items-center justify-center shadow-lg cursor-pointer"
        onClick={() => setMobileOpen(true)}
        aria-label="打开工作台面板"
      >
        <Zap size={20} />
      </button>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/40" onClick={() => setMobileOpen(false)} />
          <div className="absolute right-0 top-0 bottom-0 w-80 max-w-[85vw] bg-[var(--bg-surface)] border-l border-[var(--color-border-dim)]">
            {panelContent}
          </div>
        </div>
      )}
    </>
  )
}
