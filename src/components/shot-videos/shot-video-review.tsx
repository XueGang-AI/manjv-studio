'use client'

import { useState, useEffect, useRef } from 'react'
import { Check, RefreshCw, Video, Sparkles } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { useToast } from '@/components/ui/toast'
import { cn } from '@/lib/utils'
import { getVideoGroupStatus, STATUS_LABELS, isRemotePending, isRemoteTerminal, type ShotVideoGroup, type ShotVideoItem } from './shot-videos-types'
import { ShotVideoPlayer } from './shot-video-player'
import { AIPromptBox } from '@/components/ai/ai-prompt-box'
import { AIConsoleSheet } from '@/components/ai/ai-console-sheet'
import { useAIPromptBox } from '@/components/ai/use-ai-prompt-box'
import { RegenerationIssuePanel, type RegenerationIssueType } from '@/components/regeneration/regeneration-issue-panel'

interface ShotVideoReviewProps {
  group: ShotVideoGroup
  isConfirmed: boolean
  isGenerating: boolean
  projectId: string
  episodeId: string
  onRefresh: () => void
}

function createClientRequestId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

export function ShotVideoReview({ group, isConfirmed, isGenerating, projectId, episodeId, onRefresh }: ShotVideoReviewProps) {
  const { shot, videos, selectedVideo, confirmed } = group
  const status = getVideoGroupStatus(group, isGenerating)
  const { addToast } = useToast()

  // 项目 modelProvider（只读展示，后端按此选模型）。一次获取，projectId 稳定。
  const [modelProvider, setModelProvider] = useState<string>('ark')
  useEffect(() => {
    let cancelled = false
    fetch(`/api/projects/${projectId}`)
      .then(r => r.json())
      .then(d => { if (!cancelled && d.success && d.data?.modelProvider) setModelProvider(d.data.modelProvider) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [projectId])

  // 移动端 AI 控制台 Sheet
  const [aiSheetOpen, setAiSheetOpen] = useState(false)
  const aiEntryBtnRef = useRef<HTMLButtonElement>(null)

  // Active video tab (for multiple candidates)
  const [activeVideoId, setActiveVideoId] = useState<string | null>(null)

  // Confirm dialog
  const [confirmTarget, setConfirmTarget] = useState<ShotVideoItem | null>(null)
  const [confirming, setConfirming] = useState(false)

  // Regenerate
  const [regenerating, setRegenerating] = useState(false)
  const [issueTypes, setIssueTypes] = useState<RegenerationIssueType[]>([])
  const [fixNote, setFixNote] = useState('')

  // Check task
  const [checkingTaskId, setCheckingTaskId] = useState<string | null>(null)

  // Determine current video to display
  const displayVideo = activeVideoId
    ? videos.find(v => v.id === activeVideoId) ?? null
    : selectedVideo
      ? videos.find(v => v.id === selectedVideo.id) ?? null
      : videos[0] ?? null

  // Has multiple candidates
  const hasMultipleVideos = videos.length > 1

  // ─── AI Prompt 控制台状态（提升到 review，桌面与移动共享同一份） ───
  // 当前尝试 = 最新 ShotVideo（API 按 createdAt desc 返回，videos[0] 为最新）。
  // 候选版本模式：新尝试作为候选追加，旧视频保留。
  // 状态绑定当前尝试（videos[0]）的 remoteStatus；hasOutput = 是否有可用历史视频
  // （选中或任意有 videoUrl 的终态视频），与当前尝试独立。
  // error/running 优先于历史 hasOutput：当前尝试失败时显示失败，但旧视频仍可播放。
  const currentAttempt = videos[0] ?? null
  const hasUsableOutput = videos.some(
    v => v.videoUrl && (!v.remoteTaskId || isRemoteTerminal(v.remoteStatus))
  )
  const aiVideoData = {
    prompt: shot.videoPrompt?.prompt || '',
    motionStrength: (shot.videoPrompt?.motionStrength as 'low' | 'medium' | 'high' | null) || null,
    remoteStatus: currentAttempt?.remoteStatus ?? null,
    hasOutput: hasUsableOutput,
  }
  const aiState = useAIPromptBox({
    projectId,
    episodeId,
    shotId: shot.id,
    video: aiVideoData,
    issueTypes,
    fixNote,
    onRefresh,
  })
  const aiConsoleProps = {
    shotId: shot.id,
    shotNo: shot.shotNo,
    modelProvider,
    state: aiState,
  }

  const handleSelect = async (videoId: string) => {
    try {
      const res = await fetch(`/api/projects/${projectId}/episodes/${episodeId}/shot-videos/${videoId}/select`, { method: 'POST' })
      const data = await res.json()
      if (data.success) {
        onRefresh()
      } else {
        addToast({ type: 'error', title: '选择失败', description: data.error })
      }
    } catch {
      addToast({ type: 'error', title: '请求失败' })
    }
  }

  const handleConfirm = async () => {
    if (!confirmTarget) return
    setConfirming(true)
    try {
      const res = await fetch(`/api/projects/${projectId}/episodes/${episodeId}/shot-videos/${confirmTarget.id}/confirm`, { method: 'POST' })
      const data = await res.json()
      if (data.success) {
        addToast({ type: 'success', title: `镜头 ${shot.shotNo} 视频已确认` })
        setConfirmTarget(null)
        onRefresh()
      } else {
        addToast({ type: 'error', title: '确认失败', description: data.error })
      }
    } catch {
      addToast({ type: 'error', title: '确认失败' })
    } finally { setConfirming(false) }
  }

  const handleRegenerate = async () => {
    setRegenerating(true)
    try {
      const res = await fetch(`/api/projects/${projectId}/episodes/${episodeId}/shots/${shot.id}/videos/regenerate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          issueTypes,
          fixNote: fixNote.trim() || undefined,
          motionStrength: issueTypes.includes('phone_fake_ui_text') || issueTypes.includes('large_motion_or_hand_deform') ? 'low' : undefined,
          clientRequestId: createClientRequestId(),
        }),
      })
      const data = await res.json()
      if (data.success) {
        addToast({ type: 'success', title: `镜头 ${shot.shotNo} 重新生成中` })
        onRefresh()
      } else {
        addToast({ type: 'error', title: '重新生成失败', description: data.error })
      }
    } catch {
      addToast({ type: 'error', title: '请求失败' })
    } finally { setRegenerating(false) }
  }

  const handleCheckTask = async (videoId: string) => {
    setCheckingTaskId(videoId)
    try {
      const res = await fetch(`/api/projects/${projectId}/episodes/${episodeId}/shot-videos/${videoId}/check-task`, { method: 'POST' })
      const data = await res.json()
      if (data.success) {
        onRefresh()
      } else {
        addToast({ type: 'error', title: '检查失败', description: data.error })
      }
    } catch {
      addToast({ type: 'error', title: '请求失败' })
    } finally { setCheckingTaskId(null) }
  }

  return (
    <div className="p-4 md:p-6 space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="w-8 h-8 rounded-[var(--radius-md)] flex items-center justify-center text-sm font-bold text-white" style={{ background: confirmed ? 'var(--color-success)' : 'var(--gradient-aurora)' }}>
              {shot.shotNo}
            </span>
            <h2 className="text-xl font-bold text-[var(--color-text-primary)]">{shot.shotName || `镜头 ${shot.shotNo}`}</h2>
            <Badge variant={confirmed ? 'success' : status === 'generating' ? 'info' : status === 'failed' || status === 'timeout' ? 'danger' : 'warning'} dot>
              {STATUS_LABELS[status]}
            </Badge>
          </div>
          <div className="flex items-center gap-3 text-xs text-[var(--color-text-muted)] ml-10">
            <span className="font-mono">{shot.startTime?.toFixed(0)}-{shot.endTime?.toFixed(0)}s</span>
            {displayVideo?.duration != null && <span className="font-mono">视频 {displayVideo.duration.toFixed(1)}s</span>}
          </div>
        </div>
        {!isConfirmed && videos.length > 0 && (
          <Button variant="outline" size="sm" icon={<RefreshCw size={12} className={regenerating ? 'animate-spin' : ''} />} onClick={handleRegenerate} disabled={regenerating || isGenerating}>
            {regenerating ? '生成中…' : '重新生成'}
          </Button>
        )}
      </div>

      {!isConfirmed && videos.length > 0 && (
        <RegenerationIssuePanel
          issueTypes={issueTypes}
          onIssueTypesChange={setIssueTypes}
          fixNote={fixNote}
          onFixNoteChange={setFixNote}
          disabled={regenerating || isGenerating}
        />
      )}

      {/* Video player */}
      <ShotVideoPlayer
        video={displayVideo}
        posterUrl={shot.confirmedImage?.imageUrl ?? null}
        isConfirmed={confirmed}
        onRegenerate={handleRegenerate}
        onCheckTask={handleCheckTask}
        regenerating={regenerating}
        checkingTask={!!checkingTaskId}
      />

      {/* Candidate videos tab strip */}
      {hasMultipleVideos && (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {videos.map(v => {
            const isActive = activeVideoId ? v.id === activeVideoId : v.id === (selectedVideo?.id ?? videos[0]?.id)
            const isVConfirmed = v.isConfirmed
            const isVSelected = v.isSelected
            const hasUrl = !!v.videoUrl && !isRemotePending(v.remoteStatus)
            return (
              <button
                key={v.id}
                onClick={() => setActiveVideoId(v.id)}
                className={cn(
                  'shrink-0 w-20 rounded-[var(--radius-md)] overflow-hidden border-2 transition-all cursor-pointer',
                  isActive ? 'border-[var(--color-primary)]' : 'border-[var(--color-border-dim)] hover:border-[var(--color-border-bright)]'
                )}
              >
                <div className="aspect-video bg-[var(--bg-panel)] relative">
                  {hasUrl ? (
                    <video src={v.videoUrl!} className="w-full h-full object-cover" preload="none" muted />
                  ) : shot.confirmedImage?.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element -- 远端对象存储缩略图，next.config 未配 remotePatterns，与既有 shot-image-review 约定一致
                    <img src={shot.confirmedImage.imageUrl} alt="参考图" className="w-full h-full object-cover opacity-40" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <Video size={12} className="text-[var(--color-text-muted)]" />
                    </div>
                  )}
                  {isVConfirmed && (
                    <div className="absolute top-0.5 right-0.5 w-3.5 h-3.5 rounded-full bg-[var(--color-success)] flex items-center justify-center">
                      <Check size={8} className="text-white" />
                    </div>
                  )}
                  {isVSelected && !isVConfirmed && (
                    <div className="absolute top-0.5 right-0.5 w-3.5 h-3.5 rounded-full bg-[var(--color-primary)] flex items-center justify-center">
                      <Check size={8} className="text-white" />
                    </div>
                  )}
                </div>
                <div className="px-1 py-0.5 text-[9px] text-[var(--color-text-muted)] text-center truncate">
                  {v.duration?.toFixed(1) ?? '-'}s
                </div>
              </button>
            )
          })}
        </div>
      )}

      {/* Action buttons for current video */}
      {displayVideo && !confirmed && displayVideo.videoUrl && !isRemotePending(displayVideo.remoteStatus) && (
        <div className="flex gap-2">
          {hasMultipleVideos && !displayVideo.isSelected && (
            <Button variant="outline" size="sm" onClick={() => handleSelect(displayVideo.id)}>选择此视频</Button>
          )}
          {displayVideo.isSelected && (
            <Button variant="aurora" size="sm" icon={<Check size={12} />} onClick={() => setConfirmTarget(displayVideo)}>
              确认此视频
            </Button>
          )}
        </div>
      )}

      {/* Reference image */}
      {shot.confirmedImage && (
        <Card className="p-3">
          <div className="text-[10px] font-semibold text-[var(--color-text-muted)] uppercase tracking-wider mb-2">参考分镜图</div>
          <div className="flex items-start gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element -- 远端对象存储参考图，next.config 未配 remotePatterns，与既有 shot-image-review 约定一致 */}
            <img
              src={shot.confirmedImage.imageUrl}
              alt="确认的分镜图"
              className="w-16 h-24 object-cover rounded-[var(--radius-md)] border border-[var(--color-border-dim)]"
            />
          </div>
        </Card>
      )}

      {/* AI Prompt 创作控制台：桌面常驻（md+），移动端入口在下方 */}
      {/* 桌面与移动共享同一 useAIPromptBox 状态（提升到 review），不各自维护副本 */}
      <>
        {/* 桌面常驻控制台 */}
        <div className="hidden md:block">
          <AIPromptBox {...aiConsoleProps} />
        </div>
        {/* 移动端入口 + Sheet（共享同一 state，不维护两套表单） */}
        <div className="md:hidden">
          <Button
            ref={aiEntryBtnRef}
            variant="outline"
            size="sm"
            className="w-full"
            icon={<Sparkles size={14} />}
            onClick={() => setAiSheetOpen(true)}
          >
            AI 视频创作
          </Button>
          <AIConsoleSheet
            {...aiConsoleProps}
            open={aiSheetOpen}
            onClose={() => setAiSheetOpen(false)}
            returnFocusRef={aiEntryBtnRef}
          />
        </div>
      </>

      {/* Generation parameters */}
      {displayVideo && (displayVideo.modelName || displayVideo.seed || displayVideo.params) && (
        <Card className="p-4">
          <div className="text-[10px] font-semibold text-[var(--color-text-muted)] uppercase tracking-wider mb-2">生成参数</div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
            {displayVideo.modelName && (
              <div className="bg-[var(--bg-panel)] rounded-[var(--radius-sm)] px-2.5 py-2">
                <div className="text-[10px] text-[var(--color-text-muted)]">模型</div>
                <div className="text-[var(--color-text-secondary)] font-medium mt-0.5 truncate">{displayVideo.modelName}</div>
              </div>
            )}
            {displayVideo.duration != null && (
              <div className="bg-[var(--bg-panel)] rounded-[var(--radius-sm)] px-2.5 py-2">
                <div className="text-[10px] text-[var(--color-text-muted)]">时长</div>
                <div className="text-[var(--color-text-secondary)] font-medium mt-0.5">{displayVideo.duration.toFixed(1)}s</div>
              </div>
            )}
            {displayVideo.seed && (
              <div className="bg-[var(--bg-panel)] rounded-[var(--radius-sm)] px-2.5 py-2">
                <div className="text-[10px] text-[var(--color-text-muted)]">Seed</div>
                <div className="text-[var(--color-text-secondary)] font-mono font-medium mt-0.5 truncate">{displayVideo.seed.substring(0, 12)}</div>
              </div>
            )}
            {displayVideo.params?.aspect_ratio && (
              <div className="bg-[var(--bg-panel)] rounded-[var(--radius-sm)] px-2.5 py-2">
                <div className="text-[10px] text-[var(--color-text-muted)]">比例</div>
                <div className="text-[var(--color-text-secondary)] font-medium mt-0.5">{String(displayVideo.params.aspect_ratio)}</div>
              </div>
            )}
          </div>
        </Card>
      )}

      {/* Confirm dialog */}
      <ConfirmDialog
        open={!!confirmTarget}
        onOpenChange={(open) => { if (!open) setConfirmTarget(null) }}
        variant="warning"
        title="确认选择此视频"
        description={`确认镜头 ${shot.shotNo}「${shot.shotName || ''}」使用此视频作为最终片段？确认后仍可在重新生成时替换。`}
        confirmLabel={confirming ? '确认中…' : '确认'}
        loading={confirming}
        onConfirm={handleConfirm}
      />
    </div>
  )
}
