'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import {
  AlertTriangle,
  ArrowRight,
  Boxes,
  CheckCircle2,
  Clapperboard,
  Film,
  Image as ImageIcon,
  ListChecks,
  Loader2,
  ShieldCheck,
  Sparkles,
  Users,
  Video,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ProgressBar } from '@/components/ui/progress-bar'
import { buildWorkflowSteps, isStatusAfter } from '@/components/project/workflow/workflow-status-mapper'
import {
  EmptyState,
  MetricCard,
  Panel,
  StatusPill,
  TaskStatusIcon,
  WorkbenchPageHeader,
  formatDateTime,
  statusLabel,
} from '@/components/production-workbench/workbench-ui'

interface ProjectData {
  id: string
  projectName: string
  storyType?: string | null
  storySummary?: string | null
  status: string
  episodeDuration?: number | null
  aspectRatio?: string | null
  targetPlatform?: string | null
  updatedAt?: string | null
  episodes?: Array<{ id: string; episodeNo: number; title?: string | null }>
  characters?: Array<{ id: string; confirmed?: boolean }>
  storyPackages?: Array<{ id: string; confirmed?: boolean }>
}

interface TaskItem {
  id: string
  taskType: string
  status: string
  progress: number
  errorMessage: string | null
  retryCount: number
  maxRetries: number
  createdAt: string
  updatedAt?: string
}

interface QCReport {
  id: string
  score: number | null
  passed: boolean
  issues?: Array<{ severity?: string; level?: string; problem?: string; recommendedAction?: string; shotNo?: number }>
  createdAt: string
}

interface Counts {
  characterImages: number
  confirmedCharacterImages: number
  scenes: number
  sceneImages: number
  shots: number
  confirmedShotImages: number
  shotVideos: number
  confirmedShotVideos: number
  finalVideos: number
}

const taskLabels: Record<string, string> = {
  GENERATE_STORY_PACKAGE: '故事方案生成',
  GENERATE_CHARACTERS: '角色设定生成',
  GENERATE_CHARACTER_IMAGES: '角色图生成',
  GENERATE_STORYBOARD: '分镜脚本生成',
  GENERATE_SCENE_REFERENCES: '场景参考图生成',
  GENERATE_SHOT_IMAGES: '分镜图生成',
  GENERATE_SHOT_VIDEOS: '视频片段生成',
  RENDER_FINAL_VIDEO: 'FFmpeg 成片',
  QUALITY_CHECK: 'QC 质检',
}

