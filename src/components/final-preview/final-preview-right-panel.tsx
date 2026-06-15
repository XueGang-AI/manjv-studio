'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, CheckCircle2, Download, RefreshCw, X, Zap, ExternalLink } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { ProgressBar } from '@/components/ui/progress-bar'
import { useToast } from '@/components/ui/toast'
import type { FinalPreviewData, FinalVideoItem } from './final-preview-types'

interface FinalPreviewRightPanelProps {
  data: FinalPreviewData
  isRendering: boolean
  onRerender: () => void
}

export function FinalPreviewRightPanel({ data, isRendering, onRerender }: FinalPreviewRightPanelProps) {
  const { addToast } = useToast()
  const [mobileOpen, setMobileOpen] = useState(false)
  const latestVideo = data.latest
  const isRendered = data.projectStatus === 'RENDERED' || latestVideo?.status === 'READY'

  const handleDownload = () => {
    if (!latestVideo?.videoUrl) {
      addToast({ type: 'error', title: '下载失败', description: '视频 URL 不可用' })
      return
    }
    // Try native download, fallback to open in new tab
    const a = document.createElement('a')
    a.href = latestVideo.videoUrl
    a.download = `final_${data.episodeId}_${Date.now()}.mp4`
    a.target = '_blank'
    a.rel = 'noopener noreferrer'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
  }

  const panelContent = (
    <div className="flex flex-col h-full">
      <div className="px-4 py-3 border-b border-[var(--color-border-dim)] flex items-center justify-between">
        <h3 className="text-sm font-semibold text-[var(--color-text-primary)] flex items-center gap-2">
          <Zap size={14} className="text-[var(--color-accent-cyan)]" />成片工作台
        </h3>
        <button className="lg:hidden p-1 cursor-pointer text-[var(--color-text-muted)]" onClick={() => setMobileOpen(false)} aria-label="关闭面板">
          <X size={14} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Status */}
        {isRendering && (
          <Card className="p-3 border-l-2 border-l-[var(--color-accent-cyan)]">
            <div className="flex items-center gap-2 mb-1">
              <span className="w-2 h-2 rounded-full bg-[var(--color-accent-cyan)] animate-pulse-glow" />
              <span className="text-xs font-semibold text-[var(--color-accent-cyan)]">合成中</span>
            </div>
            <p className="text-[11px] text-[var(--color-text-muted)]">FFmpeg 正在拼接视频片段</p>
            <div className="mt-2">
              <ProgressBar value={50} variant="aurora" size="sm" />
            </div>
          </Card>
        )}

        {isRendered && (
          <Card className="p-3 bg-[var(--color-success-muted)]">
            <div className="flex items-center gap-2 mb-2">
              <CheckCircle2 size={16} className="text-[var(--color-success)]" />
              <span className="text-sm font-semibold text-[var(--color-text-primary)]">成片已合成</span>
            </div>
            <p className="text-[11px] text-[var(--color-text-muted)] mb-3">可以预览和下载最终视频</p>
          </Card>
        )}

        {/* Output info */}
        {latestVideo && isRendered && (
          <Card className="p-3">
            <h4 className="text-xs font-semibold text-[var(--color-text-primary)] mb-3">输出信息</h4>
            <div className="space-y-2 text-xs">
              {latestVideo.duration != null && (
                <div className="flex justify-between">
                  <span className="text-[var(--color-text-muted)]">时长</span>
                  <span className="text-[var(--color-text-primary)] font-mono">{latestVideo.duration.toFixed(1)}s</span>
                </div>
              )}
              {latestVideo.aspectRatio && (
                <div className="flex justify-between">
                  <span className="text-[var(--color-text-muted)]">画面比例</span>
                  <span className="text-[var(--color-text-primary)]">{latestVideo.aspectRatio}</span>
                </div>
              )}
              {latestVideo.fps != null && (
                <div className="flex justify-between">
                  <span className="text-[var(--color-text-muted)]">帧率</span>
                  <span className="text-[var(--color-text-primary)] font-mono">{latestVideo.fps} fps</span>
                </div>
              )}
              {latestVideo.createdAt && (
                <div className="flex justify-between">
                  <span className="text-[var(--color-text-muted)]">生成时间</span>
                  <span className="text-[var(--color-text-primary)]">{new Date(latestVideo.createdAt).toLocaleString('zh-CN')}</span>
                </div>
              )}
              {data.shotsWithVideos.length > 0 && (
                <div className="flex justify-between">
                  <span className="text-[var(--color-text-muted)]">镜头数量</span>
                  <span className="text-[var(--color-text-primary)] font-mono">{data.shotsWithVideos.length}</span>
                </div>
              )}
            </div>
          </Card>
        )}

        {/* Version history */}
        {data.finalVideos.length > 1 && (
          <Card className="p-3">
            <h4 className="text-xs font-semibold text-[var(--color-text-muted)] mb-3">历史版本</h4>
            <div className="space-y-1.5">
              {data.finalVideos.slice(1).map((v, i) => (
                <div key={v.id} className="flex items-center justify-between text-[10px] text-[var(--color-text-muted)] py-1">
                  <span>v{data.finalVideos.length - i}</span>
                  <span className="font-mono">{v.duration?.toFixed(1) ?? '-'}s</span>
                  <span>{new Date(v.createdAt).toLocaleString('zh-CN')}</span>
                  {v.videoUrl && (
                    <a
                      href={v.videoUrl}
                      download
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[var(--color-primary)] hover:text-[var(--color-text-primary)] transition-colors"
                    >
                      <Download size={10} />
                    </a>
                  )}
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* Actions */}
        <Card className="p-3">
          <h4 className="text-xs font-semibold text-[var(--color-text-muted)] mb-3">操作</h4>
          <div className="space-y-2">
            {isRendered && latestVideo?.videoUrl && (
              <Button variant="aurora" size="sm" className="w-full" icon={<Download size={12} />} onClick={handleDownload}>
                下载成片
              </Button>
            )}
            {isRendered && latestVideo?.videoUrl && (
              <Button variant="outline" size="sm" className="w-full" icon={<ExternalLink size={12} />} onClick={() => window.open(latestVideo.videoUrl!, '_blank')}>
                在新窗口打开
              </Button>
            )}
            {isRendered && (
              <Button variant="outline" size="sm" className="w-full" icon={<RefreshCw size={12} />} onClick={onRerender} disabled={isRendering}>
                {isRendering ? '合成中…' : '重新合成'}
              </Button>
            )}
          </div>
        </Card>

        {/* Navigation */}
        <Card className="p-3">
          <h4 className="text-xs font-semibold text-[var(--color-text-muted)] mb-3">导航</h4>
          <div className="space-y-2">
            <Link href={`/projects/${data.projectId}/episodes/${data.episodeId}/shot-videos`} className="flex items-center gap-2 text-xs text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] transition-colors">
              <ArrowLeft size={12} />返回视频片段
            </Link>
            <Link href={`/projects/${data.projectId}`} className="flex items-center gap-2 text-xs text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] transition-colors">
              <ArrowLeft size={12} />返回项目
            </Link>
          </div>
        </Card>
      </div>
    </div>
  )

  return (
    <>
      {/* Desktop */}
      <div className="hidden lg:flex w-80 border-l border-[var(--color-border-dim)] bg-[var(--bg-surface)] overflow-hidden shrink-0">
        {panelContent}
      </div>

      {/* Mobile toggle */}
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
