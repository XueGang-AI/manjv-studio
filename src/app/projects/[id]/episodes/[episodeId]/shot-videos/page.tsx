/**
 * 视频片段页面 — Aurora Studio V3
 *
 * 布局：镜头导航(左) | 视频审核区(中) | 右侧面板(右)
 * 数据源：GET /api/projects/:id/episodes/:episodeId/shot-videos
 * 操作：生成视频、检查任务、选择视频、确认视频、重新生成
 *
 * 实时更新：
 * - SSE 订阅任务状态变更，自动刷新数据
 * - 降级到手动批量检查（batch-check-tasks）
 * - 不再使用 setInterval 轮询
 */
'use client'

import { useState, useEffect, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { AlertTriangle, Video, ChevronDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/toast'
import { ShotVideoNavigation } from '@/components/shot-videos/shot-video-navigation'
import { ShotVideoReview } from '@/components/shot-videos/shot-video-review'
import { ShotVideoRightPanel } from '@/components/shot-videos/shot-video-right-panel'
import { getVideoGroupStatus, STATUS_LABELS, type ShotVideosData } from '@/components/shot-videos/shot-videos-types'
import { useTaskSSE, type TaskEventType, type TaskUpdateEvent } from '@/lib/hooks/use-task-sse'

export default function ShotVideosPage() {
  const params = useParams()
  const router = useRouter()
  const projectId = params.id as string
  const episodeId = params.episodeId as string

  const [data, setData] = useState<ShotVideosData | null>(null)
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [activeShotId, setActiveShotId] = useState<string | null>(null)
  const [mobileSelectorOpen, setMobileSelectorOpen] = useState(false)

  const { addToast } = useToast()

  // Refresh data
  const refreshData = useCallback(async () => {
    try {
      const res = await fetch(`/api/projects/${projectId}/episodes/${episodeId}/shot-videos`)
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
        const res = await fetch(`/api/projects/${projectId}/episodes/${episodeId}/shot-videos`)
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
      // 只关心本项目本剧集的视频任务
      if (payload.taskType === 'GENERATE_SHOT_VIDEOS' || payload.taskType === 'RENDER_FINAL_VIDEO') {
        // 收到任务状态变更，刷新数据
        refreshData()

        if (type === 'task.completed') {
          addToast({ type: 'success', title: '视频生成完成' })
        } else if (type === 'task.failed') {
          addToast({ type: 'error', title: '视频生成失败', description: payload.errorMessage || '请重试' })
        }
      }
    },
    onSnapshot: () => {
      // 全量快照更新时也刷新数据
      refreshData()
    },
  })

  // Derived
  const isGenerating = data?.projectStatus === 'SHOT_VIDEO_GENERATING' || generating
  const effectiveActiveShotId = activeShotId ?? (data?.shots?.length ? data.shots[0].shot.id : null)
  const activeGroup = data?.shots.find(s => s.shot.id === effectiveActiveShotId) ?? data?.shots[0] ?? null
  const episodeIdFromData = data?.episodeId ?? episodeId

  // Actions
  const handleGenerate = async () => {
    setGenerating(true)
    try {
      const res = await fetch(`/api/projects/${projectId}/episodes/${episodeIdFromData}/shot-videos/generate`, { method: 'POST' })
      const json = await res.json()
      if (json.success) {
        addToast({ type: 'success', title: '视频生成任务已创建', description: 'Worker 将异步执行，SSE 自动推送状态' })
        await refreshData()
      } else {
        addToast({ type: 'error', title: '创建任务失败', description: typeof json.error === 'string' ? json.error : json.error?.message })
      }
    } catch {
      addToast({ type: 'error', title: '请求失败' })
    } finally { setGenerating(false) }
  }

  const handleBatchCheck = async () => {
    try {
      const res = await fetch(
        `/api/projects/${projectId}/episodes/${episodeIdFromData}/shot-videos/batch-check-tasks`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }
      )
      const json = await res.json()
      if (json.success) {
        addToast({ type: 'success', title: `已检查 ${json.data.checked} 个任务`, description: `完成: ${json.data.completed}, 失败: ${json.data.failed}, 待处理: ${json.data.pending}` })
        await refreshData()
      } else {
        addToast({ type: 'error', title: '批量检查失败', description: json.error })
      }
    } catch {
      addToast({ type: 'error', title: '请求失败' })
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
        {[1, 2, 3].map(i => (
          <div key={i} className="space-y-3">
            <div className="h-8 bg-[var(--bg-panel)] rounded animate-pulse w-48" />
            <div className="aspect-video bg-[var(--bg-panel)] rounded-[var(--radius-lg)] animate-pulse" />
          </div>
        ))}
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

  if (!data || data.shots.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center py-20 text-center p-6">
        <div className="w-16 h-16 rounded-[var(--radius-xl)] bg-[var(--color-warning-muted)] flex items-center justify-center mb-5 text-[var(--color-warning)]">
          <Video size={28} />
        </div>
        <h3 className="text-lg font-semibold text-[var(--color-text-primary)] mb-2">暂无分镜数据</h3>
        <p className="text-sm text-[var(--color-text-muted)] max-w-sm mb-6">
          请先完成分镜图确认，再进入视频生成
        </p>
        <Button variant="outline" size="sm" onClick={() => router.push(`/projects/${projectId}/episodes/${episodeId}/shot-images`)}>
          返回分镜图
        </Button>
      </div>
    )
  }

  return (
    <div className="flex flex-1 overflow-hidden">
      {/* Desktop: side navigation */}
      <div className="hidden md:block">
        <ShotVideoNavigation
          shots={data.shots}
          isGenerating={isGenerating}
          activeShotId={activeGroup?.shot.id ?? null}
          onSelect={setActiveShotId}
        />
      </div>

      {/* Mobile: top shot selector */}
      <div className="md:hidden w-full">
        <div className="relative border-b border-[var(--color-border-dim)] bg-[var(--bg-surface)]">
          <button
            className="w-full px-4 py-2.5 flex items-center justify-between cursor-pointer"
            onClick={() => setMobileSelectorOpen(!mobileSelectorOpen)}
          >
            <div className="flex items-center gap-2">
              <span className="w-6 h-6 rounded-[var(--radius-sm)] flex items-center justify-center text-xs font-bold text-white" style={{ background: 'var(--gradient-aurora)' }}>
                {activeGroup?.shot.shotNo ?? '-'}
              </span>
              <span className="text-sm font-medium text-[var(--color-text-primary)]">{activeGroup?.shot.shotName || `镜头 ${activeGroup?.shot.shotNo ?? ''}`}</span>
              {activeGroup && (
                <span className="text-[10px] text-[var(--color-text-muted)]">
                  {STATUS_LABELS[getVideoGroupStatus(activeGroup, isGenerating)]}
                </span>
              )}
            </div>
            <ChevronDown size={14} className={`text-[var(--color-text-muted)] transition-transform ${mobileSelectorOpen ? 'rotate-180' : ''}`} />
          </button>
          {mobileSelectorOpen && (
            <div className="absolute top-full left-0 right-0 bg-[var(--bg-surface)] border-b border-[var(--color-border-dim)] z-30 max-h-64 overflow-y-auto shadow-lg">
              {data.shots.map(group => {
                const isActive = activeGroup?.shot.id === group.shot.id
                const status = getVideoGroupStatus(group, isGenerating)
                return (
                  <button
                    key={group.shot.id}
                    onClick={() => { setActiveShotId(group.shot.id); setMobileSelectorOpen(false) }}
                    className={`w-full text-left px-4 py-2 border-b border-[var(--color-border-dim)] flex items-center gap-2 cursor-pointer transition-colors ${
                      isActive ? 'bg-[var(--color-primary-muted)]' : 'hover:bg-[var(--bg-elevated)]'
                    }`}
                  >
                    <span className="w-5 h-5 rounded-[var(--radius-sm)] flex items-center justify-center text-[10px] font-bold bg-[var(--bg-panel)] text-[var(--color-text-muted)]">{group.shot.shotNo}</span>
                    <span className="text-sm text-[var(--color-text-primary)] truncate">{group.shot.shotName || `镜头 ${group.shot.shotNo}`}</span>
                    <span className="ml-auto text-[10px] text-[var(--color-text-muted)]">{STATUS_LABELS[status]}</span>
                  </button>
                )
              })}
            </div>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {activeGroup ? (
          <ShotVideoReview
            group={activeGroup}
            isConfirmed={data.allConfirmed}
            isGenerating={isGenerating}
            projectId={projectId}
            episodeId={episodeId}
            onRefresh={refreshData}
          />
        ) : (
          <div className="flex items-center justify-center h-full text-[var(--color-text-muted)]">
            选择一个镜头查看视频
          </div>
        )}
      </div>

      <ShotVideoRightPanel
        projectId={projectId}
        episodeId={episodeIdFromData}
        shots={data.shots}
        allConfirmed={data.allConfirmed}
        isGenerating={isGenerating}
        onGenerate={handleGenerate}
        onBatchCheck={handleBatchCheck}
      />
    </div>
  )
}
