'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { ProjectDetail } from '@/components/project/ProjectDetail'
import { ProjectForm, ProjectFormData } from '@/components/project/ProjectForm'
import { Button } from '@/components/ui/button'
import { ArrowLeft, Loader2 } from 'lucide-react'

export default function ProjectDetailPage() {
  const params = useParams()
  const searchParams = useSearchParams()
  const router = useRouter()
  const projectId = params.id as string
  const isEditing = searchParams.get('edit') === 'true'

  const [project, setProject] = useState<Record<string, unknown> | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch(`/api/projects/${projectId}`)
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          setProject(data.data)
        } else {
          setError(data.error || '项目不存在')
        }
      })
      .catch(() => setError('加载项目失败'))
      .finally(() => setLoading(false))
  }, [projectId])

  const handleUpdate = async (data: ProjectFormData) => {
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/projects/${projectId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      const result = await res.json()
      if (result.success) {
        setProject(result.data)
        router.push(`/projects/${projectId}`)
      } else {
        setError(result.error || '更新失败')
        throw new Error(result.error || '更新失败')
      }
    } catch (err) {
      if (!(err instanceof Error && err.message === 'NEXT_REDIRECT')) {
        throw err
      }
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 size={32} className="animate-spin text-gray-300" />
      </div>
    )
  }

  if (error && !project) {
    return (
      <div className="max-w-xl mx-auto py-16 text-center">
        <h2 className="text-xl font-semibold text-gray-700 mb-2">项目未找到</h2>
        <p className="text-gray-500 mb-6">{error}</p>
        <Button onClick={() => router.push('/projects')}>
          <ArrowLeft size={16} className="mr-1" /> 返回项目列表
        </Button>
      </div>
    )
  }

  if (!project) return null

  // 将数据库字段映射为表单字段
  const mapToFormData = (p: Record<string, unknown>): Partial<ProjectFormData> => ({
    project_name: (p.projectName as string) || '',
    story_type: (p.storyType as string) || '',
    background: (p.background as string) || '',
    main_characters: (p.mainCharacters as string[]) || [],
    core_conflict: (p.coreConflict as string) || '',
    story_summary: (p.storySummary as string) || '',
    full_story: (p.fullStory as string) || '',
    art_style: (p.artStyle as string) || '',
    target_platform: (p.targetPlatform as string) || '',
    episode_count: (p.episodeCount as number) || 10,
    episode_duration: (p.episodeDuration as number) || 90,
    aspect_ratio: (p.aspectRatio as string) || '9:16',
  })

  if (isEditing) {
    return (
      <div className="p-6">
        <div className="max-w-2xl mx-auto mb-6">
          <h1 className="text-2xl font-bold">编辑项目</h1>
          <p className="text-gray-500 mt-1">修改「{project.projectName as string}」的项目信息</p>
        </div>

        {error && (
          <div className="max-w-2xl mx-auto mb-4 bg-red-50 border border-red-200 rounded-lg p-3">
            <p className="text-sm text-red-600">{error}</p>
          </div>
        )}

        <ProjectForm
          initialData={mapToFormData(project)}
          onSubmit={handleUpdate}
          onCancel={() => router.push(`/projects/${projectId}`)}
          submitLabel="保存修改"
          loading={saving}
        />
      </div>
    )
  }

  return (
    <div className="p-6">
      {error && (
        <div className="max-w-3xl mx-auto mb-4 bg-red-50 border border-red-200 rounded-lg p-3">
          <p className="text-sm text-red-600">{error}</p>
        </div>
      )}
      <ProjectDetail
        project={{
          id: project.id as string,
          projectName: (project.projectName as string) || '',
          storyType: (project.storyType as string) || null,
          background: (project.background as string) || null,
          mainCharacters: (project.mainCharacters as string[]) || [],
          coreConflict: (project.coreConflict as string) || null,
          storySummary: (project.storySummary as string) || null,
          fullStory: (project.fullStory as string) || null,
          artStyle: (project.artStyle as string) || null,
          targetPlatform: (project.targetPlatform as string) || null,
          episodeCount: (project.episodeCount as number) || 10,
          episodeDuration: (project.episodeDuration as number) || 90,
          aspectRatio: (project.aspectRatio as string) || '9:16',
          status: (project.status as string) || 'DRAFT',
          createdAt: (project.createdAt as string) || '',
          updatedAt: (project.updatedAt as string) || '',
        }}
      />
    </div>
  )
}
