'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ProjectForm, ProjectFormData } from '@/components/project/ProjectForm'

export default function NewProjectPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (data: ProjectFormData) => {
    setLoading(true)
    setError(null)

    try {
      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })

      const result = await res.json()

      if (result.success) {
        router.push(`/projects/${result.data.id}`)
      } else {
        setError(result.error || '创建失败')
        throw new Error(result.error || '创建失败')
      }
    } catch (err) {
      if (!(err instanceof Error && err.message === 'NEXT_REDIRECT')) {
        const msg = (err as Error).message || '创建失败，请重试'
        if (!error) setError(msg)
        throw err
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="p-6">
      <div className="max-w-2xl mx-auto mb-6">
        <h1 className="text-2xl font-bold text-gray-900">创建新项目</h1>
        <p className="text-gray-500 mt-1">填写故事信息，开始 AI 漫剧创作</p>
      </div>

      {error && (
        <div className="max-w-2xl mx-auto mb-4 bg-red-50 border border-red-200 rounded-lg p-3">
          <p className="text-sm text-red-600">{error}</p>
        </div>
      )}

      <ProjectForm
        onSubmit={handleSubmit}
        onCancel={() => router.back()}
        submitLabel="创建项目"
        loading={loading}
      />
    </div>
  )
}
