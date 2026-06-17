'use client'

import { useState, useEffect, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { CharacterCard } from '@/components/project/CharacterCard'
import {
  Wand2, RefreshCw, CheckCircle2, AlertTriangle,
  ArrowLeft, ArrowRight, Users, Loader2, X,
} from 'lucide-react'

interface Character {
  id: string
  name: string | null
  gender: string | null
  age: number | null
  roleType: string | null
  identity: string | null
  appearance: Record<string, unknown> | null
  clothing: Record<string, unknown> | null
  personality: Record<string, unknown> | null
  signatureFeatures: unknown[] | null
  languageStyle: Record<string, unknown> | null
  actionHabits: unknown[] | null
  emotionalArc: string | null
  zhFixedPrompt: string | null
  enFixedPrompt: string | null
  version: number
  confirmed: boolean
}

interface CharactersState {
  projectStatus: string
  version: number
  characters: Character[]
}

export default function CharactersPage() {
  const params = useParams()
  const router = useRouter()
  const projectId = params.id as string

  const [state, setState] = useState<CharactersState | null>(null)
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [confirming, setConfirming] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const fetchCharacters = useCallback(async () => {
    try {
      const res = await fetch(`/api/projects/${projectId}/characters`)
      const data = await res.json()
      if (data.success) setState(data.data)
      else setError(data.error)
    } catch {
      setError('加载角色数据失败')
    } finally {
      setLoading(false)
    }
  }, [projectId])

  useEffect(() => { queueMicrotask(() => fetchCharacters()) }, [fetchCharacters])

  // 轮询生成中状态
  useEffect(() => {
    if (state?.projectStatus === 'CHARACTER_GENERATING') {
      const interval = setInterval(fetchCharacters, 2000)
      return () => clearInterval(interval)
    }
  }, [state?.projectStatus, fetchCharacters])

  const handleGenerate = async () => {
    setGenerating(true)
    setError(null)
    try {
      const res = await fetch(`/api/projects/${projectId}/characters/generate`, { method: 'POST' })
      const data = await res.json()
      if (data.success) await fetchCharacters()
      else setError(data.error || '生成失败')
    } catch {
      setError('生成请求失败')
    } finally {
      setGenerating(false)
    }
  }

  const handleConfirm = async (charId: string) => {
    setConfirming(charId)
    try {
      const res = await fetch(`/api/projects/${projectId}/characters/${charId}/confirm`, { method: 'POST' })
      const data = await res.json()
      if (data.success) await fetchCharacters()
      else setError(data.error || '确认失败')
    } catch {
      setError('确认请求失败')
    } finally {
      setConfirming(null)
    }
  }

  const handleConfirmAll = async () => {
    if (!state?.characters) return
    const unconfirmed = state.characters.filter(c => !c.confirmed)
    for (const char of unconfirmed) {
      await fetch(`/api/projects/${projectId}/characters/${char.id}/confirm`, { method: 'POST' })
    }
    await fetchCharacters()
  }

  const characters = state?.characters || []
  const isGenerating = state?.projectStatus === 'CHARACTER_GENERATING' || generating
  const hasCharacters = characters.length > 0
  const isConfirmed = state?.projectStatus === 'CHARACTER_CONFIRMED'
  const allConfirmed = hasCharacters && characters.every(c => c.confirmed)

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
          <h1 className="text-2xl font-bold text-gray-900">角色设定</h1>
          <p className="text-gray-500 mt-1">
            {isConfirmed || allConfirmed
              ? `角色设定已确认 ✓ — ${characters.length} 个角色`
              : hasCharacters
                ? `${characters.length} 个角色待确认`
                : 'AI 将根据故事方案生成角色设定卡'}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {hasCharacters && !allConfirmed && (
            <>
              <Button variant="outline" onClick={handleGenerate} disabled={isGenerating}>
                <RefreshCw size={16} className={`mr-1 ${isGenerating ? 'animate-spin' : ''}`} />
                重新生成
              </Button>
              <Button onClick={handleConfirmAll} disabled={!!confirming}>
                <CheckCircle2 size={16} className="mr-1" />
                全部确认
              </Button>
            </>
          )}
          {(isConfirmed || allConfirmed) && (
            <Button onClick={() => router.push(`/projects/${projectId}/character-images`)}>
              进入角色图 <ArrowRight size={16} className="ml-1" />
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
        <Card>
          <CardContent className="flex flex-col items-center py-16">
            <Loader2 size={48} className="animate-spin text-indigo-500 mb-4" />
            <h3 className="text-lg font-medium text-gray-700 mb-1">AI 正在设计角色...</h3>
            <p className="text-gray-400 text-sm">分析人物关系、设计视觉特征、生成绘制关键词</p>
          </CardContent>
        </Card>
      )}

      {/* 未生成 */}
      {!hasCharacters && !isGenerating && (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center py-16">
            <Users size={56} className="text-gray-300 mb-4" />
            <h3 className="text-lg font-medium text-gray-500 mb-2">尚未生成角色设定卡</h3>
            <p className="text-gray-400 mb-6 text-center max-w-md">
              AI 将分析故事方案中的角色关系，生成包含外貌、服装、性格、语言风格和固定绘图关键词的完整角色设定卡
            </p>
            <Button size="lg" onClick={handleGenerate} disabled={isGenerating}>
              <Wand2 size={20} className="mr-2" /> 生成角色设定卡
            </Button>
          </CardContent>
        </Card>
      )}

      {/* 角色列表 */}
      {hasCharacters && !isGenerating && (
        <div className="space-y-4">
          {characters.map((char) => (
            <CharacterCard
              key={char.id}
              character={char}
              confirmed={char.confirmed}
              onConfirm={char.confirmed ? undefined : () => handleConfirm(char.id)}
            />
          ))}
        </div>
      )}

      {/* 底部导航 */}
      <div className="flex justify-between mt-8 pt-6 border-t border-gray-200">
        <Button variant="outline" onClick={() => router.push(`/projects/${projectId}/story`)}>
          <ArrowLeft size={16} className="mr-1" /> 返回故事方案
        </Button>
        {(isConfirmed || allConfirmed) && (
          <Button onClick={() => router.push(`/projects/${projectId}/character-images`)}>
            进入角色图 <ArrowRight size={16} className="ml-1" />
          </Button>
        )}
      </div>
    </div>
  )
}
