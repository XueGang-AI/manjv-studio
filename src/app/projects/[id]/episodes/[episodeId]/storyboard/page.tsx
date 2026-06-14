'use client'

import { useState, useEffect, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Wand2, RefreshCw, CheckCircle2, AlertTriangle,
  ArrowLeft, ArrowRight, Film, Loader2, X, Clock,
  Plus, Trash2, Edit3, Save, ChevronDown, ChevronUp,
} from 'lucide-react'

interface ShotData {
  id: string; shotNo: number; shotName: string
  startTime: number; endTime: number; sceneTime: string
  location: string; characters: string[]
  action: string; camera: Record<string,unknown>
  visual: Record<string,unknown>; emotion: string
  sfx: string; bgm: string; dialogue: string; purpose: string
  imagePrompts: Array<{ zhPrompt: string; enPrompt: string; negativePrompt: string }>
  videoPrompts: Array<{ prompt: string; duration: number; motionStrength: string }>
}

interface EpisodeData {
  id: string; episodeNo: number; title: string; duration: number
  coreTask: string; emotionCurve: string
  openingHook: string; endingHook: string
  version: number; confirmed: boolean
  shots: ShotData[]
  voiceScripts: Array<{ content: Record<string,unknown> }>
}

export default function StoryboardPage() {
  const params = useParams()
  const router = useRouter()
  const projectId = params.id as string
  const episodeId = params.episodeId as string

  const [episode, setEpisode] = useState<EpisodeData | null>(null)
  const [projectStatus, setProjectStatus] = useState('')
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [expandedShots, setExpandedShots] = useState<Set<string>>(new Set())

  const fetchData = useCallback(async () => {
    try {
      // 获取项目状态
      const projRes = await fetch(`/api/projects/${projectId}`)
      const projData = await projRes.json()
      if (projData.success) setProjectStatus(projData.data.status)

      // 解析 episode ID: 如果是数字，按 episode_no 查找；否则直接用 UUID
      let resolvedEpisodeId = episodeId
      if (/^\d+$/.test(episodeId)) {
        // 按项目ID和集号查找
        const epsListRes = await fetch(`/api/projects/${projectId}`)
        const epsListData = await epsListRes.json()
        if (epsListData.success) {
          const eps = epsListData.data.episodes?.find((e: {episodeNo: number}) => e.episodeNo === parseInt(episodeId))
          if (eps) resolvedEpisodeId = eps.id
        }
      }

      // 获取分镜数据
      if (resolvedEpisodeId && resolvedEpisodeId !== episodeId) {
        router.replace(`/projects/${projectId}/episodes/${resolvedEpisodeId}/storyboard`)
        return
      }
      const epsRes = await fetch(`/api/projects/${projectId}/episodes/${resolvedEpisodeId}/storyboard`)
      const epsData = await epsRes.json()
      if (epsData.success) setEpisode(epsData.data)
    } catch { setError('加载失败') }
    finally { setLoading(false) }
  }, [projectId, episodeId])

  useEffect(() => { fetchData() }, [fetchData])

  useEffect(() => {
    if (projectStatus === 'STORYBOARD_GENERATING') {
      const interval = setInterval(fetchData, 2000)
      return () => clearInterval(interval)
    }
  }, [projectStatus, fetchData])

  const handleGenerate = async () => {
    setGenerating(true); setError(null)
    try {
      const res = await fetch(`/api/projects/${projectId}/storyboard/generate`, { method: 'POST' })
      const data = await res.json()
      if (data.success) {
        // After generate, navigate to the new episode's storyboard
        if (data.data?.episode?.id) {
          router.push(`/projects/${projectId}/episodes/${data.data.episode.id}/storyboard`)
        }
        await fetchData()
      } else setError(data.error || '生成失败')
    } catch { setError('请求失败') }
    finally { setGenerating(false) }
  }

  const handleConfirm = async () => {
    if (!episode) return
    try {
      const res = await fetch(`/api/projects/${projectId}/episodes/${episode.id}/storyboard/confirm`, { method: 'POST' })
      const data = await res.json()
      if (data.success) await fetchData()
      else setError(data.error || '确认失败')
    } catch { setError('请求失败') }
  }

  const toggleExpand = (shotId: string) => {
    setExpandedShots(prev => {
      const next = new Set(prev)
      if (next.has(shotId)) next.delete(shotId)
      else next.add(shotId)
      return next
    })
  }

  const isGenerating = projectStatus === 'STORYBOARD_GENERATING' || generating
  const hasStoryboard = episode && episode.shots.length > 0
  const isConfirmed = episode?.confirmed || projectStatus === 'STORYBOARD_CONFIRMED'

  if (loading) return <div className="flex justify-center py-16"><Loader2 size={32} className="animate-spin text-gray-300" /></div>

  return (
    <div className="max-w-5xl mx-auto">
      {/* 头部 */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">分镜脚本</h1>
          <p className="text-gray-500 mt-1">
            {isConfirmed ? '分镜脚本已确认 ✓' :
             hasStoryboard ? `${episode?.shots.length || 0} 个镜头，待确认` :
             '生成第 1 集完整分镜脚本'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {hasStoryboard && !isConfirmed && (
            <>
              <Button variant="outline" onClick={handleGenerate} disabled={isGenerating}>
                <RefreshCw size={16} className={`mr-1 ${isGenerating ? 'animate-spin' : ''}`} /> 重新生成
              </Button>
              <Button onClick={handleConfirm}>
                <CheckCircle2 size={16} className="mr-1" /> 确认分镜
              </Button>
            </>
          )}
          {isConfirmed && (
            <Button onClick={() => router.push(`/projects/${projectId}/episodes/${episodeId}/shot-images`)}>
              进入分镜图 <ArrowRight size={16} className="ml-1" />
            </Button>
          )}
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="mb-4 bg-red-50 border border-red-200 rounded-lg p-3 flex items-start gap-2">
          <AlertTriangle size={18} className="text-red-500 mt-0.5" />
          <p className="text-sm text-red-600 flex-1">{error}</p>
          <button onClick={() => setError(null)} className="text-red-400"><X size={16} /></button>
        </div>
      )}

      {/* Generating */}
      {isGenerating && (
        <Card><CardContent className="flex flex-col items-center py-16">
          <Loader2 size={48} className="animate-spin text-indigo-500 mb-4" />
          <h3 className="text-lg font-medium text-gray-700 mb-1">AI 正在生成分镜脚本...</h3>
          <p className="text-gray-400 text-sm">分析剧情、设计镜头语言、生成图片/视频 Prompt</p>
        </CardContent></Card>
      )}

      {/* No storyboard yet */}
      {!hasStoryboard && !isGenerating && (
        <Card className="border-dashed"><CardContent className="flex flex-col items-center py-16">
          <Film size={56} className="text-gray-300 mb-4" />
          <h3 className="text-lg font-medium text-gray-500 mb-2">尚未生成分镜脚本</h3>
          <p className="text-gray-400 mb-6 text-center max-w-md">
            AI 将结合故事方案、角色设定和电影运镜素材库，生成第 1 集完整分镜
          </p>
          <Button size="lg" onClick={handleGenerate} disabled={isGenerating}>
            <Wand2 size={20} className="mr-2" /> 生成第 1 集分镜
          </Button>
        </CardContent></Card>
      )}

      {/* Episode Overview */}
      {hasStoryboard && episode && (
        <>
          <Card className="mb-6">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                第 {episode.episodeNo} 集：{episode.title}
                <Badge variant={isConfirmed ? 'success' : 'warning'}>{isConfirmed ? '已确认' : '待确认'}</Badge>
                <span className="text-xs text-gray-400 font-normal ml-auto">v{episode.version}</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                <div><span className="text-gray-400">时长</span><p className="font-medium">{episode.duration}s</p></div>
                <div><span className="text-gray-400">镜头数</span><p className="font-medium">{episode.shots.length}</p></div>
                <div><span className="text-gray-400">核心任务</span><p className="font-medium truncate">{episode.coreTask}</p></div>
                <div><span className="text-gray-400">情绪曲线</span><p className="font-medium">{episode.emotionCurve}</p></div>
              </div>
              {(episode.openingHook || episode.endingHook) && (
                <div className="grid grid-cols-2 gap-3 mt-3 pt-3 border-t text-xs">
                  {episode.openingHook && <div><span className="text-amber-600 font-medium">🎣 开场钩子：</span>{episode.openingHook}</div>}
                  {episode.endingHook && <div><span className="text-red-500 font-medium">🔮 结尾悬念：</span>{episode.endingHook}</div>}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Shots Timeline */}
          <div className="space-y-3">
            {episode.shots.map((shot, idx) => {
              const isExpanded = expandedShots.has(shot.id)
              const duration = (shot.endTime || 0) - (shot.startTime || 0)
              const imgP = shot.imagePrompts?.[0]
              const vidP = shot.videoPrompts?.[0]

              return (
                <Card key={shot.id} className={`border-l-4 ${isConfirmed ? 'border-l-green-400' : 'border-l-indigo-400'}`}>
                  {/* Shot Header */}
                  <div
                    className="px-4 py-3 flex items-center gap-3 cursor-pointer hover:bg-gray-50"
                    onClick={() => toggleExpand(shot.id)}
                  >
                    <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center text-sm font-bold text-indigo-600">
                      {shot.shotNo}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm truncate">{shot.shotName}</span>
                        <Badge variant="info" className="text-xs">
                          <Clock size={10} className="mr-0.5" />
                          {shot.startTime}-{shot.endTime}s ({duration}s)
                        </Badge>
                      </div>
                      <p className="text-xs text-gray-400 truncate mt-0.5">
                        {shot.location} | {shot.action?.substring(0, 50)}...
                      </p>
                    </div>
                    {isExpanded ? <ChevronUp size={18} className="text-gray-400" /> : <ChevronDown size={18} className="text-gray-400" />}
                  </div>

                  {/* Expanded Details */}
                  {isExpanded && (
                    <div className="px-4 pb-4 border-t pt-3 space-y-3">
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-xs">
                        <Field label="场景时间" value={shot.sceneTime} />
                        <Field label="地点" value={shot.location} />
                        <Field label="出场角色" value={Array.isArray(shot.characters) ? shot.characters.join('、') : String(shot.characters || '')} />
                        <Field label="景别" value={String(shot.camera?.shot_size || '')} />
                        <Field label="角度" value={String(shot.camera?.angle || '')} />
                        <Field label="运镜" value={String(shot.camera?.movement || '')} />
                        <Field label="光影" value={String(shot.visual?.lighting || '')} />
                        <Field label="色调" value={String(shot.visual?.color_tone || '')} />
                        <Field label="特效" value={String(shot.visual?.special_effect || shot.visual?.vfx || '')} />
                      </div>

                      <div className="space-y-2">
                        <div><span className="text-xs font-medium text-gray-500">动作描述</span>
                          <p className="text-sm text-gray-700 mt-0.5">{shot.action}</p>
                        </div>
                        <div className="grid grid-cols-3 gap-3 text-xs">
                          <div><span className="text-gray-400">情绪</span><p>{shot.emotion || '-'}</p></div>
                          <div><span className="text-gray-400">音效</span><p>{shot.sfx || '-'}</p></div>
                          <div><span className="text-gray-400">BGM</span><p>{shot.bgm || '-'}</p></div>
                        </div>
                        {shot.dialogue && (
                          <div><span className="text-xs font-medium text-gray-500">台词</span>
                            <p className="text-sm text-indigo-700 mt-0.5 italic bg-indigo-50 p-2 rounded">「{shot.dialogue}」</p>
                          </div>
                        )}
                        <div><span className="text-xs font-medium text-gray-500">用途</span>
                          <p className="text-xs text-gray-500 mt-0.5">{shot.purpose || '-'}</p>
                        </div>
                      </div>

                      {/* Image & Video Prompts */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2 border-t">
                        {imgP && (
                          <div>
                            <span className="text-xs font-medium text-amber-600">🖼 图片 Prompt</span>
                            <p className="text-xs text-gray-600 mt-1 bg-amber-50 p-2 rounded leading-relaxed max-h-32 overflow-y-auto">
                              {imgP.enPrompt || imgP.zhPrompt}
                            </p>
                            {imgP.negativePrompt && (
                              <p className="text-xs text-red-400 mt-1">Negative: {imgP.negativePrompt.substring(0, 80)}...</p>
                            )}
                          </div>
                        )}
                        {vidP && (
                          <div>
                            <span className="text-xs font-medium text-blue-600">🎬 视频 Prompt</span>
                            <p className="text-xs text-gray-600 mt-1 bg-blue-50 p-2 rounded leading-relaxed max-h-32 overflow-y-auto">
                              {vidP.prompt}
                            </p>
                            <p className="text-xs text-gray-400 mt-1">
                              {vidP.duration}s | motion: {vidP.motionStrength || 'medium'}
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </Card>
              )
            })}
          </div>

          {/* Voice Timeline */}
          {Boolean(episode.voiceScripts?.[0]?.content) && (
            <Card className="mt-6">
              <CardHeader><CardTitle>配音时间轴</CardTitle></CardHeader>
              <CardContent>
                <div className="space-y-1">
                  {Boolean((episode.voiceScripts[0].content as Record<string,unknown>)?.timeline) && Array.isArray((episode.voiceScripts[0].content as Record<string,unknown>).timeline) &&
                    ((episode.voiceScripts[0].content as Record<string,unknown>).timeline as Array<Record<string,unknown>>).map((item, i) => (
                      <div key={i} className="flex items-center gap-2 text-xs py-1 border-b border-gray-100">
                        <Badge variant="default" className="text-xs shrink-0">
                          {String(item.start_time || 0)}-{String(item.end_time || 0)}s
                        </Badge>
                        <span className="text-gray-400 shrink-0">{String(item.speaker || '')}</span>
                        <span className="text-gray-700">{String(item.text || '')}</span>
                        <span className="text-gray-300 ml-auto shrink-0">{String(item.emotion || '')}</span>
                      </div>
                    ))}
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}

      {/* Bottom nav */}
      <div className="flex justify-between mt-8 pt-6 border-t border-gray-200">
        <Button variant="outline" onClick={() => router.push(`/projects/${projectId}/character-images`)}>
          <ArrowLeft size={16} className="mr-1" /> 返回角色图
        </Button>
        {isConfirmed && (
          <Button onClick={() => router.push(`/projects/${projectId}/episodes/${episodeId}/shot-images`)}>
            进入分镜图 <ArrowRight size={16} className="ml-1" />
          </Button>
        )}
      </div>
    </div>
  )
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span className="text-gray-400">{label}</span>
      <p className="text-gray-700 mt-0.5 truncate">{value || '-'}</p>
    </div>
  )
}
