'use client'

import { useState, useEffect, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Wand2, RefreshCw, CheckCircle2, AlertTriangle,
  ArrowLeft, ArrowRight, ImageIcon, Loader2, X,
  User,
} from 'lucide-react'

interface CharImages {
  character: {
    id: string
    name: string
    roleType: string
    zhFixedPrompt: string
    enFixedPrompt: string
  }
  images: Array<{
    id: string
    imageUrl: string
    prompt: string
    seed: string
    params: Record<string, unknown>
    isSelected: boolean
    isConfirmed: boolean
  }>
  selectedImage: { id: string; imageUrl: string } | null
  confirmed: boolean
}

interface PageState {
  projectStatus: string
  characters: CharImages[]
  allConfirmed: boolean
}

export default function CharacterImagesPage() {
  const params = useParams()
  const router = useRouter()
  const projectId = params.id as string

  const [state, setState] = useState<PageState | null>(null)
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
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
      const interval = setInterval(fetchData, 2000)
      return () => clearInterval(interval)
    }
  }, [state?.projectStatus, fetchData])

  const handleGenerate = async () => {
    setGenerating(true); setError(null)
    try {
      const res = await fetch(`/api/projects/${projectId}/character-images/generate`, { method: 'POST' })
      const data = await res.json()
      if (data.success) await fetchData()
      else setError(data.error || '生成失败')
    } catch { setError('请求失败') }
    finally { setGenerating(false) }
  }

  const handleSelect = async (imageId: string) => {
    setActionLoading(imageId)
    try {
      await fetch(`/api/projects/${projectId}/character-images/${imageId}/select`, { method: 'POST' })
      await fetchData()
    } catch { setError('选择失败') }
    finally { setActionLoading(null) }
  }

  const handleConfirm = async (imageId: string) => {
    setActionLoading(imageId)
    try {
      const res = await fetch(`/api/projects/${projectId}/character-images/${imageId}/confirm`, { method: 'POST' })
      const data = await res.json()
      if (data.success) await fetchData()
      else setError(data.error || '确认失败，请先选择标准图')
    } catch { setError('确认失败') }
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

  if (loading) return <div className="flex justify-center py-16"><Loader2 size={32} className="animate-spin text-gray-300" /></div>

  return (
    <div className="max-w-6xl mx-auto">
      {/* 头部 */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">角色图</h1>
          <p className="text-gray-500 mt-1">
            {allConfirmed ? '所有角色标准图已确认 ✓' :
             hasImages ? '请为每个角色选择一张标准图' :
             'AI 将为每个角色生成多张候选图'}
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
              <Wand2 size={20} className="mr-2" /> 生成角色候选图
            </Button>
          )}
          {allConfirmed && (
            <Button onClick={() => router.push(`/projects/${projectId}/episodes/1/storyboard`)}>
              进入分镜脚本 <ArrowRight size={16} className="ml-1" />
            </Button>
          )}
        </div>
      </div>

      {/* 错误提示 */}
      {error && (
        <div className="mb-4 bg-red-50 border border-red-200 rounded-lg p-3 flex items-start gap-2">
          <AlertTriangle size={18} className="text-red-500 mt-0.5 flex-shrink-0" />
          <p className="text-sm text-red-600 flex-1">{error}</p>
          <button onClick={() => setError(null)} className="text-red-400 hover:text-red-600"><X size={16} /></button>
        </div>
      )}

      {/* 生成中 */}
      {isGenerating && (
        <Card><CardContent className="flex flex-col items-center py-16">
          <Loader2 size={48} className="animate-spin text-indigo-500 mb-4" />
          <h3 className="text-lg font-medium text-gray-700 mb-1">AI 正在生成角色图...</h3>
          <p className="text-gray-400 text-sm">每个角色生成 4 张候选图，请稍候</p>
        </CardContent></Card>
      )}

      {/* 无角色（未确认） */}
      {!hasImages && !isGenerating && characters.length === 0 && (
        <Card className="border-dashed"><CardContent className="flex flex-col items-center py-16">
          <ImageIcon size={56} className="text-gray-300 mb-4" />
          <h3 className="text-lg font-medium text-gray-500 mb-2">尚未生成角色候选图</h3>
          <p className="text-gray-400 mb-6 text-center max-w-md">
            请先确认角色设定卡，再为每个角色生成候选图
          </p>
          <Button size="lg" onClick={handleGenerate} disabled={isGenerating}>
            <Wand2 size={20} className="mr-2" /> 生成角色候选图
          </Button>
        </CardContent></Card>
      )}

      {/* 角色图分组 */}
      {characters.map((charGroup) => (
        <div key={charGroup.character.id} className="mb-8">
          {/* 角色头部 */}
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center">
                <User size={20} className="text-indigo-600" />
              </div>
              <div>
                <h3 className="font-semibold text-gray-900">{charGroup.character.name}</h3>
                <div className="flex items-center gap-2 text-xs text-gray-500">
                  <Badge variant="info" className="text-xs">{charGroup.character.roleType}</Badge>
                  {charGroup.confirmed && <Badge variant="success" className="text-xs">标准图已确认</Badge>}
                  {!charGroup.confirmed && charGroup.images.length > 0 && (
                    <span className="text-amber-600">待确认</span>
                  )}
                </div>
              </div>
            </div>
            <Button variant="outline" size="sm" onClick={() => handleRegenerate(charGroup.character.id)}
              disabled={actionLoading === charGroup.character.id}>
              <RefreshCw size={14} className={`mr-1 ${actionLoading === charGroup.character.id ? 'animate-spin' : ''}`} />
              重新生成
            </Button>
          </div>

          {/* Prompt 预览 */}
          {charGroup.character.zhFixedPrompt && (
            <p className="text-xs text-gray-400 mb-3 bg-gray-50 p-2 rounded truncate">
              {charGroup.character.zhFixedPrompt}
            </p>
          )}

          {/* 图片网格 (4列) */}
          {charGroup.images.length > 0 ? (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {charGroup.images.map((img) => {
                const isSelected = img.isSelected
                const isConfirmed = img.isConfirmed
                const isLoading = actionLoading === img.id

                return (
                  <div key={img.id}
                    className={`relative border rounded-lg overflow-hidden group ${
                      isConfirmed ? 'ring-2 ring-green-500' :
                      isSelected ? 'ring-2 ring-indigo-500' :
                      'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    {/* 图片 */}
                    <div className="aspect-[9/16] bg-gray-100 relative">
                      <img
                        src={img.imageUrl}
                        alt={`${charGroup.character.name} candidate`}
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          (e.target as HTMLImageElement).src = `data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="270" height="480" fill="%23f3f4f6"><rect width="270" height="480"/><text x="135" y="240" text-anchor="middle" fill="%239ca3af" font-size="14">Image</text></svg>`
                        }}
                      />

                      {/* 选中/确认标识 */}
                      {isConfirmed && (
                        <div className="absolute top-2 right-2 bg-green-500 text-white rounded-full p-1">
                          <CheckCircle2 size={16} />
                        </div>
                      )}
                      {isSelected && !isConfirmed && (
                        <div className="absolute top-2 right-2 bg-indigo-500 text-white rounded-full p-1">
                          <CheckCircle2 size={16} />
                        </div>
                      )}
                    </div>

                    {/* 操作区 */}
                    <div className="p-2 space-y-1.5">
                      <div className="text-xs text-gray-400 truncate">
                        seed: {String(img.seed || '-').substring(0, 12)}
                      </div>
                      {!isConfirmed && (
                        <div className="flex gap-1">
                          {!isSelected && (
                            <Button size="sm" variant="outline" className="flex-1 text-xs h-7"
                              onClick={() => handleSelect(img.id)} disabled={!!actionLoading}>
                              {isLoading ? <Loader2 size={12} className="animate-spin" /> : '选择'}
                            </Button>
                          )}
                          {isSelected && (
                            <Button size="sm" className="flex-1 text-xs h-7"
                              onClick={() => handleConfirm(img.id)} disabled={!!actionLoading}>
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
            <div className="text-center py-8 text-gray-400 text-sm border rounded-lg border-dashed">
              尚未生成候选图
            </div>
          )}
        </div>
      ))}

      {/* 底部导航 */}
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
