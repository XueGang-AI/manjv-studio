'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import { StepNavigator } from '@/components/project/step-navigator'
import { WorkflowShell } from '@/components/layout/workflow-shell'
import { buildWorkflowSteps } from '@/components/project/workflow/workflow-status-mapper'
import { deriveErrorStepId, type TaskBrief } from '@/components/project/workflow/workflow-error-deriver'

export default function ProjectDetailLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const params = useParams()
  const projectId = params.id as string
  const [status, setStatus] = useState('DRAFT')
  const [episodeId, setEpisodeId] = useState<string | undefined>()
  const [errorStepId, setErrorStepId] = useState<string | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    async function load() {
      try {
        // 并行拉取项目状态与任务列表（复用现有 API，不改后端）。
        // 用 AbortController：projectId 变化或卸载时取消在途请求，
        // 避免竞态（旧响应覆盖新状态）和无谓网络占用。
        const [projRes, tasksRes] = await Promise.all([
          fetch(`/api/projects/${projectId}`, { signal: controller.signal }).then(r => r.json()),
          fetch(`/api/projects/${projectId}/tasks`, { signal: controller.signal }).then(r => r.json()),
        ])
        if (controller.signal.aborted) return
        // 项目状态是主信息，tasks 失败不得影响主页面可用性
        let resolvedEpisodeId: string | undefined
        if (projRes.success && projRes.data?.status) {
          setStatus(projRes.data.status)
          const firstEpisode = projRes.data.episodes?.find((episode: { episodeNo: number }) => episode.episodeNo === 1)
            || projRes.data.episodes?.[0]
          resolvedEpisodeId = firstEpisode?.id
          setEpisodeId(resolvedEpisodeId)
        }
        // errorStepId 为增强信息，失败时仅不显示步骤错误，不白屏
        if (tasksRes.success && Array.isArray(tasksRes.data)) {
          const errorId = deriveErrorStepId(
            tasksRes.data as TaskBrief[],
            buildWorkflowSteps(projectId, resolvedEpisodeId),
          )
          if (!controller.signal.aborted) setErrorStepId(errorId)
        }
      } catch (err) {
        // AbortError 是正常的取消，不处理；其余静默保留默认状态
        if (err instanceof DOMException && err.name === 'AbortError') return
        /* keep defaults */
      }
    }
    load()
    return () => controller.abort()
  }, [projectId])

  return (
    <div className="flex flex-col h-full">
      <StepNavigator projectId={projectId} currentStatus={status} episodeId={episodeId} errorStepId={errorStepId} />
      <WorkflowShell>
        <WorkflowShell.Main className="p-6 bg-[var(--bg-base)]">
          {children}
        </WorkflowShell.Main>
        {/* RightPanel slot reserved for future contextual panels. */}
      </WorkflowShell>
    </div>
  )
}
