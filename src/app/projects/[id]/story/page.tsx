'use client'

import { useState, useEffect, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { StoryDisplay } from '@/components/project/StoryDisplay'
import {
  Wand2, RefreshCw, CheckCircle2, AlertTriangle,
  ArrowLeft, ArrowRight, Edit3, Loader2, FileText,
  X, Save,
} from 'lucide-react'

interface StoryPackage {
  id: string
  version: number
  content: Record<string, unknown>
  confirmed: boolean
  createdAt: string
}

interface StoryState {
  projectStatus: string
  packages: StoryPackage[]
  latest: StoryPackage | null
}

export default function StoryPage() {
  const params = useParams()
  const router = useRouter()
  const projectId = params.id as string

  const [storyState, setStoryState] = useState<StoryState | null>(null)
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [saving, setSaving] = useState(false)
  const [editing, setEditing] = useState(false)
  const [editContent, setEditContent] = useState('')
  const [editError, setEditError] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const fetchStory = useCallback(async () => {
    try {
      const res = await fetch(`/api/projects/${projectId}/story`)
      const data = await res.json()
      if (data.success) {
        setStoryState(data.data)
      } else {
        setError(data.error)
      }
    } catch {
      setError('加载故事方案失败')
    } finally {
      setLoading(false)
    }
  }, [projectId])

  useEffect(() => { queueMicrotask(() => fetchStory()) }, [fetchStory])

  // 轮询生成中状态
  useEffect(() => {
    if (storyState?.projectStatus === 'STORY_GENERATING') {
      const interval = setInterval(fetchStory, 2000)
      return () => clearInterval(interval)
    }
  }, [storyState?.projectStatus, fetchStory])

  const handleGenerate = async () => {
    setGenerating(true)
    setError(null)
    try {
      const res = await fetch(`/api/projects/${projectId}/story/generate`, { method: 'POST' })
      const data = await res.json()
      if (data.success) {
        await fetchStory()
      } else {
        setError(data.error || '生成失败')
      }
    } catch {
      setError('生成请求失败')
    } finally {
      setGenerating(false)
    }
  }

  const handleConfirm = async () => {
    if (!storyState?.latest) return
    setConfirming(true)
    try {
      const res = await fetch(
        `/api/projects/${projectId}/story/${storyState.latest.id}/confirm`,
        { method: 'POST' }
      )
      const data = await res.json()
      if (data.success) {
        await fetchStory()
      } else {
        setError(data.error || '确认失败')
      }
    } catch {
      setError('确认请求失败')
    } finally {
      setConfirming(false)
    }
  }

  const handleStartEdit = () => {
    if (!storyState?.latest) return
    setEditContent(JSON.stringify(storyState.latest.content, null, 2))
    setEditing(true)
    setEditError(null)
  }

  const handleSaveEdit = async () => {
    if (!storyState?.latest) return
    setSaving(true)
    setEditError(null)

    // 校验 JSON
    try {
      JSON.parse(editContent)
    } catch {
      setEditError('JSON 格式不合法，请检查')
      setSaving(false)
      return
    }

    try {
      const res = await fetch(
        `/api/projects/${projectId}/story/${storyState.latest.id}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content: JSON.parse(editContent) }),
        }
      )
      const data = await res.json()
      if (data.success) {
        setEditing(false)
        await fetchStory()
      } else {
        setEditError(data.error || '保存失败')
      }
    } catch {
      setEditError('保存请求失败')
    } finally {
      setSaving(false)
    }
  }

  const latest = storyState?.latest
  const isGenerating = storyState?.projectStatus === 'STORY_GENERATING' || generating
  const isConfirmed = latest?.confirmed || storyState?.projectStatus === 'STORY_CONFIRMED'
  const hasStory = !!latest

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 size={32} className="animate-spin text-gray-300" />
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto">
      {/* 头部 */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">故事方案</h1>
          <p className="text-gray-500 mt-1">
            {isConfirmed
              ? '故事方案已确认 ✓'
              : hasStory
                ? '请审阅 AI 生成的故事方案'
                : 'AI 将根据你的项目信息生成故事方案'}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {hasStory && !isConfirmed && !editing && (
            <>
              <Button variant="outline" onClick={handleStartEdit}>
                <Edit3 size={16} className="mr-1" /> 编辑
              </Button>
              <Button variant="outline" onClick={handleGenerate} disabled={isGenerating}>
                <RefreshCw size={16} className={`mr-1 ${isGenerating ? 'animate-spin' : ''}`} />
                重新生成
              </Button>
              <Button onClick={handleConfirm} disabled={confirming}>
                <CheckCircle2 size={16} className="mr-1" />
                {confirming ? '确认中...' : '确认方案'}
              </Button>
            </>
          )}
          {isConfirmed && (
            <Button onClick={() => router.push(`/projects/${projectId}/characters`)}>
              进入角色设定 <ArrowRight size={16} className="ml-1" />
            </Button>
          )}
        </div>
      </div>

      {/* 错误提示 */}
      {error && (
        <div className="mb-4 bg-red-50 border border-red-200 rounded-lg p-3 flex items-start gap-2">
          <AlertTriangle size={18} className="text-red-500 mt-0.5 flex-shrink-0" />
          <div className="flex-1">
            <p className="text-sm text-red-600">{error}</p>
          </div>
          <button onClick={() => setError(null)} className="text-red-400 hover:text-red-600">
            <X size={16} />
          </button>
        </div>
      )}

      {/* 编辑模式 */}
      {editing && (
        <Card className="mb-6">
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-medium">编辑故事方案 JSON</h3>
              <div className="flex gap-2">
                <Button variant="ghost" size="sm" onClick={() => setEditing(false)} disabled={saving}>
                  取消
                </Button>
                <Button size="sm" onClick={handleSaveEdit} disabled={saving}>
                  <Save size={14} className="mr-1" />
                  {saving ? '保存中...' : '保存'}
                </Button>
              </div>
            </div>
            {editError && (
              <div className="mb-2 text-sm text-red-600 bg-red-50 p-2 rounded">{editError}</div>
            )}
            <textarea
              value={editContent}
              onChange={e => setEditContent(e.target.value)}
              className="w-full h-[500px] font-mono text-sm border rounded-lg p-4 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-y"
              spellCheck={false}
            />
          </CardContent>
        </Card>
      )}

      {/* 主内容 */}
      {!editing && (
        <>
          {/* 未生成 */}
          {!hasStory && !isGenerating && (
            <Card className="border-dashed">
              <CardContent className="flex flex-col items-center py-16">
                <FileText size={56} className="text-gray-300 mb-4" />
                <h3 className="text-lg font-medium text-gray-500 mb-2">尚未生成故事方案</h3>
                <p className="text-gray-400 mb-6 text-center max-w-md">
                  AI 将根据你输入的项目信息，分析故事结构、提取核心冲突、设计分集大纲和平台策略
                </p>
                <Button size="lg" onClick={handleGenerate} disabled={isGenerating}>
                  <Wand2 size={20} className="mr-2" />
                  生成故事方案
                </Button>
              </CardContent>
            </Card>
          )}

          {/* 生成中 */}
          {isGenerating && (
            <Card>
              <CardContent className="flex flex-col items-center py-16">
                <Loader2 size={48} className="animate-spin text-indigo-500 mb-4" />
                <h3 className="text-lg font-medium text-gray-700 mb-1">AI 正在分析你的故事...</h3>
                <p className="text-gray-400 text-sm">这可能需要 10-30 秒</p>
                <div className="mt-4 space-y-1 text-sm text-gray-400">
                  <p className="animate-pulse">📖 分析故事结构与冲突...</p>
                  <p className="animate-pulse" style={{ animationDelay: '0.3s' }}>👥 识别核心角色与关系...</p>
                  <p className="animate-pulse" style={{ animationDelay: '0.6s' }}>📋 规划分集大纲...</p>
                </div>
              </CardContent>
            </Card>
          )}

          {/* 生成失败（只有 projectStatus 回到 DRAFT 但无 story） */}
          {!hasStory && !isGenerating && error && (
            <div className="text-center py-8">
              <Button onClick={handleGenerate}>
                <RefreshCw size={16} className="mr-1" /> 重新生成
              </Button>
            </div>
          )}

          {/* 故事方案展示 */}
          {hasStory && latest && (
            <StoryDisplay
              story={latest.content as Record<string, unknown>}
              version={latest.version}
              confirmed={isConfirmed}
            />
          )}
        </>
      )}

      {/* 底部导航 */}
      <div className="flex justify-between mt-8 pt-6 border-t border-gray-200">
        <Button variant="outline" onClick={() => router.push(`/projects/${projectId}`)}>
          <ArrowLeft size={16} className="mr-1" /> 返回项目信息
        </Button>
        {isConfirmed && (
          <Button onClick={() => router.push(`/projects/${projectId}/characters`)}>
            进入角色设定 <ArrowRight size={16} className="ml-1" />
          </Button>
        )}
      </div>
    </div>
  )
}