export default function ProjectWorkbenchPage() {
  const params = useParams()
  const projectId = params.id as string
  const [project, setProject] = useState<ProjectData | null>(null)
  const [tasks, setTasks] = useState<TaskItem[]>([])
  const [reports, setReports] = useState<QCReport[]>([])
  const [counts, setCounts] = useState<Counts>({
    characterImages: 0,
    confirmedCharacterImages: 0,
    scenes: 0,
    sceneImages: 0,
    shots: 0,
    confirmedShotImages: 0,
    shotVideos: 0,
    confirmedShotVideos: 0,
    finalVideos: 0,
  })
  const [episodeId, setEpisodeId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [projectRes, tasksRes, qcRes] = await Promise.all([
        fetch(`/api/projects/${projectId}`).then((res) => res.json()),
        fetch(`/api/projects/${projectId}/tasks`).then((res) => res.json()),
        fetch(`/api/projects/${projectId}/qc/reports`).then((res) => res.json()).catch(() => ({ success: false })),
      ])
      if (!projectRes.success) throw new Error(projectRes.error || '项目加载失败')
      const nextProject = projectRes.data as ProjectData
      const firstEpisode = nextProject.episodes?.find((episode) => episode.episodeNo === 1) || nextProject.episodes?.[0]
      setProject(nextProject)
      setEpisodeId(firstEpisode?.id || null)
      if (tasksRes.success) setTasks(tasksRes.data || [])
      if (qcRes.success) setReports(qcRes.data || [])

      if (firstEpisode?.id) {
        const [characters, scenes, shotImages, shotVideos, finalPreview] = await Promise.all([
          fetch(`/api/projects/${projectId}/character-images`).then((res) => res.json()).catch(() => ({ success: false })),
          fetch(`/api/projects/${projectId}/episodes/${firstEpisode.id}/scene-references`).then((res) => res.json()).catch(() => ({ success: false })),
          fetch(`/api/projects/${projectId}/episodes/${firstEpisode.id}/shot-images`).then((res) => res.json()).catch(() => ({ success: false })),
          fetch(`/api/projects/${projectId}/episodes/${firstEpisode.id}/shot-videos`).then((res) => res.json()).catch(() => ({ success: false })),
          fetch(`/api/projects/${projectId}/episodes/${firstEpisode.id}/final-preview`).then((res) => res.json()).catch(() => ({ success: false })),
        ])
        const characterGroups = characters.success ? characters.data?.characters || [] : []
        const sceneList = scenes.success ? scenes.data?.scenes || [] : []
        const shotImageGroups = shotImages.success ? shotImages.data?.shots || [] : []
        const shotVideoGroups = shotVideos.success ? shotVideos.data?.shots || [] : []
        setCounts({
          characterImages: characterGroups.reduce((sum: number, group: { images?: unknown[] }) => sum + (group.images?.length || 0), 0),
          confirmedCharacterImages: characterGroups.filter((group: { confirmed?: boolean }) => group.confirmed).length,
          scenes: sceneList.length,
          sceneImages: sceneList.reduce((sum: number, scene: { sceneImages?: unknown[] }) => sum + (scene.sceneImages?.length || 0), 0),
          shots: shotImageGroups.length || shotVideoGroups.length || finalPreview.data?.shotsWithVideos?.length || 0,
          confirmedShotImages: shotImageGroups.filter((group: { confirmed?: boolean }) => group.confirmed).length,
          shotVideos: shotVideoGroups.reduce((sum: number, group: { videos?: unknown[] }) => sum + (group.videos?.length || 0), 0),
          confirmedShotVideos: shotVideoGroups.filter((group: { confirmed?: boolean }) => group.confirmed).length,
          finalVideos: finalPreview.success ? finalPreview.data?.finalVideos?.length || 0 : 0,
        })
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载项目工作台失败')
    } finally {
      setLoading(false)
    }
  }, [projectId])

  useEffect(() => {
    queueMicrotask(() => load())
  }, [load])

  const workflow = useMemo(() => {
    if (!project) return []
    return buildWorkflowSteps(project.id, episodeId || undefined).map((step) => ({
      ...step,
      completed: step.id === 'info' ? true : isStatusAfter(project.status, step.confirmStatus),
      locked: step.id === 'info' ? false : !isStatusAfter(project.status, step.unlockStatus),
    }))
  }, [episodeId, project])

  const completedSteps = workflow.filter((step) => step.completed).length
  const activeStep = workflow.find((step) => !step.completed && !step.locked) || workflow.find((step) => step.id === 'final-preview') || workflow[0]
  const failedTasks = tasks.filter((task) => task.status === 'failed')
  const activeTasks = tasks.filter((task) => ['pending', 'running', 'retrying'].includes(task.status))
  const latestReport = reports[0]
  const latestIssues = (latestReport?.issues || []).slice(0, 4)

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 size={32} className="animate-spin text-[var(--color-text-muted)]" />
      </div>
    )
  }

  if (error || !project) {
    return (
      <div className="p-6">
        <EmptyState
          icon={<AlertTriangle size={24} />}
          title="项目工作台加载失败"
          description={error || '项目不存在或当前接口不可用。'}
          action={<Button variant="outline" onClick={load}>重试</Button>}
        />
      </div>
    )
  }

  return (
    <div className="space-y-5 p-5">
      <WorkbenchPageHeader
        eyebrow="Project production"
        title="项目工作台"
        description={project.storySummary || `当前项目：${project.projectName}`}
        actions={
          <>
            <Link href={activeStep?.href || `/projects/${project.id}/story`}>
              <Button variant="aurora" icon={<ArrowRight size={16} />}>进入当前阶段</Button>
            </Link>
            <Link href={`/projects/${project.id}/episodes/${episodeId || '1'}/final-preview`}>
              <Button variant="outline" icon={<Clapperboard size={16} />}>成片交付</Button>
            </Link>
          </>
        }
      />

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        <MetricCard label="生产流程" value={`${completedSteps}/9`} helper={activeStep ? `当前：${activeStep.label}` : statusLabel(project.status)} icon={<Sparkles size={18} />} tone="primary" progress={Math.round((completedSteps / 9) * 100)} />
        <MetricCard label="镜头进度" value={`${counts.confirmedShotImages}/${counts.shots || 0}`} helper="确认分镜图 / 镜头" icon={<ImageIcon size={18} />} tone="info" progress={counts.shots ? (counts.confirmedShotImages / counts.shots) * 100 : 0} />
        <MetricCard label="视频片段" value={`${counts.confirmedShotVideos}/${counts.shots || 0}`} helper={`${counts.shotVideos} 个候选片段`} icon={<Video size={18} />} tone={counts.confirmedShotVideos === counts.shots && counts.shots > 0 ? 'success' : 'warning'} progress={counts.shots ? (counts.confirmedShotVideos / counts.shots) * 100 : 0} />
        <MetricCard label="任务队列" value={activeTasks.length} helper={failedTasks.length ? `${failedTasks.length} 个失败需处理` : `${tasks.length} 条任务记录`} icon={<ListChecks size={18} />} tone={failedTasks.length ? 'danger' : activeTasks.length ? 'info' : 'success'} />
        <MetricCard label="QC 风险" value={latestIssues.length} helper={latestReport ? `最近评分 ${latestReport.score ?? '-'}` : '尚无报告'} icon={<ShieldCheck size={18} />} tone={latestIssues.length ? 'warning' : latestReport ? 'success' : 'default'} />
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-5">
          <Panel title="9 步生产流程" description="保留完整生成链路状态；点击步骤进入原有工作页面。">
            <div className="grid gap-3 md:grid-cols-3">
              {workflow.map((step, index) => (
                <Link
                  key={step.id}
                  href={step.href}
                  className="rounded-[var(--radius-md)] border border-[var(--color-border-dim)] bg-[var(--bg-panel)] p-3 transition-colors hover:border-[var(--color-border-bright)]"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex h-7 w-7 items-center justify-center rounded-full bg-[var(--bg-elevated)] text-xs font-semibold text-[var(--color-text-secondary)]">
                      {index + 1}
                    </div>
                    <StatusPill status={step.completed ? 'success' : step.locked ? 'pending' : 'running'} label={step.completed ? '已完成' : step.locked ? '等待中' : '进行中'} />
                  </div>
                  <div className="mt-3 text-sm font-semibold text-[var(--color-text-primary)]">{step.label}</div>
                </Link>
              ))}
            </div>
          </Panel>

          <Panel title="最近任务" description="读取现有任务队列，不隐藏失败和重试状态。" action={<Link href={`/projects/${project.id}/tasks`} className="text-xs text-[var(--color-primary)] hover:text-[var(--color-primary-hover)]">查看全部</Link>}>
            {tasks.length === 0 ? (
              <EmptyState icon={<ListChecks size={22} />} title="暂无任务记录" description="生成故事、角色、分镜、视频或成片后，任务会出现在这里。" />
            ) : (
              <div className="space-y-2">
                {tasks.slice(0, 6).map((task) => (
                  <div key={task.id} className="flex items-center gap-3 rounded-[var(--radius-md)] border border-[var(--color-border-dim)] bg-[var(--bg-panel)] px-3 py-2.5">
                    <TaskStatusIcon status={task.status} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-sm font-medium text-[var(--color-text-primary)]">{taskLabels[task.taskType] || task.taskType}</span>
                        <StatusPill status={task.status} />
                      </div>
                      {task.errorMessage && <p className="mt-1 truncate text-xs text-[var(--color-danger)]">{task.errorMessage}</p>}
                    </div>
                    <div className="w-24 text-right text-xs text-[var(--color-text-muted)]">{task.progress}%</div>
                  </div>
                ))}
              </div>
            )}
          </Panel>
        </div>

        <div className="space-y-5">
          <Panel title="下一步动作">
            <div className="space-y-3">
              <div className="rounded-[var(--radius-md)] border border-[var(--color-border-dim)] bg-[var(--bg-panel)] p-3">
                <div className="text-xs text-[var(--color-text-muted)]">当前阶段</div>
                <div className="mt-1 text-base font-semibold text-[var(--color-text-primary)]">{activeStep?.label || statusLabel(project.status)}</div>
                <div className="mt-3">
                  <ProgressBar value={Math.round((completedSteps / 9) * 100)} variant="aurora" />
                </div>
              </div>
              <Link href={activeStep?.href || `/projects/${project.id}/story`}>
                <Button className="w-full" variant="aurora" icon={<ArrowRight size={14} />}>打开阶段页面</Button>
              </Link>
            </div>
          </Panel>

          <Panel title="资产概览">
            <div className="space-y-3 text-sm">
              <AssetLine icon={<Users size={15} />} label="角色图" value={`${counts.confirmedCharacterImages}/${project.characters?.length || 0}`} />
              <AssetLine icon={<Boxes size={15} />} label="场景参考" value={`${counts.sceneImages} 张 / ${counts.scenes} 场景`} />
              <AssetLine icon={<Film size={15} />} label="分镜图" value={`${counts.confirmedShotImages}/${counts.shots}`} />
              <AssetLine icon={<Video size={15} />} label="视频片段" value={`${counts.confirmedShotVideos}/${counts.shots}`} />
              <AssetLine icon={<Clapperboard size={15} />} label="成片文件" value={`${counts.finalVideos} 个版本`} />
            </div>
          </Panel>

          <Panel title="风险提醒">
            {failedTasks.length === 0 && latestIssues.length === 0 ? (
              <div className="flex items-center gap-2 text-sm text-[var(--color-success)]">
                <CheckCircle2 size={16} />
                暂无阻断风险
              </div>
            ) : (
              <div className="space-y-2">
                {failedTasks.slice(0, 3).map((task) => (
                  <div key={task.id} className="rounded-[var(--radius-md)] bg-[var(--color-danger-muted)] p-2 text-xs text-[var(--color-danger)]">
                    {taskLabels[task.taskType] || task.taskType}：{task.errorMessage || '任务失败'}
                  </div>
                ))}
                {latestIssues.map((issue, index) => (
                  <div key={index} className="rounded-[var(--radius-md)] bg-[var(--color-warning-muted)] p-2 text-xs text-[var(--color-warning)]">
                    {issue.severity || issue.level || 'QC'} {issue.shotNo ? `镜头 ${issue.shotNo}：` : ''}{issue.problem || '存在质量风险'}
                  </div>
                ))}
              </div>
            )}
          </Panel>

          <div className="text-xs text-[var(--color-text-muted)]">
            更新于 {formatDateTime(project.updatedAt)} · 输出 {project.aspectRatio || '9:16'} · {project.targetPlatform || '短视频平台'}
          </div>
        </div>
      </div>
    </div>
  )
}

function AssetLine({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="flex items-center gap-2 text-[var(--color-text-muted)]">{icon}{label}</span>
      <span className="font-mono text-[var(--color-text-primary)]">{value}</span>
    </div>
  )
}
