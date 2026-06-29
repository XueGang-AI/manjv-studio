'use client'

import { useState, useCallback } from 'react'
import { Check, Image as ImageIcon, RefreshCw, Copy, AlertCircle, ZoomIn } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { useToast } from '@/components/ui/toast'
import { cn } from '@/lib/utils'
import { getImageGroupStatus, STATUS_LABELS, type ShotGroup, type ShotImageItem } from './shot-images-types'
import { RegenerationIssuePanel, type RegenerationIssueType } from '@/components/regeneration/regeneration-issue-panel'

// Track loading/error state per image
interface ImageLoadState {
  loading: boolean
  error: boolean
}

function createClientRequestId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

interface ShotImageReviewProps {
  group: ShotGroup
  isConfirmed: boolean
  isGenerating: boolean
  projectId: string
  episodeId: string
  onRefresh: () => void
}

export function ShotImageReview({ group, isConfirmed, isGenerating, projectId, episodeId, onRefresh }: ShotImageReviewProps) {
  const { shot, images, selectedImage, confirmed } = group
  const status = getImageGroupStatus(group, isGenerating)
  const { addToast } = useToast()

  // Per-image load state
  const [imageStates, setImageStates] = useState<Record<string, ImageLoadState>>({})

  // Confirm dialog for single image
  const [confirmTarget, setConfirmTarget] = useState<ShotImageItem | null>(null)
  const [confirming, setConfirming] = useState(false)

  // Regenerate
  const [regenerating, setRegenerating] = useState(false)
  const [issueTypes, setIssueTypes] = useState<RegenerationIssueType[]>([])
  const [fixNote, setFixNote] = useState('')

  // Prompt expand
  const [promptExpanded, setPromptExpanded] = useState(false)

  // Preview modal
  const [previewImage, setPreviewImage] = useState<ShotImageItem | null>(null)

  const handleImageLoad = useCallback((id: string) => {
    setImageStates(prev => ({ ...prev, [id]: { loading: false, error: false } }))
  }, [])

  const handleImageError = useCallback((id: string) => {
    setImageStates(prev => ({ ...prev, [id]: { loading: false, error: true } }))
  }, [])

  const handleSelect = async (imageId: string) => {
    try {
      const res = await fetch(`/api/projects/${projectId}/episodes/${episodeId}/shot-images/${imageId}/select`, { method: 'POST' })
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
      const res = await fetch(`/api/projects/${projectId}/episodes/${episodeId}/shot-images/${confirmTarget.id}/confirm`, { method: 'POST' })
      const data = await res.json()
      if (data.success) {
        addToast({ type: 'success', title: `镜头 ${shot.shotNo} 图片已确认` })
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
      const res = await fetch(`/api/projects/${projectId}/episodes/${episodeId}/shots/${shot.id}/images/regenerate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          issueTypes,
          fixNote: fixNote.trim() || undefined,
          clientRequestId: createClientRequestId(),
        }),
      })
      const data = await res.json()
      if (data.success) {
        addToast({ type: 'success', title: `镜头 ${shot.shotNo} 已追加候选图` })
        onRefresh()
      } else {
        addToast({ type: 'error', title: '重新生成失败', description: data.error })
      }
    } catch {
      addToast({ type: 'error', title: '请求失败' })
    } finally { setRegenerating(false) }
  }

  const copyPrompt = (text: string) => {
    navigator.clipboard.writeText(text)
    addToast({ type: 'success', title: '已复制到剪贴板' })
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
            <Badge variant={confirmed ? 'success' : status === 'generating' ? 'info' : 'warning'} dot>
              {STATUS_LABELS[status]}
            </Badge>
          </div>
          <div className="flex items-center gap-3 text-xs text-[var(--color-text-muted)] ml-10">
            <span className="font-mono">{shot.startTime?.toFixed(0)}-{shot.endTime?.toFixed(0)}s</span>
            {shot.location && <><span>·</span><span>{shot.location}</span></>}
          </div>
        </div>
        {!isConfirmed && images.length > 0 && (
          <Button variant="outline" size="sm" icon={<RefreshCw size={12} className={regenerating ? 'animate-spin' : ''} />} onClick={handleRegenerate} disabled={regenerating || isGenerating}>
            {regenerating ? '生成中…' : '重新生成'}
          </Button>
        )}
      </div>

      {!isConfirmed && images.length > 0 && (
        <RegenerationIssuePanel
          issueTypes={issueTypes}
          onIssueTypesChange={setIssueTypes}
          fixNote={fixNote}
          onFixNoteChange={setFixNote}
          disabled={regenerating || isGenerating}
        />
      )}

      {/* Image grid */}
      {images.length > 0 ? (
        <div className={cn(
          'grid gap-3',
          images.length === 1 ? 'grid-cols-1 max-w-sm' :
          images.length === 2 ? 'grid-cols-2' :
          images.length === 3 ? 'grid-cols-3' :
          'grid-cols-2 lg:grid-cols-4'
        )}>
          {images.map(img => {
            const isSelected = selectedImage?.id === img.id
            const isImgConfirmed = img.isConfirmed
            const loadState = imageStates[img.id] ?? { loading: true, error: false }

            return (
              <div key={img.id} className={cn(
                'relative group rounded-[var(--radius-lg)] overflow-hidden border-2 transition-all',
                isImgConfirmed ? 'border-[var(--color-success)]' :
                isSelected ? 'border-[var(--color-primary)]' :
                'border-[var(--color-border-dim)] hover:border-[var(--color-border-bright)]'
              )}>
                <div className="aspect-[3/4] bg-[var(--bg-panel)] relative">
                  {/* Skeleton while loading */}
                  {loadState.loading && (
                    <div className="absolute inset-0 flex items-center justify-center animate-pulse">
                      <ImageIcon size={24} className="text-[var(--color-text-muted)]" />
                    </div>
                  )}

                  {/* Error fallback */}
                  {loadState.error ? (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
                      <AlertCircle size={24} className="text-[var(--color-danger)]" />
                      <p className="text-xs text-[var(--color-text-muted)]">图片加载失败</p>
                    </div>
                  ) : (
                    <img
                      src={img.imageUrl}
                      alt={`镜头 ${shot.shotNo} 候选图`}
                      className="w-full h-full object-cover"
                      loading="lazy"
                      onLoad={() => handleImageLoad(img.id)}
                      onError={() => handleImageError(img.id)}
                    />
                  )}

                  {/* Status overlay */}
                  {isImgConfirmed && (
                    <div className="absolute top-2 right-2">
                      <div className="w-6 h-6 rounded-full bg-[var(--color-success)] flex items-center justify-center">
                        <Check size={12} className="text-white" />
                      </div>
                    </div>
                  )}
                  {isSelected && !isImgConfirmed && (
                    <div className="absolute top-2 right-2">
                      <div className="w-6 h-6 rounded-full bg-[var(--color-primary)] flex items-center justify-center">
                        <Check size={12} className="text-white" />
                      </div>
                    </div>
                  )}

                  {/* Zoom button */}
                  {!loadState.error && !loadState.loading && (
                    <button
                      className="absolute top-2 left-2 w-6 h-6 rounded-full bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer text-white hover:bg-black/60"
                      onClick={() => setPreviewImage(img)}
                      aria-label="放大预览"
                    >
                      <ZoomIn size={12} />
                    </button>
                  )}

                  {/* Hover actions */}
                  {!isConfirmed && !isImgConfirmed && !loadState.error && (
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-end p-2 opacity-0 group-hover:opacity-100">
                      <div className="flex gap-1.5 w-full">
                        {images.length > 1 && !isSelected && (
                          <Button variant="outline" size="sm" className="flex-1 !text-xs !h-7" onClick={() => handleSelect(img.id)}>选择</Button>
                        )}
                        <Button variant="aurora" size="sm" className="flex-1 !text-xs !h-7" icon={<Check size={10} />} onClick={() => setConfirmTarget(img)}>
                          确认
                        </Button>
                      </div>
                    </div>
                  )}
                </div>

                {/* Reference characters */}
                {img.referenceImages?.length > 0 && (
                  <div className="px-2 py-1.5 bg-[var(--bg-elevated)] border-t border-[var(--color-border-dim)]">
                    <div className="flex flex-wrap gap-1">
                      {img.referenceImages.slice(0, 3).map((ref, i) => {
                        const label = ref.character_name || ref.scene_name || ref.reference_type || 'reference'
                        return (
                          <span key={i} className="text-[9px] text-[var(--color-text-muted)] bg-[var(--bg-panel)] px-1.5 py-0.5 rounded truncate">{label}</span>
                        )
                      })}
                      {img.referenceImages.length > 3 && <span className="text-[9px] text-[var(--color-text-muted)]">+{img.referenceImages.length - 3}</span>}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      ) : isGenerating ? (
        <Card className="overflow-hidden">
          <div className="aspect-[16/9] bg-[var(--bg-panel)] flex items-center justify-center">
            <div className="text-center">
              <div className="w-12 h-12 rounded-[var(--radius-xl)] bg-[var(--color-accent-cyan-muted)] flex items-center justify-center mx-auto mb-3 text-[var(--color-accent-cyan)] animate-pulse-glow">
                <ImageIcon size={24} />
              </div>
              <p className="text-sm text-[var(--color-text-muted)]">图片生成中…</p>
            </div>
          </div>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="aspect-[16/9] bg-[var(--bg-panel)] flex items-center justify-center">
            <div className="text-center">
              <ImageIcon size={48} className="text-[var(--color-text-muted)] mx-auto mb-3" />
              <p className="text-sm text-[var(--color-text-muted)]">尚未生成分镜图</p>
            </div>
          </div>
        </Card>
      )}

      {/* Prompt section */}
      {shot.imagePrompt && (shot.imagePrompt.enPrompt || shot.imagePrompt.zhPrompt) && (
        <Card className="p-4">
          <div className="flex items-center justify-between mb-2">
            <div className="text-[10px] font-semibold text-[var(--color-primary)] uppercase tracking-wider">图片 Prompt</div>
            <div className="flex items-center gap-1">
              <button onClick={() => copyPrompt(shot.imagePrompt!.enPrompt || shot.imagePrompt!.zhPrompt || '')} className="p-1 rounded hover:bg-[var(--bg-panel)] transition-colors cursor-pointer text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]" title="复制 Prompt" aria-label="复制 Prompt">
                <Copy size={12} />
              </button>
              <button onClick={() => setPromptExpanded(!promptExpanded)} className="text-[10px] text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)] cursor-pointer">
                {promptExpanded ? '收起' : '展开'}
              </button>
            </div>
          </div>
          <p className={cn(
            'text-xs text-[var(--color-text-secondary)] leading-relaxed',
            !promptExpanded && 'max-h-16 overflow-hidden'
          )}>
            {shot.imagePrompt.enPrompt || shot.imagePrompt.zhPrompt}
          </p>
          {shot.imagePrompt.negativePrompt && promptExpanded && (
            <div className="mt-2 pt-2 border-t border-[var(--color-border-dim)] text-[10px] text-[var(--color-text-muted)]">
              Negative: {shot.imagePrompt.negativePrompt}
            </div>
          )}
        </Card>
      )}

      {/* Shot action description */}
      {shot.action && (
        <Card className="p-4">
          <div className="text-[10px] font-semibold text-[var(--color-text-muted)] uppercase tracking-wider mb-2">动作描述</div>
          <p className="text-sm text-[var(--color-text-secondary)] leading-relaxed">{shot.action}</p>
        </Card>
      )}

      {/* Confirm dialog for single image */}
      <ConfirmDialog
        open={!!confirmTarget}
        onOpenChange={(open) => { if (!open) setConfirmTarget(null) }}
        variant="warning"
        title="确认选择此图片"
        description={`确认镜头 ${shot.shotNo}「${shot.shotName || ''}」使用此图片作为最终分镜图？确认后仍可在重新生成时替换。`}
        confirmLabel={confirming ? '确认中…' : '确认'}
        loading={confirming}
        onConfirm={handleConfirm}
      />

      {/* Image preview overlay */}
      {previewImage && (
        <div
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
          onClick={() => setPreviewImage(null)}
          role="dialog"
          aria-label="图片预览"
        >
          <div className="relative max-w-4xl max-h-[90vh]" onClick={e => e.stopPropagation()}>
            <img
              src={previewImage.imageUrl}
              alt={`镜头 ${shot.shotNo} 大图预览`}
              className="max-w-full max-h-[85vh] object-contain rounded-[var(--radius-lg)]"
            />
            <button
              className="absolute -top-3 -right-3 w-8 h-8 rounded-full bg-[var(--bg-elevated)] border border-[var(--color-border-dim)] flex items-center justify-center text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] cursor-pointer transition-colors"
              onClick={() => setPreviewImage(null)}
              aria-label="关闭预览"
            >
              ✕
            </button>
            {/* Preview actions */}
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-2">
              {!isConfirmed && !previewImage.isConfirmed && (
                <>
                  {images.length > 1 && selectedImage?.id !== previewImage.id && (
                    <Button variant="outline" size="sm" onClick={() => { handleSelect(previewImage.id); setPreviewImage(null) }}>选择此图</Button>
                  )}
                  <Button variant="aurora" size="sm" icon={<Check size={12} />} onClick={() => { setConfirmTarget(previewImage); setPreviewImage(null) }}>确认此图</Button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
