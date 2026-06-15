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
import Link from 'next/link'
import {
  Film, Check, Sparkles, RefreshCw, ArrowRight,
  ArrowLeft, Clock,
  Zap, Eye,
  Wand2, CheckCircle2, AlertTriangle,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { ProgressBar } from '@/components/ui/progress-bar'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { useToast } from '@/components/ui/toast'
import { cn } from '@/lib/utils'

// ─── Types (aligned with Prisma + API) ───────────────────────────────

interface ImagePromptData {
  id: string; zhPrompt: string | null; enPrompt: string | null
  negativePrompt: string | null; confirmed: boolean
}

interface VideoPromptData {
  id: string; prompt: string | null; duration: number | null
  motionStrength: string | null; negativePrompt: string | null; confirmed: boolean
}

interface ShotData {
  id: string; shotNo: number; shotName: string | null
  startTime: number | null; endTime: number | null; sceneTime: string | null
  location: string | null; characters: unknown; action: string | null
  camera: Record<string, unknown>; visual: Record<string, unknown>
  emotion: string | null; sfx: string | null; bgm: string | null
  dialogue: string | null; purpose: string | null
  confirmed: boolean; imagePrompts: ImagePromptData[]; videoPrompts: VideoPromptData[]
}

interface VoiceScriptData {
  id: string; content: Record<string, unknown>; confirmed: boolean
}

interface EpisodeData {
  id: string; episodeNo: number; title: string | null; duration: number | null
  coreTask: string | null; emotionCurve: string | null
  openingHook: string | null; endingHook: string | null
  version: number; confirmed: boolean
  shots: ShotData[]; voiceScripts: VoiceScriptData[]
}

interface ProjectData {
  id: string; projectName: string; storyType: string | null; artStyle: string | null
  modelProvider: string; status: string; episodeDuration: number; aspectRatio: string
}

// ─── Helpers ─────────────────────────────────────────────────────────

function getShotDuration(shot: ShotData): number {
  return Math.max(0, (shot.endTime ?? 0) - (shot.startTime ?? 0))
}

function getTotalDuration(shots: ShotData[]): number {
  return shots.reduce((sum, s) => sum + getShotDuration(s), 0)
}

function getShotStatus(shot: ShotData, isConfirmed: boolean): 'confirmed' | 'pending' {
  return isConfirmed || shot.confirmed ? 'confirmed' : 'pending'
}

// ─── Main Page ───────────────────────────────────────────────────────

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

  // Active shot selection
  const [activeShotId, setActiveShotId] = useState<string | null>(null)

  // Confirm dialog
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

  // Set first shot as active when data loads (derived, not effect)
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

  // Error state (no project/episode data at all)
  if (error && !hasStoryboard) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center py-20 text-center p-6">
        <div className="w-16 h-16 rounded-[var(--radius-xl)] bg-[var(--color-danger-muted)] flex items-center justify-center mb-5 text-[var(--color-danger)]">
          <AlertTriangle size={28} />
        </div>
        <h3 className="text-lg font-semibold text-[var(--color-text-primary)] mb-2">加载失败</h3>
        <p className="text-sm text-[var(--color-text-muted)] max-w-sm mb-6">{error}</p>
        <Button variant="outline" size="sm" onClick={fetchProjects}>重试</Button>
      </div>
    )
  }

  // ─── Three-panel storyboard layout ─────────────────────────────
  return (
    <div className="flex flex-1 overflow-hidden">
      {/* Left: Shot list */}
      <ShotListPanel
        shots={episode?.shots ?? []}
        isConfirmed={!!isConfirmed}
        activeShotId={activeShot?.id ?? null}
        totalDuration={getTotalDuration(episode?.shots ?? [])}
        onSelect={setActiveShotId}
      />

      {/* Center: Shot detail + timeline */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="flex-1 flex overflow-hidden">
          {/* Shot detail area */}
          <div className="flex-1 overflow-y-auto">
            {isGenerating ? (
              <GeneratingState />
            ) : !hasStoryboard ? (
              <EmptyState onGenerate={handleGenerate} isGenerating={generating} />
            ) : activeShot ? (
              <ShotDetail
                shot={activeShot}
                isConfirmed={!!isConfirmed}
              />
            ) : (
              <div className="flex items-center justify-center h-full text-[var(--color-text-muted)]">
                选择一个镜头查看详情
              </div>
            )}
          </div>

          {/* Right panel */}
          <RightPanel
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

        {/* Timeline bar */}
        {hasStoryboard && episode && (
          <TimelineBar
            shots={episode.shots}
            isConfirmed={!!isConfirmed}
            activeShotId={activeShot?.id ?? null}
            totalDuration={episode.duration ?? getTotalDuration(episode.shots)}
            onSelect={setActiveShotId}
          />
        )}
      </div>

      {/* Confirm dialog */}
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

  // Fallback error helper
  function fetchProjects() {
    setError(null)
    setLoading(true)
    refreshData()
  }
}

// ─── Shot List Panel ─────────────────────────────────────────────────

function ShotListPanel({ shots, isConfirmed, activeShotId, totalDuration, onSelect }: {
  shots: ShotData[]; isConfirmed: boolean; activeShotId: string | null
  totalDuration: number; onSelect: (id: string) => void
}) {
  return (
    <div className="w-56 border-r border-[var(--color-border-dim)] bg-[var(--bg-surface)] flex flex-col overflow-hidden shrink-0">
      <div className="px-3 py-3 border-b border-[var(--color-border-dim)] flex items-center justify-between">
        <h3 className="text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wider">镜头列表</h3>
        <Badge variant="default">{shots.length}</Badge>
      </div>
      <div className="flex-1 overflow-y-auto">
        {shots.map(shot => {
          const isActive = activeShotId === shot.id
          const status = getShotStatus(shot, isConfirmed)
          return (
            <button
              key={shot.id}
              onClick={() => onSelect(shot.id)}
              className={cn(
                'w-full text-left px-3 py-2.5 border-b border-[var(--color-border-dim)] transition-colors cursor-pointer',
                isActive ? 'bg-[var(--color-primary-muted)]' : 'hover:bg-[var(--bg-elevated)]'
              )}
              style={isActive ? { borderLeft: '2px solid', borderImage: 'var(--gradient-aurora) 1' } : { borderLeft: '2px solid transparent' }}
              aria-label={`镜头 ${shot.shotNo}: ${shot.shotName}`}
            >
              <div className="flex items-center gap-2 mb-0.5">
                <span className={cn(
                  'w-5 h-5 rounded-[var(--radius-sm)] flex items-center justify-center text-[10px] font-bold',
                  isActive ? 'text-white' : 'bg-[var(--bg-panel)] text-[var(--color-text-muted)]'
                )} style={isActive ? { background: 'var(--gradient-aurora)' } : {}}>
                  {shot.shotNo}
                </span>
                <span className="text-sm text-[var(--color-text-primary)] font-medium truncate">{shot.shotName || `镜头 ${shot.shotNo}`}</span>
                {status === 'confirmed' && <Check size={10} className="text-[var(--color-success)] ml-auto" />}
                {status === 'pending' && <Clock size={10} className="text-[var(--color-text-muted)] ml-auto" />}
              </div>
              <div className="flex items-center gap-2 text-[10px] text-[var(--color-text-muted)] ml-7">
                <span className="font-mono">{shot.startTime?.toFixed(0)}-{shot.endTime?.toFixed(0)}s</span>
                {shot.location && <><span>·</span><span className="truncate">{shot.location}</span></>}
              </div>
            </button>
          )
        })}
      </div>
      <div className="px-3 py-2 border-t border-[var(--color-border-dim)] text-[10px] text-[var(--color-text-muted)] flex items-center justify-between">
        <span>总时长</span>
        <span className="font-mono">{totalDuration.toFixed(0)}s</span>
      </div>
    </div>
  )
}

// ─── Shot Detail ─────────────────────────────────────────────────────

function ShotDetail({ shot, isConfirmed }: {
  shot: ShotData; isConfirmed: boolean
}) {
  const duration = getShotDuration(shot)
  const imgP = shot.imagePrompts?.[0]
  const vidP = shot.videoPrompts?.[0]

  const cameraFields = [
    { l: '景别', v: String(shot.camera?.shot_size || '') },
    { l: '角度', v: String(shot.camera?.angle || '') },
    { l: '运镜', v: String(shot.camera?.movement || '') },
  ]
  const visualFields = [
    { l: '光影', v: String(shot.visual?.lighting || '') },
    { l: '色调', v: String(shot.visual?.color_tone || '') },
    { l: '特效', v: String(shot.visual?.special_effect || shot.visual?.vfx || '') },
  ]
  const allFields = [...cameraFields, ...visualFields].filter(f => f.v)

  return (
    <div className="p-6 space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="w-8 h-8 rounded-[var(--radius-md)] flex items-center justify-center text-sm font-bold text-white" style={{ background: 'var(--gradient-aurora)' }}>
              {shot.shotNo}
            </span>
            <h2 className="text-xl font-bold text-[var(--color-text-primary)]">{shot.shotName || `镜头 ${shot.shotNo}`}</h2>
            <Badge variant={shot.confirmed || isConfirmed ? 'success' : 'warning'} dot>
              {shot.confirmed || isConfirmed ? '已确认' : '待确认'}
            </Badge>
          </div>
          <div className="flex items-center gap-3 text-xs text-[var(--color-text-muted)] ml-10">
            <span className="font-mono">{shot.startTime?.toFixed(0)}-{shot.endTime?.toFixed(0)}s ({duration}s)</span>
            {shot.location && <><span>·</span><span>{shot.location}</span></>}
            {shot.emotion && <><span>·</span><span>情绪：{shot.emotion}</span></>}
          </div>
        </div>
      </div>

      {/* Action description */}
      {shot.action && (
        <Card className="p-4">
          <div className="text-[10px] font-semibold text-[var(--color-primary)] uppercase tracking-wider mb-2">动作描述</div>
          <p className="text-sm text-[var(--color-text-secondary)] leading-relaxed">{shot.action}</p>
        </Card>
      )}

      {/* Dialogue highlight */}
      {shot.dialogue && (
        <div className="rounded-[var(--radius-md)] p-3 bg-[var(--color-warning-muted)]">
          <div className="text-[10px] font-semibold text-[var(--color-warning)] uppercase tracking-wider mb-1">台词</div>
          <p className="text-sm text-[var(--color-text-primary)] italic">「{shot.dialogue}」</p>
        </div>
      )}

      {/* Prompts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {imgP && (imgP.enPrompt || imgP.zhPrompt) && (
          <Card className="p-4">
            <div className="text-[10px] font-semibold text-[var(--color-primary)] uppercase tracking-wider mb-2">图片 Prompt</div>
            <p className="text-xs text-[var(--color-text-secondary)] leading-relaxed max-h-32 overflow-y-auto">
              {imgP.enPrompt || imgP.zhPrompt}
            </p>
            {imgP.negativePrompt && (
              <div className="mt-3 pt-2 border-t border-[var(--color-border-dim)] text-[10px] text-[var(--color-text-muted)] flex items-center gap-2">
                <span>Negative: {imgP.negativePrompt.substring(0, 80)}…</span>
              </div>
            )}
          </Card>
        )}
        {vidP && vidP.prompt && (
          <Card className="p-4">
            <div className="text-[10px] font-semibold text-[var(--color-accent-cyan)] uppercase tracking-wider mb-2">视频 Prompt</div>
            <p className="text-xs text-[var(--color-text-secondary)] leading-relaxed max-h-32 overflow-y-auto">
              {vidP.prompt}
            </p>
            <div className="mt-2 text-[10px] text-[var(--color-text-muted)]">
              {vidP.duration ? `${vidP.duration}s` : ''} {vidP.motionStrength ? `| motion: ${vidP.motionStrength}` : ''}
            </div>
            {shot.dialogue && (
              <div className="mt-3 pt-2 border-t border-[var(--color-border-dim)]">
                <div className="text-[10px] font-semibold text-[var(--color-warning)] uppercase tracking-wider mb-1">台词</div>
                <p className="text-sm text-[var(--color-text-primary)] italic bg-[var(--color-warning-muted)] px-2 py-1 rounded-[var(--radius-sm)]">「{shot.dialogue}」</p>
              </div>
            )}
          </Card>
        )}
      </div>

      {/* Camera & Visual details */}
      {allFields.length > 0 && (
        <Card className="p-4">
          <h4 className="text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wider mb-3">镜头详情</h4>
          <div className="grid grid-cols-3 md:grid-cols-6 gap-3 text-xs">
            {allFields.map(f => (
              <div key={f.l} className="bg-[var(--bg-panel)] rounded-[var(--radius-sm)] px-2.5 py-2">
                <div className="text-[10px] text-[var(--color-text-muted)]">{f.l}</div>
                <div className="text-[var(--color-text-secondary)] font-medium mt-0.5">{f.v}</div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Additional details */}
      <Card className="p-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
          {shot.sceneTime && <DetailField label="场景时间" value={shot.sceneTime} />}
          {shot.location && <DetailField label="地点" value={shot.location} />}
          {shot.emotion && <DetailField label="情绪" value={shot.emotion} />}
          {shot.sfx && <DetailField label="音效" value={shot.sfx} />}
          {shot.bgm && <DetailField label="BGM" value={shot.bgm} />}
          {shot.purpose && <DetailField label="用途" value={shot.purpose} />}
          {Array.isArray(shot.characters) && shot.characters.length > 0 && (
            <DetailField label="出场角色" value={shot.characters.join('、')} />
          )}
        </div>
      </Card>
    </div>
  )
}

function DetailField({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-[var(--bg-panel)] rounded-[var(--radius-sm)] px-2.5 py-2">
      <div className="text-[10px] text-[var(--color-text-muted)]">{label}</div>
      <div className="text-[var(--color-text-secondary)] font-medium mt-0.5 truncate">{value || '-'}</div>
    </div>
  )
}

// ─── Empty & Generating States ───────────────────────────────────────

function EmptyState({ onGenerate, isGenerating }: { onGenerate: () => void; isGenerating: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center h-full text-center p-6">
      <div className="w-16 h-16 rounded-[var(--radius-xl)] bg-[var(--color-primary-muted)] flex items-center justify-center mb-5 text-[var(--color-primary)]">
        <Film size={28} />
      </div>
      <h3 className="text-lg font-semibold text-[var(--color-text-primary)] mb-2">尚未生成分镜脚本</h3>
      <p className="text-sm text-[var(--color-text-muted)] max-w-sm mb-6">
        AI 将结合故事方案、角色设定和电影运镜素材库，生成完整分镜脚本
      </p>
      <Button variant="aurora" icon={<Wand2 size={16} />} onClick={onGenerate} disabled={isGenerating}>
        {isGenerating ? '生成中…' : '生成分镜脚本'}
      </Button>
    </div>
  )
}

function GeneratingState() {
  return (
    <div className="flex flex-col items-center justify-center h-full text-center p-6">
      <div className="w-16 h-16 rounded-[var(--radius-xl)] bg-[var(--color-accent-cyan-muted)] flex items-center justify-center mb-5 text-[var(--color-accent-cyan)] animate-pulse-glow">
        <Sparkles size={28} />
      </div>
      <h3 className="text-lg font-semibold text-[var(--color-text-primary)] mb-2">AI 正在生成分镜脚本</h3>
      <p className="text-sm text-[var(--color-text-muted)] max-w-sm">
        分析剧情、设计镜头语言、生成图片和视频 Prompt…
      </p>
      <div className="mt-6 w-64">
        <ProgressBar value={60} variant="aurora" size="md" />
      </div>
    </div>
  )
}

// ─── Right Panel ─────────────────────────────────────────────────────

function RightPanel({ project, episode, isConfirmed, hasStoryboard, onGenerate, onConfirm, isGenerating, confirming }: {
  project: ProjectData | null; episode: EpisodeData | null
  isConfirmed: boolean; hasStoryboard: boolean
  onGenerate: () => void; onConfirm: () => void
  isGenerating: boolean; confirming: boolean
}) {
  const [activeTab, setActiveTab] = useState<'overview' | 'actions'>('overview')
  const confirmedShots = episode?.shots.filter(s => s.confirmed).length ?? 0
  const totalShots = episode?.shots.length ?? 0

  return (
    <div className="w-80 border-l border-[var(--color-border-dim)] bg-[var(--bg-surface)] flex flex-col overflow-hidden shrink-0">
      {/* Tabs */}
      <div className="flex border-b border-[var(--color-border-dim)]">
        {([
          { key: 'overview' as const, label: '概览', icon: <Eye size={12} /> },
          { key: 'actions' as const, label: '操作', icon: <Zap size={12} /> },
        ]).map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={cn(
              'flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-medium transition-colors cursor-pointer',
              activeTab === tab.key ? 'text-[var(--color-primary)]' : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]'
            )}
          >
            {tab.icon}{tab.label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {activeTab === 'overview' && (
          <>
            {/* Project info */}
            {project && (
              <Card className="p-3">
                <h4 className="text-xs font-semibold text-[var(--color-text-primary)] mb-2">项目信息</h4>
                {[
                  { l: '名称', v: project.projectName },
                  { l: '类型', v: project.storyType || '-' },
                  { l: '画风', v: project.artStyle || '-' },
                  { l: '时长', v: `${project.episodeDuration}s/集` },
                  { l: '模型', v: project.modelProvider === 'ark' ? '豆包' : 'Agnes' },
                  { l: '比例', v: project.aspectRatio },
                ].map(i => (
                  <div key={i.l} className="flex justify-between text-xs py-1.5 border-b border-[var(--color-border-dim)] last:border-0">
                    <span className="text-[var(--color-text-muted)]">{i.l}</span>
                    <span className="text-[var(--color-text-secondary)]">{i.v}</span>
                  </div>
                ))}
              </Card>
            )}

            {/* Episode info */}
            {episode && (
              <Card className="p-3">
                <h4 className="text-xs font-semibold text-[var(--color-text-primary)] mb-2">剧集信息</h4>
                {[
                  { l: '集数', v: `第 ${episode.episodeNo} 集` },
                  { l: '标题', v: episode.title || '-' },
                  { l: '时长', v: episode.duration ? `${episode.duration}s` : '-' },
                  { l: '镜头数', v: `${totalShots} 个` },
                  { l: '已确认', v: `${confirmedShots}/${totalShots}` },
                  { l: '版本', v: `v${episode.version}` },
                ].map(i => (
                  <div key={i.l} className="flex justify-between text-xs py-1.5 border-b border-[var(--color-border-dim)] last:border-0">
                    <span className="text-[var(--color-text-muted)]">{i.l}</span>
                    <span className="text-[var(--color-text-primary)] font-mono">{i.v}</span>
                  </div>
                ))}
                {/* Confirmation progress */}
                {totalShots > 0 && (
                  <div className="mt-3">
                    <ProgressBar value={(confirmedShots / totalShots) * 100} variant={confirmedShots === totalShots ? 'success' : 'aurora'} size="sm" />
                  </div>
                )}
              </Card>
            )}

            {/* Episode hooks */}
            {episode && (episode.openingHook || episode.endingHook) && (
              <Card className="p-3">
                <h4 className="text-xs font-semibold text-[var(--color-text-primary)] mb-2">叙事钩子</h4>
                {episode.openingHook && (
                  <div className="text-xs mb-2">
                    <span className="text-[var(--color-warning)] font-medium">🎣 开场：</span>
                    <span className="text-[var(--color-text-secondary)]">{episode.openingHook}</span>
                  </div>
                )}
                {episode.endingHook && (
                  <div className="text-xs">
                    <span className="text-[var(--color-danger)] font-medium">🔮 结尾：</span>
                    <span className="text-[var(--color-text-secondary)]">{episode.endingHook}</span>
                  </div>
                )}
              </Card>
            )}

            {/* Core task & emotion */}
            {episode && (episode.coreTask || episode.emotionCurve) && (
              <Card className="p-3">
                {episode.coreTask && (
                  <div className="text-xs mb-2">
                    <span className="text-[var(--color-text-muted)]">核心任务：</span>
                    <span className="text-[var(--color-text-secondary)]">{episode.coreTask}</span>
                  </div>
                )}
                {episode.emotionCurve && (
                  <div className="text-xs">
                    <span className="text-[var(--color-text-muted)]">情绪曲线：</span>
                    <span className="text-[var(--color-text-secondary)]">{episode.emotionCurve}</span>
                  </div>
                )}
              </Card>
            )}
          </>
        )}

        {activeTab === 'actions' && (
          <>
            {/* Generate / Regenerate */}
            {hasStoryboard ? (
              <>
                {!isConfirmed && (
                  <>
                    <Card className="p-3">
                      <h4 className="text-xs font-semibold text-[var(--color-text-primary)] mb-2">重新生成</h4>
                      <p className="text-[11px] text-[var(--color-text-muted)] mb-3">将覆盖当前分镜脚本，重新由 AI 生成</p>
                      <Button variant="outline" size="sm" className="w-full" icon={<RefreshCw size={12} />} onClick={onGenerate} disabled={isGenerating}>
                        {isGenerating ? '生成中…' : '重新生成'}
                      </Button>
                    </Card>
                    <Card className="p-3 aurora-border">
                      <h4 className="text-xs font-semibold text-[var(--color-text-primary)] mb-2 flex items-center gap-1.5">
                        <CheckCircle2 size={12} className="text-[var(--color-success)]" />确认分镜
                      </h4>
                      <p className="text-[11px] text-[var(--color-text-muted)] mb-3">确认后锁定当前镜头，进入分镜图生成阶段</p>
                      <Button variant="aurora" size="sm" className="w-full" icon={<Check size={12} />} onClick={onConfirm} disabled={confirming}>
                        {confirming ? '确认中…' : '确认分镜'}
                      </Button>
                    </Card>
                  </>
                )}
                {isConfirmed && (
                  <Card className="p-3">
                    <div className="flex items-center gap-2 mb-3">
                      <CheckCircle2 size={16} className="text-[var(--color-success)]" />
                      <span className="text-sm font-semibold text-[var(--color-text-primary)]">分镜已确认</span>
                    </div>
                    <p className="text-[11px] text-[var(--color-text-muted)] mb-3">可以进入分镜图生成阶段</p>
                    <Link href={`/projects/${project?.id}/episodes/${episode?.id ?? ''}/shot-images`}>
                      <Button variant="aurora" size="sm" className="w-full" icon={<ArrowRight size={12} />}>
                        进入分镜图
                      </Button>
                    </Link>
                  </Card>
                )}
              </>
            ) : (
              <Card className="p-3">
                <h4 className="text-xs font-semibold text-[var(--color-text-primary)] mb-2">生成分镜脚本</h4>
                <p className="text-[11px] text-[var(--color-text-muted)] mb-3">AI 将结合故事方案和角色设定生成完整分镜</p>
                <Button variant="aurora" size="sm" className="w-full" icon={<Sparkles size={12} />} onClick={onGenerate} disabled={isGenerating}>
                  {isGenerating ? '生成中…' : '开始生成'}
                </Button>
              </Card>
            )}

            {/* Navigation */}
            <Card className="p-3">
              <h4 className="text-xs font-semibold text-[var(--color-text-muted)] mb-3">导航</h4>
              <div className="space-y-2">
                <Link href={`/projects/${project?.id}/character-images`} className="flex items-center gap-2 text-xs text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] transition-colors">
                  <ArrowLeft size={12} />返回角色图
                </Link>
                {isConfirmed && (
                  <Link href={`/projects/${project?.id}/episodes/${episode?.id ?? ''}/shot-images`} className="flex items-center gap-2 text-xs text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] transition-colors">
                    进入分镜图 <ArrowRight size={12} />
                  </Link>
                )}
              </div>
            </Card>
          </>
        )}
      </div>
    </div>
  )
}

// ─── Timeline Bar ────────────────────────────────────────────────────

function TimelineBar({ shots, isConfirmed, activeShotId, totalDuration, onSelect }: {
  shots: ShotData[]; isConfirmed: boolean; activeShotId: string | null
  totalDuration: number; onSelect: (id: string) => void
}) {
  return (
    <div className="border-t border-[var(--color-border-dim)] bg-[var(--bg-surface)] px-6 py-3 shrink-0">
      <div className="flex items-center gap-2 mb-2">
        <Film size={14} className="text-[var(--color-primary)]" />
        <span className="text-xs font-semibold text-[var(--color-text-muted)]">时间线</span>
        <span className="text-[10px] text-[var(--color-text-muted)] font-mono">0s — {totalDuration}s</span>
      </div>
      <div className="flex gap-0.5">
        {shots.map(shot => {
          const w = totalDuration > 0 ? ((getShotDuration(shot) / totalDuration) * 100) : 0
          const isActive = activeShotId === shot.id
          const status = getShotStatus(shot, isConfirmed)
          return (
            <button
              key={shot.id}
              onClick={() => onSelect(shot.id)}
              className={cn(
                'h-6 rounded-[var(--radius-sm)] flex items-center justify-center text-[10px] font-bold transition-all cursor-pointer',
                status === 'confirmed' && !isActive && 'bg-[var(--color-success)]/30 text-[var(--color-success)]',
                status === 'confirmed' && isActive && 'bg-[var(--color-success)] text-white',
                status === 'pending' && isActive && 'text-white',
                status === 'pending' && !isActive && 'bg-[var(--bg-panel)] text-[var(--color-text-muted)]'
              )}
              style={isActive && status === 'pending' ? { width: `${w}%`, background: 'var(--gradient-aurora)' } : { width: `${w}%` }}
              title={`${shot.shotName || `镜头 ${shot.shotNo}`} (${getShotDuration(shot)}s)`}
            >
              {shot.shotNo}
            </button>
          )
        })}
      </div>
    </div>
  )
}
