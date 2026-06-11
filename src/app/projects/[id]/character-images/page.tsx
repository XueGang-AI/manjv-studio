'use client'

import { useState, useEffect, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Wand2, RefreshCw, CheckCircle2, AlertTriangle,
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

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch(`/api/projects/${projectId}/character-images`)
      const data = await res.json()
      if (data.success) setState(data.data)
      else setError(data.error)
    } catch { setError('加载失败') }
    finally { setLoading(false) }
  }, [projectId])

  useEffect(() => { fetchData() }, [fetchData])
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
      const res = await fetch(`/api/projects/${projectId}/characters/${charId}/images/regenerate`, { method: 'POST' })
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

  if (loading) return <div className="flex justify-center py-16"><Loader2 size={32} className="animate-spin text-gray-300" /></div>

  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">角色参考图</h1>
          <p className="text-gray-500 mt-1">
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
              <Button variant="outline" onClick={() => handleGenerate('quick')} disabled={isGenerating}>
                <Zap size={16} className="mr-1 text-amber-500" /> 快速模式
              </Button>
              <Button onClick={() => handleGenerate('consistency')} disabled={isGenerating}>
                <Shield size={16} className="mr-1" /> 生成基础参考图组 (5张)
              </Button>
            </>
          )}
          {hasImages && !allConfirmed && (
            <Button variant="outline" onClick={() => handleGenerate('consistency')} disabled={isGenerating}>
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
        <div className="mb-4 bg-red-50 border border-red-200 rounded-lg p-3 flex items-start gap-2">
          <AlertTriangle size={18} className="text-red-500 mt-0.5 flex-shrink-0" />
          <p className="text-sm text-red-600 flex-1">{error}</p>
          <button onClick={() => setError(null)} className="text-red-400 hover:text-red-600"><X size={16} /></button>
        </div>
      )}

      {isGenerating && (
        <Card><CardContent className="flex flex-col items-center py-16">
          <Loader2 size={48} className="animate-spin text-indigo-500 mb-4" />
          <h3 className="text-lg font-medium text-gray-700 mb-1">
            {genMode === 'consistency' ? 'AI 正在生成 5 角度参考图...' : 'AI 正在生成角色参考图...'}
          </h3>
          <p className="text-gray-400 text-sm">
            {genMode === 'consistency' ? `${characters.length} 角色 × 5 角度 = ${characters.length * 5} 张` : `${characters.length} 角色 × 1 张`}
          </p>
        </CardContent></Card>
      )}

      {!hasImages && !isGenerating && characters.length === 0 && (
        <Card className="border-dashed"><CardContent className="flex flex-col items-center py-16">
          <ImageIcon size={56} className="text-gray-300 mb-4" />
          <h3 className="text-lg font-medium text-gray-500 mb-2">尚未生成角色参考图</h3>
          <p className="text-gray-400 mb-6 text-center max-w-md">选择快速模式生成 1 张主参考图，或一致性模式生成 5 个角度</p>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => handleGenerate('quick')}><Zap size={16} className="mr-1 text-amber-500" /> 快速模式 (1张)</Button>
            <Button onClick={() => handleGenerate('consistency')}><Shield size={16} className="mr-1" /> 一致性模式 (5张)</Button>
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
              <div className="w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center">
                <User size={20} className="text-indigo-600" />
              </div>
              <div>
                <h3 className="font-semibold text-gray-900">{charGroup.character.name}</h3>
                <div className="flex items-center gap-2 text-xs text-gray-500">
                  <Badge variant="info" className="text-xs">{charGroup.character.roleType}</Badge>
                  <span className={confirmedCount >= 5 ? 'text-green-600' : 'text-amber-600'}>
                    参考图: {confirmedCount}/5{hasConsistency ? ' ✅' : ''}
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
              <Button variant="outline" size="sm" onClick={() => handleRegenerate(charGroup.character.id)}
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
                    className={`relative border rounded-lg overflow-hidden ${
                      isConfirmed ? 'ring-2 ring-green-500' :
                      isSelected ? 'ring-2 ring-indigo-500' : 'border-gray-200'
                    }`}
                  >
                    <div className="aspect-[9/16] bg-gray-100 relative">
                      <img src={img.imageUrl} alt={refLabel} className="w-full h-full object-cover"
                        onError={(e) => { (e.target as HTMLImageElement).src = `data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="270" height="480" fill="%23f3f4f6"><rect width="270" height="480"/><text x="135" y="240" text-anchor="middle" fill="%239ca3af" font-size="14">Image</text></svg>` }}
                      />
                      {isConfirmed && <div className="absolute top-1 right-1 bg-green-500 text-white rounded-full p-0.5"><CheckCircle2 size={12} /></div>}
                      {isSelected && !isConfirmed && <div className="absolute top-1 right-1 bg-indigo-500 text-white rounded-full p-0.5"><CheckCircle2 size={12} /></div>}
                    </div>
                    <div className="p-1.5 space-y-0.5">
                      <div className="text-[10px] font-medium text-gray-600 truncate" title={refLabel}>{refLabel}</div>
                      {!isConfirmed && (
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
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="text-center py-6 text-gray-400 text-sm border rounded-lg border-dashed">尚未生成参考图</div>
          )}
        </div>
      )})}

      <div className="flex justify-between mt-8 pt-6 border-t border-gray-200">
        <Button variant="outline" onClick={() => router.push(`/projects/${projectId}/characters`)}>
          <ArrowLeft size={16} className="mr-1" /> 返回角色设定
        </Button>
        {allConfirmed && (
          <Button onClick={() => router.push(`/projects/${projectId}/episodes/1/storyboard`)}>
            进入分镜脚本 <ArrowRight size={16} className="ml-1" />
          </Button>
        )}
      </div>
    </div>
  )
}
