/**
 * 场景参考图页面
 *
 * 数据源：GET /api/projects/:id/episodes/:episodeId/scene-references
 * 操作：生成场景参考图，进入分镜图
 */
'use client'

import { useCallback, useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { ArrowLeft, ArrowRight, Loader2, MapPinned, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { useToast } from '@/components/ui/toast'
import { SceneReferenceSection, type SceneReferenceItem } from '@/components/scene-references/scene-reference-section'
import { useTaskSSE, type TaskEventType, type TaskUpdateEvent } from '@/lib/hooks/use-task-sse'

export default function SceneReferencesPage() {
  const params = useParams()
  const router = useRouter()
  const projectId = params.id as string
  const episodeId = params.episodeId as string
  const { addToast } = useToast()

  const [scenes, setScenes] = useState<SceneReferenceItem[]>([])
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [generateConfirmOpen, setGenerateConfirmOpen] = useState(false)

  const refreshScenes = useCallback(async () => {
    try {
      const res = await fetch(`/api/projects/${projectId}/episodes/${episodeId}/scene-references`)
      const json = await res.json()
      if (json.success) {
        setScenes(json.data?.scenes || [])
        setError(null)
      } else {
        setError(json.error || '获取场景参考图失败')
      }
    } catch {
      setError('网络错误，请重试')
    } finally {
      setLoading(false)
    }
  }, [projectId, episodeId])

  useEffect(() => {
    const timer = window.setTimeout(refreshScenes, 0)
    return () => window.clearTimeout(timer)
  }, [refreshScenes])

  useTaskSSE(projectId, {
    onTaskUpdate: (type: TaskEventType, payload: TaskUpdateEvent) => {
      if (payload.taskType !== 'GENERATE_SCENE_REFERENCES') return
      if (type === 'task.completed') {
        addToast({ type: 'success', title: '场景参考图生成完成' })
        setGenerating(false)
        refreshScenes()
      } else if (type === 'task.failed') {
        addToast({ type: 'error', title: '场景参考图生成失败', description: payload.errorMessage || '请重试' })
        setGenerating(false)
      }
    },
    onSnapshot: () => {
      refreshScenes()
    },
  })

  const handleGenerate = async () => {
    setGenerating(true)
    try {
      const res = await fetch(`/api/projects/${projectId}/episodes/${episodeId}/scene-references/generate`, { method: 'POST' })
      const json = await res.json()
      if (json.success) {
        addToast({ type: 'success', title: '场景参考图任务已创建' })
      } else if (res.status === 409) {
        addToast({ type: 'info', title: '场景参考图任务执行中' })
      } else {
        addToast({ type: 'error', title: '创建场景参考图任务失败', description: json.error })
        setGenerating(false)
      }
    } catch {
      addToast({ type: 'error', title: '请求失败' })
      setGenerating(false)
    }
  }

  return (
    <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-[var(--radius-lg)] bg-[var(--color-primary-muted)] flex items-center justify-center text-[var(--color-primary)] shrink-0">
            <MapPinned size={20} />
          </div>
          <div>
            <h1 className="text-xl font-bold text-[var(--color-text-primary)]">场景参考图</h1>
            <p className="text-sm text-[var(--color-text-muted)] mt-1">
              先固定每个地点的空间布局、灯光和主视角，再进入分镜图生成。
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => router.push(`/projects/${projectId}/episodes/${episodeId}/storyboard`)}
            icon={<ArrowLeft size={14} />}
          >
            返回分镜脚本
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={refreshScenes}
            disabled={loading}
            icon={<RefreshCw size={14} />}
          >
            刷新
          </Button>
          <Button
            variant="aurora"
            size="sm"
            onClick={() => setGenerateConfirmOpen(true)}
            disabled={generating}
            icon={generating ? <Loader2 size={14} className="animate-spin" /> : <MapPinned size={14} />}
          >
            {generating ? '生成中…' : scenes.length > 0 ? '补齐场景参考图' : '生成场景参考图'}
          </Button>
          <Button
            variant="default"
            size="sm"
            onClick={() => router.push(`/projects/${projectId}/episodes/${episodeId}/shot-images`)}
            icon={<ArrowRight size={14} />}
          >
            进入分镜图
          </Button>
        </div>
      </div>

      {error && (
        <Card className="p-4 border-[var(--color-danger)]/35 bg-[var(--color-danger-muted)]">
          <p className="text-sm text-[var(--color-danger)]">{error}</p>
        </Card>
      )}

      {loading ? (
        <Card className="p-6">
          <div className="flex items-center gap-3 text-sm text-[var(--color-text-muted)]">
            <Loader2 size={16} className="animate-spin" />
            正在加载场景参考图…
          </div>
        </Card>
      ) : (
        <SceneReferenceSection
          scenes={scenes}
          emptyHint="尚未生成；点击上方生成场景参考图，完成后再进入分镜图。"
        />
      )}

      <ConfirmDialog
        open={generateConfirmOpen}
        onOpenChange={setGenerateConfirmOpen}
        variant="warning"
        title={scenes.length > 0 ? '补齐场景参考图' : '生成场景参考图'}
        description={`将为当前剧集的 ${scenes.length || '全部'} 个场景创建真实豆包图片生成任务。已有场景图会保留，缺失场景会补齐；此操作会消耗真实 API 额度。`}
        confirmLabel={generating ? '创建中…' : '确认生成'}
        loading={generating}
        onConfirm={async () => {
          setGenerateConfirmOpen(false)
          await handleGenerate()
        }}
      />
    </div>
  )
}
