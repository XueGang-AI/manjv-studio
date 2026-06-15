/**
 * 分镜图页面 — Aurora Studio V3
 *
 * 布局：镜头导航(左) | 图片审核区(中) | 右侧面板(右)
 * 数据源：GET /api/projects/:id/episodes/:episodeId/shot-images
 * 操作：生成图片、选择图片、确认图片、批量确认、重新生成
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

  // Auto-refresh during generation
  useEffect(() => {
    if (data?.projectStatus !== 'SHOT_IMAGE_GENERATING') return
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/projects/${projectId}/episodes/${episodeId}/shot-images`)
        const json = await res.json()
        if (json.success) setData(json.data)
      } catch { /* silently retry */ }
    }, 3000)
    return () => clearInterval(interval)
  }, [data?.projectStatus, projectId, episodeId])

  // Derived
  const isGenerating = data?.projectStatus === 'SHOT_IMAGE_GENERATING' || generating
  const activeGroup = data?.shots.find(s => s.shot.id === effectiveActiveShotId) ?? data?.shots[0] ?? null
  const episodeIdFromData = data?.episodeId ?? episodeId

  // Actions
  const handleGenerate = async () => {
    setGenerating(true)
    try {
      const res = await fetch(`/api/projects/${projectId}/episodes/${episodeIdFromData}/shot-images/generate`, { method: 'POST' })
      const json = await res.json()
      if (json.success) {
        addToast({ type: 'success', title: '分镜图生成完成' })
        await refreshData()
      } else {
        addToast({ type: 'error', title: '生成失败', description: json.error })
      }
    } catch {
      addToast({ type: 'error', title: '请求失败' })
    } finally { setGenerating(false) }
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
    <div className="flex flex-1 overflow-hidden">
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

      <div className="flex-1 overflow-y-auto">
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
        onGenerate={handleGenerate}
        onBatchConfirm={() => setBatchConfirmOpen(true)}
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
