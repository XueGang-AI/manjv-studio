'use client'

import { useState, useEffect, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Wand2, RefreshCw, CheckCircle2, AlertTriangle,
  ArrowLeft, ArrowRight, ImageIcon, Loader2, X,
  Film, Clock,
} from 'lucide-react'

interface ShotGroup {
  shot: {
    id: string; shotNo: number; shotName: string
    startTime: number; endTime: number; location: string
    characters: string[]; action: string
    imagePrompt: { zhPrompt: string; enPrompt: string; negativePrompt: string } | null
  }
  images: Array<{
    id: string; imageUrl: string; prompt: string; seed: string
    style: string; aspectRatio: string
    referenceImages: Array<{character_name: string; image_url: string}>
    isSelected: boolean; isConfirmed: boolean
  }>
  selectedImage: { id: string; imageUrl: string } | null
  confirmed: boolean
}

export default function ShotImagesPage() {
  const params = useParams()
  const router = useRouter()
  const projectId = params.id as string
  const episodeId = params.episodeId as string

  const [state, setState] = useState<{ projectStatus: string; shots: ShotGroup[]; allConfirmed: boolean } | null>(null)
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch(`/api/projects/${projectId}/episodes/${episodeId}/shot-images`)
      const data = await res.json()
      if (data.success) setState(data.data)
      else setError(data.error)
    } catch { setError('加载失败') }
    finally { setLoading(false) }
  }, [projectId, episodeId])

  useEffect(() => { fetchData() }, [fetchData])
  useEffect(() => {
    if (state?.projectStatus === 'SHOT_IMAGE_GENERATING') {
      const interval = setInterval(fetchData, 2000)
      return () => clearInterval(interval)
    }
  }, [state?.projectStatus, fetchData])

  const handleGenerate = async () => {
    setGenerating(true); setError(null)
    try {
      const res = await fetch(`/api/projects/${projectId}/episodes/${episodeId}/shot-images/generate`, { method: 'POST' })
      const data = await res.json()
      if (data.success) await fetchData()
      else setError(data.error || '生成失败')
    } catch { setError('请求失败') }
    finally { setGenerating(false) }
  }

  const handleSelect = async (imageId: string) => {
    setActionLoading(imageId)
    await fetch(`/api/projects/${projectId}/episodes/${episodeId}/shot-images/${imageId}/select`, { method: 'POST' })
    await fetchData()
    setActionLoading(null)
  }

  const handleConfirm = async (imageId: string) => {
    setActionLoading(imageId)
    try {
      const res = await fetch(`/api/projects/${projectId}/episodes/${episodeId}/shot-images/${imageId}/confirm`, { method: 'POST' })
      const data = await res.json()
      if (data.success) await fetchData()
      else setError(data.error || '确认失败，请先选择')
    } catch { setError('请求失败') }
    finally { setActionLoading(null) }
  }

  const handleRegenerate = async (shotId: string) => {
    setActionLoading(shotId)
    try {
      const res = await fetch(`/api/projects/${projectId}/episodes/${episodeId}/shots/${shotId}/images/regenerate`, { method: 'POST' })
      const data = await res.json()
      if (data.success) await fetchData()
      else setError(data.error || '重新生成失败')
    } catch { setError('请求失败') }
    finally { setActionLoading(null) }
  }

  const shots = state?.shots || []
  const isGenerating = state?.projectStatus === 'SHOT_IMAGE_GENERATING' || generating
  const hasImages = shots.some(s => s.images.length > 0)
  const allConfirmed = state?.allConfirmed || false

  if (loading) return <div className="flex justify-center py-16"><Loader2 size={32} className="animate-spin text-gray-300" /></div>

  return (
    <div className="max-w-6xl mx-auto">
      {/* 头部 */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">分镜图</h1>
          <p className="text-gray-500 mt-1">
            {allConfirmed ? '所有镜头图已确认 ✓' :
             hasImages ? `为 ${shots.length} 个镜头选择最终图` :
             'AI 将为每个镜头生成分镜候选图'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {hasImages && !allConfirmed && (
            <Button variant="outline" onClick={handleGenerate} disabled={isGenerating}>
              <RefreshCw size={16} className={`mr-1 ${isGenerating ? 'animate-spin' : ''}`} /> 重新生成全部
            </Button>
          )}
          {!hasImages && !isGenerating && (
            <Button size="lg" onClick={handleGenerate} disabled={isGenerating}>
              <Wand2 size={20} className="mr-2" /> 生成全部分镜图
            </Button>
          )}
          {allConfirmed && (
            <Button onClick={() => router.push(`/projects/${projectId}/episodes/${episodeId}/shot-videos`)}>
              进入视频片段 <ArrowRight size={16} className="ml-1" />
            </Button>
          )}
        </div>
      </div>

      {error && (
        <div className="mb-4 bg-red-50 border border-red-200 rounded-lg p-3 flex items-start gap-2">
          <AlertTriangle size={18} className="text-red-500 mt-0.5" />
          <p className="text-sm text-red-600 flex-1">{error}</p>
          <button onClick={() => setError(null)} className="text-red-400"><X size={16} /></button>
        </div>
      )}

      {isGenerating && (
        <Card><CardContent className="flex flex-col items-center py-16">
          <Loader2 size={48} className="animate-spin text-indigo-500 mb-4" />
          <h3 className="text-lg font-medium text-gray-700 mb-1">AI 正在生成分镜图...</h3>
          <p className="text-gray-400 text-sm">{shots.length} 个镜头 × 4 张候选图</p>
        </CardContent></Card>
      )}

      {!hasImages && !isGenerating && (
        <Card className="border-dashed"><CardContent className="flex flex-col items-center py-16">
          <ImageIcon size={56} className="text-gray-300 mb-4" />
          <h3 className="text-lg font-medium text-gray-500 mb-2">尚未生成分镜图</h3>
          <p className="text-gray-400 mb-6 text-center max-w-md">
            系统将为每个镜头生成 4 张候选图，并使用已确认的标准角色图作为参考
          </p>
          <Button size="lg" onClick={handleGenerate} disabled={isGenerating}>
            <Wand2 size={20} className="mr-2" /> 生成全部分镜图
          </Button>
        </CardContent></Card>
      )}

      {/* 按镜头分组 */}
      {shots.map((shotGroup) => (
        <div key={shotGroup.shot.id} className="mb-8">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center text-sm font-bold text-indigo-600">
                {shotGroup.shot.shotNo}
              </div>
              <div>
                <h3 className="font-semibold text-gray-900">{shotGroup.shot.shotName}</h3>
                <div className="flex items-center gap-2 text-xs text-gray-500">
                  <Clock size={10} /> {shotGroup.shot.startTime}-{shotGroup.shot.endTime}s
                  <span>|</span> {shotGroup.shot.location}
                  {shotGroup.confirmed && <Badge variant="success" className="text-xs">已确认</Badge>}
                </div>
              </div>
            </div>
            <Button variant="outline" size="sm" onClick={() => handleRegenerate(shotGroup.shot.id)}
              disabled={actionLoading === shotGroup.shot.id}>
              <RefreshCw size={14} className={`mr-1 ${actionLoading === shotGroup.shot.id ? 'animate-spin' : ''}`} />
              重新生成
            </Button>
          </div>

          {/* Prompt 简览 */}
          {shotGroup.shot.imagePrompt?.enPrompt && (
            <p className="text-xs text-gray-400 mb-3 bg-gray-50 p-2 rounded truncate">
              {shotGroup.shot.imagePrompt.enPrompt.substring(0, 120)}...
            </p>
          )}

          {/* 图片网格 */}
          {shotGroup.images.length > 0 ? (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {shotGroup.images.map((img) => {
                const isSelected = img.isSelected
                const isConfirmed = img.isConfirmed
                const isLoading = actionLoading === img.id
                return (
                  <div key={img.id} className={`relative border rounded-lg overflow-hidden ${
                    isConfirmed ? 'ring-2 ring-green-500' : isSelected ? 'ring-2 ring-indigo-500' : 'border-gray-200'
                  }`}>
                    <div className="aspect-[9/16] bg-gray-100 relative">
                      <img src={img.imageUrl} alt={`Shot ${shotGroup.shot.shotNo} candidate`}
                        className="w-full h-full object-cover"
                        onError={(e) => {(e.target as HTMLImageElement).src = `data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="270" height="480" fill="%23f3f4f6"><rect width="270" height="480"/><text x="135" y="240" text-anchor="middle" fill="%239ca3af" font-size="14">S${shotGroup.shot.shotNo}</text></svg>`}} />
                      {(isSelected || isConfirmed) && (
                        <div className={`absolute top-2 right-2 rounded-full p-1 ${isConfirmed ? 'bg-green-500' : 'bg-indigo-500'}`}>
                          <CheckCircle2 size={16} className="text-white" />
                        </div>
                      )}
                    </div>
                    <div className="p-2 space-y-1.5">
                      <div className="text-xs text-gray-400 truncate">seed: {(img.seed || '-').substring(0, 12)}</div>
                      {img.referenceImages && (img.referenceImages as unknown[]).length > 0 && (
                        <div className="text-xs text-gray-500 mt-0.5">
                          🎯 参考角色: {(img.referenceImages as Array<{character_name: string}>).map(r => r.character_name).join(', ')}
                        </div>
                      )}
                      {!isConfirmed && (
                        <div className="flex gap-1">
                          {!isSelected && (
                            <Button size="sm" variant="outline" className="flex-1 text-xs h-7" onClick={() => handleSelect(img.id)} disabled={!!actionLoading}>
                              {isLoading ? <Loader2 size={12} className="animate-spin" /> : '选择'}
                            </Button>
                          )}
                          {isSelected && (
                            <Button size="sm" className="flex-1 text-xs h-7" onClick={() => handleConfirm(img.id)} disabled={!!actionLoading}>
                              {isLoading ? <Loader2 size={12} className="animate-spin" /> : '确认'}
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
            <div className="text-center py-8 text-gray-400 text-sm border rounded-lg border-dashed">尚未生成</div>
          )}
        </div>
      ))}

      <div className="flex justify-between mt-8 pt-6 border-t border-gray-200">
        <Button variant="outline" onClick={() => router.push(`/projects/${projectId}/episodes/${episodeId}/storyboard`)}>
          <ArrowLeft size={16} className="mr-1" /> 返回分镜脚本
        </Button>
        {allConfirmed && (
          <Button onClick={() => router.push(`/projects/${projectId}/episodes/${episodeId}/shot-videos`)}>
            进入视频片段 <ArrowRight size={16} className="ml-1" />
          </Button>
        )}
      </div>
    </div>
  )
}
