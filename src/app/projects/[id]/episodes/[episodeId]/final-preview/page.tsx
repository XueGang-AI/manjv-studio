/**
 * 成片预览与合成页面 — Aurora Studio V3
 *
 * 布局：前置检查+主预览区(左/中) | 右侧面板(右)
 * 数据源：GET /api/projects/:id/episodes/:episodeId/final-preview
 * 操作：启动合成、重新合成、下载、预览
 *
 * 实时更新：
 * - SSE 订阅任务状态变更，自动刷新数据
 * - FFmpeg 合成在 Worker 中异步执行
 * - 不再使用 setInterval 轮询
 */
'use client'

import { useState, useEffect, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { AlertTriangle, Clapperboard, Film, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { useToast } from '@/components/ui/toast'
import { PreflightCheck } from '@/components/final-preview/preflight-check'
import { FinalVideoPlayer } from '@/components/final-preview/final-video-player'
import { FinalPreviewRightPanel } from '@/components/final-preview/final-preview-right-panel'
import { getRenderStatus, getPreflightIssues, type FinalPreviewData } from '@/components/final-preview/final-preview-types'
import { useTaskSSE, type TaskEventType, type TaskUpdateEvent } from '@/lib/hooks/use-task-sse'

export default function FinalPreviewPage() {
  const params = useParams()
  const router = useRouter()
  const projectId = params.id as string
  const episodeId = params.episodeId as string

  const [data, setData] = useState<FinalPreviewData | null>(null)
  const [loading, setLoading] = useState(true)
  const [rendering, setRendering] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmOpen, setConfirmOpen] = useState(false)

  const { addToast } = useToast()

  // Refresh data
  const refreshData = useCallback(async () => {
    try {
      const res = await fetch(`/api/projects/${projectId}/episodes/${episodeId}/final-preview`)
      const json = await res.json()
      if (json.success) setData(json.data)
    } catch { /* silent */ }
  }, [projectId, episodeId])

  // Initial load
  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      setError(null)
      try {
        const res = await fetch(`/api/projects/${projectId}/episodes/${episodeId}/final-preview`)
        const json = await res.json()
        if (cancelled) return
        if (json.success) setData(json.data)
        else setError(json.error || '加载失败')
      } catch {
        if (!cancelled) setError('网络错误，请重试')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [projectId, episodeId])

  // SSE 实时更新 — 替代 setInterval polling
  useTaskSSE(projectId, {
    onTaskUpdate: (type: TaskEventType, payload: TaskUpdateEvent) => {
      // 只关心渲染任务
      if (payload.taskType === 'RENDER_FINAL_VIDEO') {
        refreshData()

        if (type === 'task.completed') {
          addToast({ type: 'success', title: '成片合成完成' })
          setRendering(false)
        } else if (type === 'task.failed') {
          addToast({ type: 'error', title: '合成失败', description: payload.errorMessage || '请重试' })
          setError(payload.errorMessage || '合成失败')
          setRendering(false)
        } else if (type === 'task.running') {
          setRendering(true)
        }
      }
    },
    onSnapshot: () => {
      refreshData()
    },
  })

  // Derived
  const status = getRenderStatus(data, rendering)
  const isRendering = status === 'rendering'
  const isRendered = status === 'rendered'
  const canRender = data?.canRender ?? false
  const preflightIssues = getPreflightIssues(data)
  const allPreflightPassed = preflightIssues.every(i => i.passed)

  // Actions
  const handleRender = async () => {
    setRendering(true)
    setError(null)
    try {
      const res = await fetch(`/api/projects/${projectId}/episodes/${episodeId}/final-preview/render`, { method: 'POST' })
      const json = await res.json()
      if (json.success) {
        addToast({ type: 'success', title: '合成任务已创建', description: 'Worker 将异步执行，SSE 自动推送状态' })
        await refreshData()
      } else {
        const errMsg = typeof json.error === 'object' && json.error?.message
          ? json.error.message
          : String(json.error || '创建任务失败')
        addToast({ type: 'error', title: '创建任务失败', description: errMsg })
        setError(errMsg)
        await refreshData()
      }
    } catch {
      addToast({ type: 'error', title: '请求失败' })
      setError('请求失败，请重试')
      await refreshData()
    } finally {
      setConfirmOpen(false)
    }
  }

  // ─── Render ──────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-8 h-8 rounded-[var(--radius-md)] bg-[var(--bg-panel)] animate-pulse" />
          <div className="h-6 w-32 bg-[var(--bg-panel)] rounded animate-pulse" />
        </div>
        <div className="aspect-video bg-[var(--bg-panel)] rounded-[var(--radius-lg)] animate-pulse max-w-lg mx-auto" />
      </div>
    )
  }

  if (error && !data) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center py-20 text-center p-6">
        <div className="w-16 h-16 rounded-[var(--radius-xl)] bg-[var(--color-danger-muted)] flex items-center justify-center mb-5 text-[var(--color-danger)]">
          <AlertTriangle size={28} />
        </div>
        <h3 className="text-lg font-semibold text-[var(--color-text-primary)] mb-2">加载失败</h3>
        <p className="text-sm text-[var(--color-text-muted)] max-w-sm mb-6">{error}</p>
        <Button variant="outline" size="sm" onClick={() => { setError(null); setLoading(true); refreshData() }}>重试</Button>
      </div>
    )
  }

  if (!data) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center py-20 text-center p-6">
        <div className="w-16 h-16 rounded-[var(--radius-xl)] bg-[var(--color-warning-muted)] flex items-center justify-center mb-5 text-[var(--color-warning)]">
          <Film size={28} />
        </div>
        <h3 className="text-lg font-semibold text-[var(--color-text-primary)] mb-2">暂无数据</h3>
        <p className="text-sm text-[var(--color-text-muted)] max-w-sm mb-6">
          请先完成视频片段确认，再进入成片预览
        </p>
        <Button variant="outline" size="sm" onClick={() => router.push(`/projects/${projectId}/episodes/${episodeId}/shot-videos`)}>
          返回视频片段
        </Button>
      </div>
    )
  }

  return (
    <div className="flex flex-1 overflow-hidden">
      <div className="flex-1 overflow-y-auto">
        <div className="p-4 md:p-6 space-y-5 max-w-3xl">
          {/* Header */}
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-xl font-bold text-[var(--color-text-primary)]">成片预览</h2>
              <p className="text-sm text-[var(--color-text-muted)] mt-1">
                {isRendered ? '最终视频已生成' : isRendering ? '正在合成视频…' : canRender ? '可以合成最终成片' : '请先完成视频确认'}
              </p>
            </div>
            {canRender && !isRendering && !isRendered && (
              <Button
                variant="aurora"
                size="sm"
                icon={<Clapperboard size={14} />}
                onClick={() => setConfirmOpen(true)}
                disabled={!allPreflightPassed}
              >
                开始合成
              </Button>
            )}
          </div>

          {/* Error banner */}
          {error && data && (
            <div className="rounded-[var(--radius-md)] p-3 bg-[var(--color-danger-muted)] border border-[var(--color-danger)]/20 flex items-start gap-2">
              <AlertTriangle size={14} className="text-[var(--color-danger)] mt-0.5 shrink-0" />
              <p className="text-xs text-[var(--color-danger)]">{error}</p>
              <button onClick={() => setError(null)} className="ml-auto text-[var(--color-danger)]/60 hover:text-[var(--color-danger)] cursor-pointer">
                ✕
              </button>
            </div>
          )}

          {/* Preflight check — show when not yet rendered */}
          {!isRendered && !isRendering && (
            <PreflightCheck data={data} />
          )}

          {/* Rendering state */}
          {isRendering && (
            <div className="py-12 text-center">
              <div className="w-16 h-16 rounded-[var(--radius-xl)] bg-[var(--color-accent-cyan-muted)] flex items-center justify-center mx-auto mb-4 text-[var(--color-accent-cyan)] animate-pulse-glow">
                <Loader2 size={28} className="animate-spin" />
              </div>
              <h3 className="text-lg font-semibold text-[var(--color-text-primary)] mb-2">FFmpeg 正在合成视频</h3>
              <p className="text-sm text-[var(--color-text-muted)] max-w-md mx-auto">
                拼接 {data.shotsWithVideos.length} 个镜头片段、统一分辨率、添加转场效果…SSE 将自动推送状态
              </p>
            </div>
          )}

          {/* Cannot render state */}
          {!canRender && !isRendering && !isRendered && (
            <div className="py-8 text-center">
              <Clapperboard size={48} className="text-[var(--color-text-muted)] mx-auto mb-3 opacity-50" />
              <p className="text-sm text-[var(--color-text-muted)] mb-4">
                需要在视频片段页面确认每个镜头的最终视频后，才能合成
              </p>
              <Button variant="outline" size="sm" onClick={() => router.push(`/projects/${projectId}/episodes/${episodeId}/shot-videos`)}>
                返回视频片段
              </Button>
            </div>
          )}

          {/* Rendered state — show player */}
          {isRendered && (
            <FinalVideoPlayer
              video={data.latest}
              onRerender={() => setConfirmOpen(true)}
              rerendering={rendering}
            />
          )}
        </div>
      </div>

      <FinalPreviewRightPanel
        data={data}
        isRendering={isRendering}
        onRerender={() => setConfirmOpen(true)}
      />

      {/* Render confirm dialog */}
      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        variant="warning"
        title={data.latest ? '重新合成成片' : '合成最终成片'}
        description={data.latest
          ? `将重新拼接 ${data.shotsWithVideos.length} 个镜头视频为完整 MP4。之前的成片将保留在历史版本中。合成可能需要较长时间。`
          : `将拼接 ${data.shotsWithVideos.length} 个镜头的已确认视频片段为完整 MP4。合成可能需要较长时间，请耐心等待。`
        }
        confirmLabel={rendering ? '合成中…' : '开始合成'}
        loading={rendering}
        onConfirm={handleRender}
      />
    </div>
  )
}
