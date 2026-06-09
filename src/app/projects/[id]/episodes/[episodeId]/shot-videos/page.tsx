'use client'

import { useState, useEffect, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Wand2, RefreshCw, CheckCircle2, AlertTriangle,
  ArrowLeft, ArrowRight, Video, Loader2, X, Clock, Play,
} from 'lucide-react'

interface ShotGroup {
  shot: {
    id: string; shotNo: number; shotName: string
    startTime: number; endTime: number
    videoPrompt: { prompt: string; duration: number; motionStrength: string } | null
    confirmedImage: { id: string; imageUrl: string } | null
  }
  videos: Array<{
    id: string; videoUrl: string; prompt: string; seed: string
    duration: number; isSelected: boolean; isConfirmed: boolean
  }>
  selectedVideo: { id: string; videoUrl: string } | null
  confirmed: boolean
}

export default function ShotVideosPage() {
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
      const res = await fetch(`/api/projects/${projectId}/episodes/${episodeId}/shot-videos`)
      const data = await res.json()
      if (data.success) setState(data.data)
      else setError(data.error)
    } catch { setError('加载失败') } finally { setLoading(false) }
  }, [projectId, episodeId])

  useEffect(() => { fetchData() }, [fetchData])
  useEffect(() => {
    if (state?.projectStatus === 'SHOT_VIDEO_GENERATING') {
      const interval = setInterval(fetchData, 2000); return () => clearInterval(interval)
    }
  }, [state?.projectStatus, fetchData])

  const handleGenerate = async () => {
    setGenerating(true); setError(null)
    try {
      const res = await fetch(`/api/projects/${projectId}/episodes/${episodeId}/shot-videos/generate`, { method: 'POST' })
      const data = await res.json()
      if (data.success) await fetchData()
      else setError(data.error || '生成失败')
    } catch { setError('请求失败') } finally { setGenerating(false) }
  }

  const handleSelect = async (vid: string) => { setActionLoading(vid); await fetch(`/api/projects/${projectId}/episodes/${episodeId}/shot-videos/${vid}/select`, { method: 'POST' }); await fetchData(); setActionLoading(null) }
  const handleConfirm = async (vid: string) => {
    setActionLoading(vid)
    try {
      const res = await fetch(`/api/projects/${projectId}/episodes/${episodeId}/shot-videos/${vid}/confirm`, { method: 'POST' })
      const data = await res.json()
      if (data.success) await fetchData()
      else setError(data.error || '请先选择')
    } catch { setError('请求失败') } finally { setActionLoading(null) }
  }
  const handleRegenerate = async (shotId: string) => {
    setActionLoading(shotId)
    try {
      const res = await fetch(`/api/projects/${projectId}/episodes/${episodeId}/shots/${shotId}/videos/regenerate`, { method: 'POST' })
      const data = await res.json()
      if (data.success) await fetchData()
      else setError(data.error || '重新生成失败')
    } catch { setError('请求失败') } finally { setActionLoading(null) }
  }

  const shots = state?.shots || []
  const isGenerating = state?.projectStatus === 'SHOT_VIDEO_GENERATING' || generating
  const hasVideos = shots.some(s => s.videos.length > 0)
  const allConfirmed = state?.allConfirmed || false

  if (loading) return <div className="flex justify-center py-16"><Loader2 size={32} className="animate-spin text-gray-300" /></div>

  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">视频片段</h1>
          <p className="text-gray-500 mt-1">
            {allConfirmed ? '所有镜头视频已确认 ✓' : hasVideos ? `为 ${shots.length} 个镜头选择最终视频` : 'AI 将为每个镜头生成视频片段'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {hasVideos && !allConfirmed && (
            <Button variant="outline" onClick={handleGenerate} disabled={isGenerating}>
              <RefreshCw size={16} className={`mr-1 ${isGenerating ? 'animate-spin' : ''}`} /> 重新生成全部
            </Button>
          )}
          {!hasVideos && !isGenerating && (
            <Button size="lg" onClick={handleGenerate} disabled={isGenerating}>
              <Wand2 size={20} className="mr-2" /> 生成全部视频片段
            </Button>
          )}
          {allConfirmed && (
            <Button onClick={() => router.push(`/projects/${projectId}/episodes/${episodeId}/final-preview`)}>
              进入成片预览 <ArrowRight size={16} className="ml-1" />
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
          <h3 className="text-lg font-medium text-gray-700 mb-1">AI 正在生成视频片段...</h3>
          <p className="text-gray-400 text-sm">{shots.length} 个镜头 × 2 段视频</p>
        </CardContent></Card>
      )}

      {!hasVideos && !isGenerating && (
        <Card className="border-dashed"><CardContent className="flex flex-col items-center py-16">
          <Video size={56} className="text-gray-300 mb-4" />
          <h3 className="text-lg font-medium text-gray-500 mb-2">尚未生成视频片段</h3>
          <p className="text-gray-400 mb-6 text-center max-w-md">系统将为每个镜头的确认分镜图生成图生视频片段</p>
          <Button size="lg" onClick={handleGenerate} disabled={isGenerating}>
            <Wand2 size={20} className="mr-2" /> 生成全部视频片段
          </Button>
        </CardContent></Card>
      )}

      {shots.map(sg => (
        <div key={sg.shot.id} className="mb-8">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-sm font-bold text-blue-600">{sg.shot.shotNo}</div>
              <div>
                <h3 className="font-semibold text-gray-900">{sg.shot.shotName}</h3>
                <div className="flex items-center gap-2 text-xs text-gray-500">
                  <Clock size={10} /> {sg.shot.startTime}-{sg.shot.endTime}s
                  {sg.confirmed && <Badge variant="success" className="text-xs">已确认</Badge>}
                </div>
              </div>
            </div>
            <Button variant="outline" size="sm" onClick={() => handleRegenerate(sg.shot.id)} disabled={actionLoading === sg.shot.id}>
              <RefreshCw size={14} className={`mr-1 ${actionLoading === sg.shot.id ? 'animate-spin' : ''}`} /> 重新生成
            </Button>
          </div>

          {/* 确认的分镜图缩略图 */}
          {sg.shot.confirmedImage && (
            <div className="flex items-center gap-2 mb-3 text-xs text-gray-400">
              <span>参考图：</span>
              <img src={sg.shot.confirmedImage.imageUrl} className="w-12 h-20 object-cover rounded border" alt="ref" />
            </div>
          )}

          {/* 视频 Prompt */}
          {sg.shot.videoPrompt?.prompt && (
            <p className="text-xs text-gray-400 mb-3 bg-gray-50 p-2 rounded truncate">{sg.shot.videoPrompt.prompt.substring(0, 100)}...</p>
          )}

          {sg.videos.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {sg.videos.map(v => {
                const isSelected = v.isSelected; const isConfirmed = v.isConfirmed
                return (
                  <div key={v.id} className={`relative border rounded-lg overflow-hidden ${isConfirmed ? 'ring-2 ring-green-500' : isSelected ? 'ring-2 ring-indigo-500' : 'border-gray-200'}`}>
                    <div className="aspect-video bg-gray-900 relative flex items-center justify-center">
                      <video src={v.videoUrl} controls className="w-full h-full" preload="metadata" />
                      {(isSelected || isConfirmed) && (
                        <div className={`absolute top-2 right-2 rounded-full p-1 ${isConfirmed ? 'bg-green-500' : 'bg-indigo-500'}`}>
                          <CheckCircle2 size={16} className="text-white" />
                        </div>
                      )}
                    </div>
                    <div className="p-2 space-y-1.5">
                      <div className="flex items-center justify-between text-xs text-gray-400">
                        <span>{v.duration?.toFixed(1)}s</span>
                        <span>seed: {(v.seed || '-').substring(0, 10)}</span>
                      </div>
                      {!isConfirmed && (
                        <div className="flex gap-1">
                          {!isSelected && (
                            <Button size="sm" variant="outline" className="flex-1 text-xs h-7" onClick={() => handleSelect(v.id)} disabled={!!actionLoading}>
                              {actionLoading === v.id ? <Loader2 size={12} className="animate-spin" /> : '选择'}
                            </Button>
                          )}
                          {isSelected && (
                            <Button size="sm" className="flex-1 text-xs h-7" onClick={() => handleConfirm(v.id)} disabled={!!actionLoading}>
                              {actionLoading === v.id ? <Loader2 size={12} className="animate-spin" /> : '确认'}
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
        <Button variant="outline" onClick={() => router.push(`/projects/${projectId}/episodes/${episodeId}/shot-images`)}>
          <ArrowLeft size={16} className="mr-1" /> 返回分镜图
        </Button>
        {allConfirmed && (
          <Button onClick={() => router.push(`/projects/${projectId}/episodes/${episodeId}/final-preview`)}>
            进入成片预览 <ArrowRight size={16} className="ml-1" />
          </Button>
        )}
      </div>
    </div>
  )
}
