/**
 * 分镜图页面 — Aurora Studio V3
 *
 * 布局：镜头导航(左) | 图片审核区(中) | 右侧面板(右)
 * 数据源：GET /api/projects/:id/episodes/:episodeId/shot-images
 * 操作：生成图片、选择图片、确认图片、批量确认、重新生成
 *
 * 实时更新：SSE 订阅任务状态变更，自动刷新数据
 */
'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { AlertTriangle, Film, ChevronDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { useToast } from '@/components/ui/toast'
import { ShotImageNavigation } from '@/components/shot-images/shot-image-navigation'
import { ShotImageReview } from '@/components/shot-images/shot-image-review'
import { ShotImageRightPanel } from '@/components/shot-images/shot-image-right-panel'
import { getImageGroupStatus, STATUS_LABELS, type ShotImagesData } from '@/components/shot-images/shot-images-types'
import { useTaskSSE, type TaskEventType, type TaskUpdateEvent } from '@/lib/hooks/use-task-sse'

export default function ShotImagesPage() {
  const params = useParams()
  const router = useRouter()
  const projectId = params.id as string
  const episodeId = params.episodeId as string

  const [data, setData] = useState<ShotImagesData | null>(null)
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [batchConfirming, setBatchConfirming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [activeShotId, setActiveShotId] = useState<string | null>(null)
  const [batchConfirmOpen, setBatchConfirmOpen] = useState(false)
  const [generateConfirmOpen, setGenerateConfirmOpen] = useState(false)
  const [pendingShotImagesAfterScenes, setPendingShotImagesAfterScenes] = useState(false)
  // Mobile shot selector dropdown
  const [mobileSelectorOpen, setMobileSelectorOpen] = useState(false)

  const { addToast } = useToast()

  // Refresh data (for use after mutations)
  const refreshData = async () => {
    try {
      const res = await fetch(`/api/projects/${projectId}/episodes/${episodeId}/shot-images`)
      const json = await res.json()
      if (json.success) setData(json.data)
    } catch { /* silent */ }
  }

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      setError(null)
      try {
        const res = await fetch(`/api/projects/${projectId}/episodes/${episodeId}/shot-images`)
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

  // Derived: first shot as active
  const effectiveActiveShotId = activeShotId ?? (data?.shots?.length ? data.shots[0].shot.id : null)

  // SSE 实时更新 — 替代 setInterval polling
  useTaskSSE(projectId, {
    onTaskUpdate: (type: TaskEventType, payload: TaskUpdateEvent) => {
      if (payload.taskType === 'GENERATE_SCENE_REFERENCES') {
        if (type === 'task.completed') {
          addToast({ type: 'success', title: '场景参考图生成完成' })
          if (pendingShotImagesAfterScenes) {
            setPendingShotImagesAfterScenes(false)
            createShotImageTask()
          }
        } else if (type === 'task.failed') {
          addToast({ type: 'error', title: '场景参考图生成失败', description: payload.errorMessage || '请重试' })
          setPendingShotImagesAfterScenes(false)
          setGenerating(false)
        }
      }

      if (payload.taskType === 'GENERATE_SHOT_IMAGES') {
        refreshData()
        if (type === 'task.completed') {
          addToast({ type: 'success', title: '分镜图生成完成' })
          setGenerating(false)
        } else if (type === 'task.failed') {
          addToast({ type: 'error', title: '生成失败', description: payload.errorMessage || '请重试' })
          setGenerating(false)
        }
      }
    },
    onSnapshot: () => {
      refreshData()
    },
  })

  // Derived
  const isGenerating = data?.projectStatus === 'SHOT_IMAGE_GENERATING' || generating
  const activeGroup = data?.shots.find(s => s.shot.id === effectiveActiveShotId) ?? data?.shots[0] ?? null
  const episodeIdFromData = data?.episodeId ?? episodeId

  // Actions
  const hasSceneReferences = async () => {
    const res = await fetch(`/api/projects/${projectId}/episodes/${episodeIdFromData}/scene-references`)
    const json = await res.json()
    if (!json.success) return false
    const scenes = json.data?.scenes || []
    return scenes.some((scene: { sceneImages?: Array<{ isConfirmed?: boolean; isSelected?: boolean }> }) =>
      scene.sceneImages?.some(img => img.isConfirmed && img.isSelected)
    )
  }

  const createShotImageTask = async () => {
    try {
      const res = await fetch(`/api/projects/${projectId}/episodes/${episodeIdFromData}/shot-images/generate`, { method: 'POST' })
      const json = await res.json()
      if (json.success) {
        addToast({ type: 'success', title: '分镜图生成任务已创建', description: 'Worker 将异步执行，SSE 自动推送状态' })
        await refreshData()
      } else {
        addToast({ type: 'error', title: '创建任务失败', description: json.error })
        setGenerating(false)
      }
    } catch {
      addToast({ type: 'error', title: '请求失败' })
      setGenerating(false)
    }
  }

  const createSceneReferenceTask = async () => {
    try {
      const res = await fetch(`/api/projects/${projectId}/episodes/${episodeIdFromData}/scene-references/generate`, { method: 'POST' })
      const json = await res.json()
      if (json.success) {
        setPendingShotImagesAfterScenes(true)
        addToast({ type: 'success', title: '场景参考图任务已创建' })
      } else if (res.status === 409) {
        setPendingShotImagesAfterScenes(true)
        addToast({ type: 'info', title: '场景参考图任务执行中' })
      } else {
        addToast({ type: 'error', title: '创建场景参考图任务失败', description: json.error })
        setGenerating(false)
      }
    } catch {
      addToast({ type: 'error', title: '请求失败' })
      setGenerating(false)
    }
  }

  const handleGenerate = async () => {
    setGenerating(true)
    try {
      if (await hasSceneReferences()) {
        await createShotImageTask()
      } else {
        await createSceneReferenceTask()
      }
    } catch {
      addToast({ type: 'error', title: '请求失败' })
      setGenerating(false)
    }
  }

  const handleBatchConfirm = async () => {
    setBatchConfirming(true)
    try {
      const res = await fetch(`/api/projects/${projectId}/episodes/${episodeIdFromData}/shot-images/batch-confirm`, { method: 'POST' })
      const json = await res.json()
      if (json.success) {
        addToast({ type: 'success', title: `已批量确认 ${json.data.confirmedCount} 张图片` })
        setBatchConfirmOpen(false)
        await refreshData()
      } else {
        addToast({ type: 'error', title: '批量确认失败', description: json.error })
      }
    } catch {
      addToast({ type: 'error', title: '请求失败' })
    } finally { setBatchConfirming(false) }
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
          <div key={i} className="flex gap-3">
            <div className="w-24 h-32 bg-[var(--bg-panel)] rounded-[var(--radius-lg)] animate-pulse" />
            <div className="flex-1 h-32 bg-[var(--bg-elevated)] border border-[var(--color-border-dim)] rounded-[var(--radius-lg)] animate-pulse" />
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
          <Film size={28} />
        </div>
        <h3 className="text-lg font-semibold text-[var(--color-text-primary)] mb-2">暂无分镜数据</h3>
        <p className="text-sm text-[var(--color-text-muted)] max-w-sm mb-6">
          请先完成分镜脚本确认，再进入分镜图生成
        </p>
        <Button variant="outline" size="sm" onClick={() => router.push(`/projects/${projectId}/episodes/${episodeId}/storyboard`)}>
          返回分镜脚本
        </Button>
      </div>
    )
  }

  return (
    <div className="flex min-w-0 flex-1 flex-col overflow-hidden md:flex-row">
      {/* Desktop: side navigation */}
      <div className="hidden md:block">
        <ShotImageNavigation
          shots={data.shots}
          isGenerating={isGenerating}
          activeShotId={activeGroup?.shot.id ?? null}
          onSelect={setActiveShotId}
        />
      </div>

      {/* Mobile: top shot selector */}
      <div className="w-full shrink-0 md:hidden">
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
                  {STATUS_LABELS[getImageGroupStatus(activeGroup, isGenerating)]}
                </span>
              )}
            </div>
            <ChevronDown size={14} className={`text-[var(--color-text-muted)] transition-transform ${mobileSelectorOpen ? 'rotate-180' : ''}`} />
          </button>
          {mobileSelectorOpen && (
            <div className="absolute top-full left-0 right-0 bg-[var(--bg-surface)] border-b border-[var(--color-border-dim)] z-30 max-h-64 overflow-y-auto shadow-lg">
              {data.shots.map(group => {
                const isActive = activeGroup?.shot.id === group.shot.id
                const status = getImageGroupStatus(group, isGenerating)
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

      <div className="min-w-0 flex-1 overflow-y-auto">
        {activeGroup ? (
          <ShotImageReview
            group={activeGroup}
            isConfirmed={data.allConfirmed}
            isGenerating={isGenerating}
            projectId={projectId}
            episodeId={episodeId}
            onRefresh={refreshData}
          />
        ) : (
          <div className="flex items-center justify-center h-full text-[var(--color-text-muted)]">
            选择一个镜头查看图片
          </div>
        )}
      </div>

      <ShotImageRightPanel
        projectId={projectId}
        episodeId={episodeIdFromData}
        shots={data.shots}
        allConfirmed={data.allConfirmed}
        projectStatus={data.projectStatus}
        isGenerating={isGenerating}
        onGenerate={() => setGenerateConfirmOpen(true)}
        onBatchConfirm={() => setBatchConfirmOpen(true)}
      />

      <ConfirmDialog
        open={generateConfirmOpen}
        onOpenChange={setGenerateConfirmOpen}
        variant="warning"
        title={data.shots.some((shot) => shot.images.length > 0) ? '生成缺失分镜图' : '生成全部分镜图'}
        description={`将为当前剧集 ${data.shots.length} 个镜头检查场景参考图，并创建真实豆包图片生成任务。已有确认图不会被删除，新的结果会作为候选追加；此操作会消耗真实 API 额度。`}
        confirmLabel={generating ? '创建中…' : '确认生成'}
        loading={generating}
        onConfirm={async () => {
          setGenerateConfirmOpen(false)
          await handleGenerate()
        }}
      />

      {/* Batch confirm dialog */}
      <ConfirmDialog
        open={batchConfirmOpen}
        onOpenChange={setBatchConfirmOpen}
        variant="warning"
        title="批量确认分镜图"
        description={`将自动为每个镜头选择最佳候选图片并确认。已确认的镜头保持不变，未选择的镜头将选取第一张候选图。确认后项目将进入视频生成阶段。`}
        confirmLabel={batchConfirming ? '确认中…' : '确认'}
        loading={batchConfirming}
        onConfirm={handleBatchConfirm}
      />
    </div>
  )
}
