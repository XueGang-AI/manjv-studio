'use client'

import { useState, useEffect, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Wand2, RefreshCw, Download, AlertTriangle,
  ArrowLeft, Clapperboard, Loader2, X, Play, CheckCircle2,
} from 'lucide-react'

interface FinalVideo {
  id: string; videoUrl: string; duration: number
  aspectRatio: string; fps: number; status: string; createdAt: string
}

export default function FinalPreviewPage() {
  const params = useParams()
  const router = useRouter()
  const projectId = params.id as string
  const episodeId = params.episodeId as string

  const [state, setState] = useState<{
    projectStatus: string; finalVideos: FinalVideo[]; latest: FinalVideo | null
    shotsWithVideos: Array<{shotNo: number; shotName: string; videoCount: number}>
    canRender: boolean
  } | null>(null)
  const [loading, setLoading] = useState(true)
  const [rendering, setRendering] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch(`/api/projects/${projectId}/episodes/${episodeId}/final-preview`)
      const data = await res.json()
      if (data.success) setState(data.data)
      else setError(data.error)
    } catch { setError('加载失败') } finally { setLoading(false) }
  }, [projectId, episodeId])

  useEffect(() => { fetchData() }, [fetchData])
  useEffect(() => {
    if (state?.projectStatus === 'RENDERING') {
      const interval = setInterval(fetchData, 2000); return () => clearInterval(interval)
    }
  }, [state?.projectStatus, fetchData])

  const handleRender = async () => {
    setRendering(true); setError(null)
    try {
      const res = await fetch(`/api/projects/${projectId}/episodes/${episodeId}/final-preview/render`, { method: 'POST' })
      const data = await res.json()
      if (data.success) await fetchData()
      else setError(data.error || '渲染失败')
    } catch { setError('请求失败') } finally { setRendering(false) }
  }

  const latestVideo = state?.latest
  const isRendering = state?.projectStatus === 'RENDERING' || rendering
  const isReady = latestVideo?.status === 'READY' || state?.projectStatus === 'RENDERED'

  if (loading) return <div className="flex justify-center py-16"><Loader2 size={32} className="animate-spin text-gray-300" /></div>

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">成片预览</h1>
          <p className="text-gray-500 mt-1">
            {isReady ? '最终视频已生成 ✓' : isRendering ? '正在合成视频...' : '合成最终成片并下载'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {isReady && (
            <>
              <Button variant="outline" onClick={handleRender} disabled={isRendering}>
                <RefreshCw size={16} className={`mr-1 ${isRendering ? 'animate-spin' : ''}`} /> 重新合成
              </Button>
              {latestVideo?.videoUrl && (
                <a href={latestVideo.videoUrl} download target="_blank" rel="noopener noreferrer">
                  <Button><Download size={16} className="mr-1" /> 下载视频</Button>
                </a>
              )}
            </>
          )}
          {!isReady && !isRendering && state?.canRender && (
            <Button size="lg" onClick={handleRender} disabled={isRendering}>
              <Clapperboard size={20} className="mr-2" /> 合成最终视频
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

      {/* 渲染中 */}
      {isRendering && (
        <Card><CardContent className="flex flex-col items-center py-16">
          <Loader2 size={48} className="animate-spin text-indigo-500 mb-4" />
          <h3 className="text-lg font-medium text-gray-700 mb-1">FFmpeg 正在合成视频...</h3>
          <p className="text-gray-400 text-sm mb-4">拼接镜头片段、添加转场、统一分辨率</p>
          <div className="w-64 h-2 bg-gray-200 rounded-full overflow-hidden">
            <div className="h-full bg-indigo-500 rounded-full animate-pulse" style={{ width: '60%' }} />
          </div>
        </CardContent></Card>
      )}

      {/* 未渲染 */}
      {!isReady && !isRendering && (
        <Card className="border-dashed"><CardContent className="flex flex-col items-center py-16">
          <Clapperboard size={56} className="text-gray-300 mb-4" />
          <h3 className="text-lg font-medium text-gray-500 mb-2">
            {state?.canRender ? '可以合成最终视频' : '请先确认所有镜头视频'}
          </h3>
          <p className="text-gray-400 mb-2 text-center max-w-md">
            {state?.canRender
              ? `将 ${state?.shotsWithVideos?.length || 0} 个镜头的视频片段按顺序拼接为完整 MP4`
              : '需要在视频片段页面确认每个镜头的最终视频后，才能合成'}
          </p>
          {state?.canRender && (
            <Button size="lg" onClick={handleRender}><Wand2 size={20} className="mr-2" />合成最终视频</Button>
          )}
        </CardContent></Card>
      )}

      {/* 已渲染 */}
      {isReady && latestVideo && (
        <div className="space-y-6">
          <Card>
            <CardContent className="p-4">
              <div className="aspect-[9/16] max-w-sm mx-auto bg-black rounded-lg overflow-hidden">
                <video
                  src={latestVideo.videoUrl}
                  controls
                  className="w-full h-full"
                  poster={latestVideo.videoUrl ? undefined : undefined}
                >
                  <source src={latestVideo.videoUrl} type="video/mp4" />
                </video>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <div><span className="text-gray-400 text-xs">时长</span><p className="font-medium">{latestVideo.duration?.toFixed(1)}s</p></div>
                <div><span className="text-gray-400 text-xs">画面比例</span><p className="font-medium">{latestVideo.aspectRatio}</p></div>
                <div><span className="text-gray-400 text-xs">帧率</span><p className="font-medium">{latestVideo.fps} fps</p></div>
                <div><span className="text-gray-400 text-xs">状态</span><Badge variant="success">已生成</Badge></div>
              </div>
            </CardContent>
          </Card>

          {/* 历史版本 */}
          {state.finalVideos.length > 1 && (
            <Card>
              <CardContent className="p-4">
                <h4 className="text-sm font-medium mb-2">历史版本</h4>
                <div className="space-y-1">
                  {state.finalVideos.slice(1).map((v, i) => (
                    <div key={v.id} className="flex items-center justify-between text-xs text-gray-500 py-1">
                      <span>v{state.finalVideos.length - i}</span>
                      <span>{v.duration?.toFixed(1)}s</span>
                      <span>{new Date(v.createdAt).toLocaleString('zh-CN')}</span>
                      <a href={v.videoUrl} download className="text-indigo-500 hover:text-indigo-700">下载</a>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      <div className="flex justify-between mt-8 pt-6 border-t border-gray-200">
        <Button variant="outline" onClick={() => router.push(`/projects/${projectId}/episodes/${episodeId}/shot-videos`)}>
          <ArrowLeft size={16} className="mr-1" /> 返回视频片段
        </Button>
      </div>
    </div>
  )
}
