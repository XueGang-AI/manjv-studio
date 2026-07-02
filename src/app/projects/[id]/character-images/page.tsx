'use client'

import { useState, useEffect, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { WorkbenchImage } from '@/components/production-workbench/workbench-ui'
import {
  RefreshCw, CheckCircle2, AlertTriangle,
  ArrowLeft, ArrowRight, ImageIcon, Loader2, X,
  User, Zap, Shield,
} from 'lucide-react'

interface CharImages {
  character: {
    id: string; name: string; roleType: string
    zhFixedPrompt: string; enFixedPrompt: string
  }
  images: Array<{
    id: string; imageUrl: string; prompt: string; seed: string
    params: Record<string, unknown>
    isSelected: boolean; isConfirmed: boolean
    referenceType?: string; isPrimary?: boolean
  }>
  selectedImage: { id: string; imageUrl: string } | null
  confirmed: boolean
  confirmedTypes: string[]
  confirmedTypeCount: number
}

interface PageState {
  projectStatus: string; characters: CharImages[]; allConfirmed: boolean
}

const REF_TYPE_LABELS: Record<string, string> = {
  front_full_body: '正面全身', front_half_body: '正面半身',
  left_side: '左侧面', right_side: '右侧面', back_view: '背面',
  expression: '表情', outfit: '服装', prop: '道具', weapon: '武器', pose: '姿态',
}

export default function CharacterImagesPage() {
  const params = useParams(); const router = useRouter(); const projectId = params.id as string
  const [state, setState] = useState<PageState | null>(null)
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [genMode, setGenMode] = useState<string | null>(null)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [generateConfirmMode, setGenerateConfirmMode] = useState<string | null>(null)
  const [regenerateTarget, setRegenerateTarget] = useState<{ type: 'character' | 'image'; id: string; label: string } | null>(null)

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch(`/api/projects/${projectId}/character-images`)
      const data = await res.json()
      if (data.success) setState(data.data)
      else setError(data.error)
    } catch { setError('加载失败') }
    finally { setLoading(false) }
  }, [projectId])

  useEffect(() => { queueMicrotask(() => fetchData()) }, [fetchData])
  useEffect(() => {
    if (state?.projectStatus === 'CHARACTER_IMAGE_GENERATING') {
      const interval = setInterval(fetchData, 3000); return () => clearInterval(interval)
    }
  }, [state?.projectStatus, fetchData])

  const handleGenerate = async (mode: string) => {
    setGenerating(true); setGenMode(mode); setError(null)
    try {
      const res = await fetch(`/api/projects/${projectId}/character-images/generate?mode=${mode}`, { method: 'POST' })
      const data = await res.json()
      if (data.success) await fetchData()
      else setError(data.error || '生成失败')
    } catch { setError('请求失败') }
    finally { setGenerating(false); setGenMode(null) }
  }

  const handleSelect = async (imageId: string) => {
    setActionLoading(imageId)
    try { await fetch(`/api/projects/${projectId}/character-images/${imageId}/select`, { method: 'POST' }); await fetchData() }
    catch { setError('选择失败') }
    finally { setActionLoading(null) }
  }

  const handleConfirm = async (imageId: string) => {
    setActionLoading(imageId)
    try {
      const res = await fetch(`/api/projects/${projectId}/character-images/${imageId}/confirm`, { method: 'POST' })
      const data = await res.json()
      if (data.success) await fetchData()
      else setError(data.error || '确认失败')
    } catch { setError('确认失败') }
    finally { setActionLoading(null) }
  }

  const handleBatchConfirm = async (charId?: string) => {
    setActionLoading(charId || 'all')
    try {
      const res = await fetch(`/api/projects/${projectId}/character-images/batch-confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(charId ? { characterId: charId } : {}),
      })
      const data = await res.json()
      if (data.success) {
        await fetchData()
        if (data.data.confirmedCount === 0) setError('没有需要确认的图片')
      } else setError(data.error || '批量确认失败')
    } catch { setError('请求失败') }
    finally { setActionLoading(null) }
  }

  const handleRegenerate = async (charId: string) => {
    setActionLoading(charId)
    try {
      // 根据角色现有图片数量推断 mode：5张以上用 consistency，否则用 quick
      const charGroup = characters.find(c => c.character.id === charId)
      const refTypes = ['front_full_body', 'front_half_body', 'left_side', 'right_side', 'back_view']
      const hasConsistency = charGroup ? refTypes.every(t => charGroup.images.some(i => i.referenceType === t)) : false
      const mode = hasConsistency ? 'consistency' : 'quick'

      const res = await fetch(`/api/projects/${projectId}/characters/${charId}/images/regenerate?mode=${mode}`, { method: 'POST' })
      const data = await res.json()
      if (data.success) await fetchData()
      else setError(data.error || '重新生成失败')
    } catch { setError('请求失败') }
    finally { setActionLoading(null) }
  }

  const handleRegenerateSingle = async (imageId: string, _charId: string) => {
    setActionLoading(`single-${imageId}`)
    try {
      const res = await fetch(`/api/projects/${projectId}/character-images/${imageId}/regenerate`, { method: 'POST' })
      const data = await res.json()
      if (data.success) await fetchData()
      else setError(data.error || '重新生成失败')
    } catch { setError('请求失败') }
    finally { setActionLoading(null) }
  }

  const characters = state?.characters || []
  const isGenerating = state?.projectStatus === 'CHARACTER_IMAGE_GENERATING' || generating
  const hasImages = characters.some(c => c.images.length > 0)
  const allConfirmed = state?.allConfirmed || false
  const totalConfirmedTypes = characters.reduce((s, c) => s + c.confirmedTypeCount, 0)

  if (loading) return <div className="flex justify-center py-16"><Loader2 size={32} className="animate-spin text-[var(--text-tertiary)]" /></div>

  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text-primary)]">角色参考图</h1>
          <p className="text-[var(--text-secondary)] mt-1">
            {allConfirmed ? '所有角色参考图已确认 ✓' :
             hasImages ? `已确认 ${totalConfirmedTypes} 种参考图` :
             'AI 将为每个角色生成多角度参考图'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {hasImages && !allConfirmed && (
            <Button onClick={() => handleBatchConfirm()} disabled={isGenerating || actionLoading === 'all'}>
              {actionLoading === 'all' ? <Loader2 size={16} className="animate-spin mr-1" /> : <CheckCircle2 size={16} className="mr-1" />}
              全部确认
            </Button>
          )}
          {!hasImages && !isGenerating && (
            <>
              <Button variant="outline" onClick={() => setGenerateConfirmMode('quick')} disabled={isGenerating}>
                <Zap size={16} className="mr-1 text-[var(--accent-primary)]" /> 快速模式
              </Button>
              <Button onClick={() => setGenerateConfirmMode('consistency')} disabled={isGenerating}>
                <Shield size={16} className="mr-1" /> 生成基础参考图组 (5张)
              </Button>
            </>
          )}
          {hasImages && !allConfirmed && (
            <Button variant="outline" onClick={() => setGenerateConfirmMode('consistency')} disabled={isGenerating}>
              <RefreshCw size={16} className={`mr-1 ${isGenerating ? 'animate-spin' : ''}`} /> 补全参考图
            </Button>
          )}
          {allConfirmed && (
            <Button onClick={() => router.push(`/projects/${projectId}/episodes/1/storyboard`)}>
              进入分镜脚本 <ArrowRight size={16} className="ml-1" />
            </Button>
          )}
        </div>
      </div>

      {error && (
        <div className="mb-4 bg-[var(--error-soft)] border border-[var(--border-strong)] rounded-lg p-3 flex items-start gap-2">
          <AlertTriangle size={18} className="text-[var(--status-error)] mt-0.5 flex-shrink-0" />
          <p className="text-sm text-[var(--status-error)] flex-1">{error}</p>
          <button onClick={() => setError(null)} className="text-[var(--status-error)] hover:opacity-70"><X size={16} /></button>
        </div>
      )}

      {isGenerating && (
        <Card><CardContent className="flex flex-col items-center py-16">
          <Loader2 size={48} className="animate-spin text-[var(--accent-primary)] mb-4" />
          <h3 className="text-lg font-medium text-[var(--text-primary)] mb-1">
            {genMode === 'consistency' ? 'AI 正在生成 5 角度参考图...' : 'AI 正在生成角色参考图...'}
          </h3>
          <p className="text-[var(--text-tertiary)] text-sm">
            {genMode === 'consistency' ? `${characters.length} 角色 × 5 角度 = ${characters.length * 5} 张` : `${characters.length} 角色 × 1 张`}
          </p>
        </CardContent></Card>
      )}

      {!hasImages && !isGenerating && characters.length === 0 && (
        <Card className="border-dashed"><CardContent className="flex flex-col items-center py-16">
          <ImageIcon size={56} className="text-[var(--text-tertiary)] mb-4" />
          <h3 className="text-lg font-medium text-[var(--text-secondary)] mb-2">尚未生成角色参考图</h3>
          <p className="text-[var(--text-tertiary)] mb-6 text-center max-w-md">选择快速模式生成 1 张主参考图，或一致性模式生成 5 个角度</p>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setGenerateConfirmMode('quick')}><Zap size={16} className="mr-1 text-[var(--accent-primary)]" /> 快速模式 (1张)</Button>
            <Button onClick={() => setGenerateConfirmMode('consistency')}><Shield size={16} className="mr-1" /> 一致性模式 (5张)</Button>
          </div>
        </CardContent></Card>
      )}

      {characters.map((charGroup) => {
        const confirmedCount = charGroup.confirmedTypeCount
        const refTypes = ['front_full_body', 'front_half_body', 'left_side', 'right_side', 'back_view']
        const hasConsistency = refTypes.every(t => charGroup.images.some(i => i.referenceType === t))
        return (
        <div key={charGroup.character.id} className="mb-8">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-[var(--accent-soft)] flex items-center justify-center">
                <User size={20} className="text-[var(--accent-primary)]" />
              </div>
              <div>
                <h3 className="font-semibold text-[var(--text-primary)]">{charGroup.character.name}</h3>
                <div className="flex items-center gap-2 text-xs text-[var(--text-tertiary)]">
                  <Badge variant="info" className="text-xs">{charGroup.character.roleType}</Badge>
                  <span className={confirmedCount > 0 ? 'text-[var(--status-success)]' : 'text-[var(--status-warning)]'}>
                    {hasConsistency ? `多角度 ${confirmedCount}/5` : confirmedCount > 0 ? '主参考图已确认' : '等待参考图'}
                  </span>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => handleBatchConfirm(charGroup.character.id)}
                disabled={actionLoading === charGroup.character.id || charGroup.images.every(i => i.isConfirmed)}>
                {actionLoading === charGroup.character.id ? <Loader2 size={14} className="animate-spin mr-1" /> : <CheckCircle2 size={14} className="mr-1" />}
                确认全部
              </Button>
              <Button variant="outline" size="sm" onClick={() => setRegenerateTarget({ type: 'character', id: charGroup.character.id, label: charGroup.character.name })}
                disabled={actionLoading === charGroup.character.id}>
                <RefreshCw size={14} className={`mr-1 ${actionLoading === charGroup.character.id ? 'animate-spin' : ''}`} />
                重新生成
              </Button>
            </div>
          </div>

          {charGroup.images.length > 0 ? (
            <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
              {charGroup.images.map((img) => {
                const isSelected = img.isSelected; const isConfirmed = img.isConfirmed
                const refLabel = img.referenceType ? (REF_TYPE_LABELS[img.referenceType] || img.referenceType) : '标准图'
                return (
                  <div key={img.id}
                    className={`relative border rounded-lg overflow-hidden transition-colors ${
                      isConfirmed ? 'border-[var(--status-success)]/60' :
                      isSelected ? 'border-[var(--accent-primary)]/60' : 'border-[var(--border-default)]'
                    }`}
                  >
                    <div className="aspect-[9/16] bg-[var(--bg-panel)] relative">
                      <WorkbenchImage src={img.imageUrl} alt={refLabel} className="h-full w-full rounded-none border-0" />
                      {isConfirmed && <div className="absolute top-1 right-1 bg-[var(--status-success)] text-white rounded-full p-0.5" aria-label="已确认"><CheckCircle2 size={12} /></div>}
                      {isSelected && !isConfirmed && <div className="absolute top-1 right-1 bg-[var(--accent-primary)] text-[var(--text-inverse)] rounded-full p-0.5" aria-label="已选择"><CheckCircle2 size={12} /></div>}
                    </div>
                    <div className="p-1.5 space-y-0.5">
                      <div className="text-[10px] font-medium text-[var(--text-secondary)] truncate" title={refLabel}>{refLabel}</div>
                      {!isConfirmed ? (
                        <div className="flex gap-0.5">
                          <Button size="sm" className="flex-1 text-[10px] h-6 px-1"
                            onClick={() => handleConfirm(img.id)} disabled={!!actionLoading}>
                            {actionLoading === img.id ? <Loader2 size={10} className="animate-spin" /> : '确认'}
                          </Button>
                          {!isSelected && (
                            <Button size="sm" variant="outline" className="text-[10px] h-6 px-1"
                              onClick={() => handleSelect(img.id)} disabled={!!actionLoading}
                              title="选择（同角度有多个候选时使用）">
                              {actionLoading === img.id ? <Loader2 size={10} className="animate-spin" /> : '选'}
                            </Button>
                          )}
                          <Button size="sm" variant="outline" className="text-[10px] h-6 px-1"
                            onClick={() => setRegenerateTarget({ type: 'image', id: img.id, label: `${charGroup.character.name} · ${refLabel}` })} disabled={!!actionLoading}
                            title="重新生成该角度">
                            {actionLoading === `single-${img.id}` ? <Loader2 size={10} className="animate-spin" /> : <RefreshCw size={10} />}
                          </Button>
                        </div>
                      ) : (
                        <div className="flex gap-0.5">
                          <Button size="sm" variant="outline" className="flex-1 text-[10px] h-6 px-1"
                            onClick={() => setRegenerateTarget({ type: 'image', id: img.id, label: `${charGroup.character.name} · ${refLabel}` })} disabled={!!actionLoading}
                            title="重新生成该角度">
                            {actionLoading === `single-${img.id}` ? <Loader2 size={10} className="animate-spin" /> : <><RefreshCw size={10} className="mr-0.5" />重生成</>}
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="text-center py-6 text-[var(--text-tertiary)] text-sm border rounded-lg border-dashed border-[var(--border-subtle)]">尚未生成参考图</div>
          )}
        </div>
      )})}

      <div className="flex justify-between mt-8 pt-6 border-t border-[var(--border-subtle)]">
        <Button variant="outline" onClick={() => router.push(`/projects/${projectId}/characters`)}>
          <ArrowLeft size={16} className="mr-1" /> 返回角色设定
        </Button>
        {allConfirmed && (
          <Button onClick={() => router.push(`/projects/${projectId}/episodes/1/storyboard`)}>
            进入分镜脚本 <ArrowRight size={16} className="ml-1" />
          </Button>
        )}
      </div>

      <ConfirmDialog
        open={!!generateConfirmMode}
        onOpenChange={(open) => { if (!open) setGenerateConfirmMode(null) }}
        variant="warning"
        title={generateConfirmMode === 'consistency' ? '生成 5 角度参考图组' : '生成主参考图'}
        description={generateConfirmMode === 'consistency'
          ? `将为 ${characters.length} 个角色生成多角度参考图组，已有图片会保留或追加为候选；此操作会消耗真实豆包图片 API 额度。`
          : `将为 ${characters.length} 个角色生成 1 张主参考图，适合当前单模型生产链路的快速确认；此操作会消耗真实豆包图片 API 额度。`
        }
        confirmLabel={generating ? '创建中…' : '确认生成'}
        loading={generating}
        onConfirm={async () => {
          const mode = generateConfirmMode
          setGenerateConfirmMode(null)
          if (mode) await handleGenerate(mode)
        }}
      />

      <ConfirmDialog
        open={!!regenerateTarget}
        onOpenChange={(open) => { if (!open) setRegenerateTarget(null) }}
        variant="warning"
        title="重新生成角色参考图"
        description={`将为「${regenerateTarget?.label || ''}」创建新的真实豆包图片生成请求。旧图会保留，但本次操作会消耗 API 额度。`}
        confirmLabel="确认重新生成"
        loading={!!actionLoading}
        onConfirm={async () => {
          const target = regenerateTarget
          setRegenerateTarget(null)
          if (!target) return
          if (target.type === 'character') await handleRegenerate(target.id)
          else await handleRegenerateSingle(target.id, '')
        }}
      />
    </div>
  )
}
