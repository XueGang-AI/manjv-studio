/**
 * 分镜脚本页面 — Aurora Studio V3
 *
 * 布局：镜头列表(左) | 镜头详情(中) | 右侧面板(右)
 * 数据源：GET /api/projects/:id/episodes/:episodeId/storyboard
 * 操作：生成分镜、确认分镜、重新生成
 */
'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { useToast } from '@/components/ui/toast'
import { StoryboardShotList } from '@/components/storyboard/storyboard-shot-list'
import { StoryboardShotDetail } from '@/components/storyboard/storyboard-shot-detail'
import { StoryboardTimeline } from '@/components/storyboard/storyboard-timeline'
import { StoryboardRightPanel } from '@/components/storyboard/storyboard-right-panel'
import { StoryboardEmptyState, StoryboardGeneratingState } from '@/components/storyboard/storyboard-empty-state'
import { getTotalDuration, type EpisodeData, type ProjectData } from '@/components/storyboard/storyboard-types'

export default function StoryboardPage() {
  const params = useParams()
  const router = useRouter()
  const projectId = params.id as string
  const episodeId = params.episodeId as string

  const [episode, setEpisode] = useState<EpisodeData | null>(null)
  const [project, setProject] = useState<ProjectData | null>(null)
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [activeShotId, setActiveShotId] = useState<string | null>(null)
  const [confirmOpen, setConfirmOpen] = useState(false)

  const { addToast } = useToast()

  // Refresh data (for use after mutations)
  const refreshData = async () => {
    try {
      const projRes = await fetch(`/api/projects/${projectId}`)
      const projData = await projRes.json()
      if (projData.success) setProject(projData.data)

      const epsRes = await fetch(`/api/projects/${projectId}/episodes/${episodeId}/storyboard`)
      const epsData = await epsRes.json()
      if (epsData.success) setEpisode(epsData.data)
    } catch { /* silent */ }
  }

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      setError(null)
      try {
        const projRes = await fetch(`/api/projects/${projectId}`)
        const projData = await projRes.json()
        if (cancelled) return
        if (projData.success) setProject(projData.data)

        let resolvedId = episodeId
        if (/^\d+$/.test(episodeId) && projData.success) {
          const ep = projData.data.episodes?.find(
            (e: { episodeNo: number }) => e.episodeNo === parseInt(episodeId)
          )
          if (ep && ep.id !== episodeId) {
            router.replace(`/projects/${projectId}/episodes/${ep.id}/storyboard`)
            return
          }
          if (ep) resolvedId = ep.id
        }

        const epsRes = await fetch(`/api/projects/${projectId}/episodes/${resolvedId}/storyboard`)
        const epsData = await epsRes.json()
        if (cancelled) return
        if (epsData.success) setEpisode(epsData.data)
      } catch {
        if (!cancelled) setError('加载失败，请重试')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [projectId, episodeId, router])

  // Derived: first shot as active when data loads
  const effectiveActiveShotId = activeShotId ?? (episode?.shots?.length ? episode.shots[0].id : null)

  // Auto-refresh during generation
  useEffect(() => {
    if (project?.status !== 'STORYBOARD_GENERATING') return
    const interval = setInterval(async () => {
      try {
        const projRes = await fetch(`/api/projects/${projectId}`)
        const projData = await projRes.json()
        if (projData.success) setProject(projData.data)

        const epsRes = await fetch(`/api/projects/${projectId}/episodes/${episodeId}/storyboard`)
        const epsData = await epsRes.json()
        if (epsData.success) setEpisode(epsData.data)
      } catch { /* silently retry */ }
    }, 3000)
    return () => clearInterval(interval)
  }, [project?.status, projectId, episodeId])

  // Derived state
  const isGenerating = project?.status === 'STORYBOARD_GENERATING' || generating
  const hasStoryboard = episode && episode.shots.length > 0
  const isConfirmed = episode?.confirmed || project?.status === 'STORYBOARD_CONFIRMED'
  const activeShot = episode?.shots.find(s => s.id === effectiveActiveShotId) ?? episode?.shots[0] ?? null

  // Actions
  const handleGenerate = async () => {
    setGenerating(true); setError(null)
    try {
      const res = await fetch(`/api/projects/${projectId}/storyboard/generate`, { method: 'POST' })
      const data = await res.json()
      if (data.success) {
        if (data.data?.episode?.id) {
          router.push(`/projects/${projectId}/episodes/${data.data.episode.id}/storyboard`)
        }
        addToast({ type: 'success', title: '分镜脚本生成完成' })
        await refreshData()
      } else {
        setError(data.error || '生成失败')
        addToast({ type: 'error', title: '生成失败', description: data.error })
      }
    } catch {
      setError('请求失败，请重试')
      addToast({ type: 'error', title: '请求失败' })
    } finally { setGenerating(false) }
  }

  const handleConfirm = async () => {
    if (!episode) return
    setConfirming(true)
    try {
      const res = await fetch(`/api/projects/${projectId}/episodes/${episode.id}/storyboard/confirm`, { method: 'POST' })
      const data = await res.json()
      if (data.success) {
        addToast({ type: 'success', title: '分镜脚本已确认' })
        setConfirmOpen(false)
        await refreshData()
      } else {
        addToast({ type: 'error', title: '确认失败', description: data.error })
      }
    } catch {
      addToast({ type: 'error', title: '确认失败' })
    } finally { setConfirming(false) }
  }

  // ─── Render ──────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-8 h-8 rounded-[var(--radius-md)] bg-[var(--bg-panel)] animate-pulse" />
          <div className="h-6 w-32 bg-[var(--bg-panel)] rounded animate-pulse" />
        </div>
        <div className="h-10 w-full bg-[var(--bg-panel)] rounded animate-pulse" />
        {[1, 2, 3].map(i => (
          <div key={i} className="h-24 bg-[var(--bg-elevated)] border border-[var(--color-border-dim)] rounded-[var(--radius-lg)] animate-pulse" />
        ))}
      </div>
    )
  }

  if (error && !hasStoryboard) {
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

  return (
    <div className="flex flex-1 overflow-hidden">
      <StoryboardShotList
        shots={episode?.shots ?? []}
        isConfirmed={!!isConfirmed}
        activeShotId={activeShot?.id ?? null}
        totalDuration={getTotalDuration(episode?.shots ?? [])}
        onSelect={setActiveShotId}
      />

      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="flex-1 flex overflow-hidden">
          <div className="flex-1 overflow-y-auto">
            {isGenerating ? (
              <StoryboardGeneratingState />
            ) : !hasStoryboard ? (
              <StoryboardEmptyState onGenerate={handleGenerate} isGenerating={generating} />
            ) : activeShot ? (
              <StoryboardShotDetail shot={activeShot} isConfirmed={!!isConfirmed} />
            ) : (
              <div className="flex items-center justify-center h-full text-[var(--color-text-muted)]">
                选择一个镜头查看详情
              </div>
            )}
          </div>

          <StoryboardRightPanel
            project={project}
            episode={episode}
            isConfirmed={!!isConfirmed}
            hasStoryboard={!!hasStoryboard}
            onGenerate={handleGenerate}
            onConfirm={() => setConfirmOpen(true)}
            isGenerating={isGenerating}
            confirming={confirming}
          />
        </div>

        {hasStoryboard && episode && (
          <StoryboardTimeline
            shots={episode.shots}
            isConfirmed={!!isConfirmed}
            activeShotId={activeShot?.id ?? null}
            totalDuration={episode.duration ?? getTotalDuration(episode.shots)}
            onSelect={setActiveShotId}
          />
        )}
      </div>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        variant="warning"
        title="确认分镜脚本"
        description={`确认后将锁定当前 ${episode?.shots.length ?? 0} 个镜头的分镜内容，进入分镜图生成阶段。确认后仍可在版本历史中回滚。`}
        confirmLabel={confirming ? '确认中…' : '确认分镜'}
        loading={confirming}
        onConfirm={handleConfirm}
      />
    </div>
  )
}
