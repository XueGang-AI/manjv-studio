'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import {
  AlertTriangle,
  ArrowRight,
  Boxes,
  Camera,
  CheckCircle2,
  Clapperboard,
  Eye,
  Film,
  Image as ImageIcon,
  ListChecks,
  Loader2,
  Sparkles,
  Users,
  Video,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ProgressBar } from '@/components/ui/progress-bar'
import { buildWorkflowSteps, isStatusAfter } from '@/components/project/workflow/workflow-status-mapper'
import {
  CompactMetricCard,
  EmptyState,
  Panel,
  StatusPill,
  TaskStatusIcon,
  WorkbenchImage,
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

interface ShotImageItem {
  id: string
  imageUrl?: string | null
  isConfirmed?: boolean
  isSelected?: boolean
  modelName?: string | null
  createdAt?: string | null
}

interface ShotImageGroup {
  shot?: {
    id: string
    shotNo: number
    shotName?: string | null
    startTime?: number | null
    endTime?: number | null
    location?: string | null
    action?: string | null
    characters?: string[] | null
  }
  images?: ShotImageItem[]
  confirmed?: boolean
}

interface ShotVideoGroup {
  shot?: { shotNo: number; shotName?: string | null }
  videos?: Array<{ id: string; videoUrl?: string | null; isConfirmed?: boolean }>
  confirmed?: boolean
}

interface SceneItem {
  id: string
  name?: string | null
  location?: string | null
  sceneImages?: unknown[]
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
  const [shotImageGroups, setShotImageGroups] = useState<ShotImageGroup[]>([])
  const [shotVideoGroups, setShotVideoGroups] = useState<ShotVideoGroup[]>([])
  const [sceneList, setSceneList] = useState<SceneItem[]>([])
  const [selectedShotNo, setSelectedShotNo] = useState<number | null>(null)
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
        const sceneList = scenes.success ? (scenes.data?.scenes || []) as SceneItem[] : []
        const shotImageGroups = shotImages.success ? shotsByNo((shotImages.data?.shots || []) as ShotImageGroup[]) : []
        const shotVideoGroups = shotVideos.success ? shotsByNo((shotVideos.data?.shots || []) as ShotVideoGroup[]) : []
        setSceneList(sceneList)
        setShotImageGroups(shotImageGroups)
        setShotVideoGroups(shotVideoGroups)
        setSelectedShotNo((current) => current || shotImageGroups.find((group: ShotImageGroup) => group.shot?.shotNo === 8)?.shot?.shotNo || shotImageGroups.find((group: ShotImageGroup) => !group.confirmed)?.shot?.shotNo || shotImageGroups[Math.floor(shotImageGroups.length / 2)]?.shot?.shotNo || null)
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
  const latestReport = reports[0]
  const latestIssues = (latestReport?.issues || []).slice(0, 4)
  const selectedShot = useMemo(() => {
    if (shotImageGroups.length === 0) return null
    return shotImageGroups.find((group) => group.shot?.shotNo === selectedShotNo) || shotImageGroups[0]
  }, [selectedShotNo, shotImageGroups])
  const selectedImages = selectedShot?.images || []
  const confirmedImage = selectedImages.find((image) => image.isConfirmed) || selectedImages.find((image) => image.isSelected) || selectedImages[0]
  const currentVideoGroup = selectedShot?.shot?.shotNo
    ? shotVideoGroups.find((group) => group.shot?.shotNo === selectedShot.shot?.shotNo)
    : undefined
  const stageCards = [
    { label: '故事/角色', value: `${project?.characters?.length || 0}`, helper: project?.storyPackages?.some((item) => item.confirmed) ? '故事已确认' : '故事待确认', icon: <Sparkles size={15} />, tone: 'primary' as const, progress: workflow[1]?.completed ? 100 : 45 },
    { label: '角色标准图', value: counts.confirmedCharacterImages, helper: `${counts.characterImages} 张候选`, icon: <Users size={15} />, tone: counts.confirmedCharacterImages ? 'success' as const : 'warning' as const, progress: counts.characterImages ? (counts.confirmedCharacterImages / Math.max(1, project?.characters?.length || counts.confirmedCharacterImages)) * 100 : 0 },
    { label: '场景资产', value: counts.scenes, helper: `${counts.sceneImages} 张参考`, icon: <Boxes size={15} />, tone: counts.scenes ? 'info' as const : 'warning' as const, progress: counts.scenes ? 100 : 0 },
    { label: '分镜审查', value: `${counts.confirmedShotImages}/${counts.shots || 0}`, helper: activeStep?.label || '当前阶段', icon: <ImageIcon size={15} />, tone: 'primary' as const, progress: counts.shots ? (counts.confirmedShotImages / counts.shots) * 100 : 0 },
    { label: '视频/成片', value: `${counts.confirmedShotVideos}/${counts.shots || 0}`, helper: `${counts.finalVideos} 个成片`, icon: <Clapperboard size={15} />, tone: counts.finalVideos ? 'success' as const : 'warning' as const, progress: counts.shots ? (counts.confirmedShotVideos / counts.shots) * 100 : 0 },
  ]

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
    <div className="space-y-4 p-4">
      <WorkbenchPageHeader
        eyebrow="Project production"
        title="项目工作台"
        description={project.storySummary || `当前项目：${project.projectName}`}
        actions={
          <>
            <Link href={activeStep?.href || `/projects/${project.id}/story`}>
              <Button variant="aurora" icon={<ArrowRight size={16} />}>进入当前阶段</Button>
            </Link>
            {episodeId ? (
              <Link href={`/projects/${project.id}/episodes/${episodeId}/final-preview`}>
                <Button variant="outline" icon={<Clapperboard size={16} />}>成片交付</Button>
              </Link>
            ) : (
              <Button variant="outline" icon={<Clapperboard size={16} />} disabled title="当前项目尚未创建剧集">成片交付</Button>
            )}
          </>
        }
      />

      <div className="grid gap-3 md:grid-cols-5">
        {stageCards.map((card) => (
          <CompactMetricCard key={card.label} {...card} />
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_330px]">
        <div className="space-y-4">
          <Panel
            title="当前步骤：分镜图审核"
            description={selectedShot?.shot ? `镜头 ${selectedShot.shot.shotNo} · ${selectedShot.shot.location || '未标注场景'}` : '选择镜头后查看候选图、确认状态和后续视频状态。'}
            action={<Badge variant="primary">{counts.confirmedShotImages}/{counts.shots || 0} 已确认</Badge>}
            bodyClassName="p-3"
          >
            {shotImageGroups.length === 0 ? (
              <EmptyState icon={<Camera size={24} />} title="暂无分镜图素材" description="完成分镜图生成后，这里会显示分镜审查工作区。" />
            ) : (
              <div className="space-y-3">
                <div className="grid gap-3 lg:grid-cols-3">
                  <div className="rounded-[var(--radius-md)] border border-[var(--color-border-dim)] bg-[var(--bg-panel)] p-3">
                    <div className="text-[11px] text-[var(--color-text-muted)]">当前镜头</div>
                    <div className="mt-1 text-lg font-semibold text-[var(--color-text-primary)]">#{selectedShot?.shot?.shotNo ?? '-'}</div>
                    <div className="mt-1 truncate text-xs text-[var(--color-text-muted)]">{selectedShot?.shot?.shotName || selectedShot?.shot?.action || '未命名镜头'}</div>
                  </div>
                  <div className="rounded-[var(--radius-md)] border border-[var(--color-border-dim)] bg-[var(--bg-panel)] p-3">
                    <div className="text-[11px] text-[var(--color-text-muted)]">候选图</div>
                    <div className="mt-1 text-lg font-semibold text-[var(--color-text-primary)]">{selectedImages.length}</div>
                    <div className="mt-1 text-xs text-[var(--color-text-muted)]">{selectedShot?.confirmed ? '已有确认首帧' : '等待确认候选'}</div>
                  </div>
                  <div className="rounded-[var(--radius-md)] border border-[var(--color-border-dim)] bg-[var(--bg-panel)] p-3">
                    <div className="text-[11px] text-[var(--color-text-muted)]">视频状态</div>
                    <div className="mt-1 text-lg font-semibold text-[var(--color-text-primary)]">{currentVideoGroup?.confirmed ? '已确认' : `${currentVideoGroup?.videos?.length || 0} 候选`}</div>
                    <div className="mt-1 truncate text-xs text-[var(--color-text-muted)]">低幅动作 / 连续单镜头</div>
                  </div>
                </div>

                <div className="flex gap-2 overflow-x-auto pb-1">
                  {shotImageGroups.map((group) => {
                    const preview = group.images?.find((image) => image.isConfirmed) || group.images?.[0]
                    const active = group.shot?.shotNo === selectedShot?.shot?.shotNo
                    return (
                      <button
                        key={group.shot?.id || group.shot?.shotNo}
                        type="button"
                        onClick={() => setSelectedShotNo(group.shot?.shotNo || null)}
                        className={`min-w-[104px] rounded-[var(--radius-md)] border p-1.5 text-left transition-colors ${active ? 'border-[var(--color-primary)] bg-[var(--color-primary-muted)]' : 'border-[var(--color-border-dim)] bg-[var(--bg-panel)] hover:border-[var(--color-border-bright)]'}`}
                      >
                        <WorkbenchImage src={preview?.imageUrl} alt={`镜头 ${group.shot?.shotNo || ''}`} className="aspect-video" />
                        <div className="mt-1.5 flex items-center justify-between gap-1">
                          <span className="font-mono text-[11px] text-[var(--color-text-primary)]">{String(group.shot?.shotNo || '-').padStart(2, '0')}</span>
                          <Badge variant={group.confirmed ? 'success' : 'warning'}>{group.confirmed ? '确认' : '候选'}</Badge>
                        </div>
                      </button>
                    )
                  })}
                </div>

                <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_360px]">
                  <div className="space-y-3">
                    <WorkbenchImage
                      src={confirmedImage?.imageUrl}
                      alt={selectedShot?.shot?.shotName || '选中镜头'}
                      className="aspect-[16/9] min-h-[330px]"
                    />
                    <div className="grid gap-2 rounded-[var(--radius-md)] border border-[var(--color-border-dim)] bg-[var(--bg-panel)] p-3 text-xs md:grid-cols-2">
                      <div className="flex items-start justify-between gap-3 md:col-span-2">
                        <div>
                          <div className="text-sm font-semibold text-[var(--color-text-primary)]">
                            镜头 {selectedShot?.shot?.shotNo || '-'}　{selectedShot?.shot?.shotName || '分镜审查'}
                          </div>
                          <div className="mt-1 text-[11px] text-[var(--color-text-muted)]">
                            {selectedShot?.shot?.startTime ?? '-'}s - {selectedShot?.shot?.endTime ?? '-'}s · {confirmedImage?.modelName || 'doubao-seedream-5-0-260128'}
                          </div>
                        </div>
                        <StatusPill status={selectedShot?.confirmed ? 'success' : 'pending'} label={selectedShot?.confirmed ? '已确认' : '待确认'} />
                      </div>
                      <InfoLine label="场景" value={selectedShot?.shot?.location || '未标注'} />
                      <InfoLine label="角色" value={selectedShot?.shot?.characters?.join('、') || '未标注'} />
                      <InfoLine label="道具" value="蓝染球衣 / 竹架 / 手机" />
                      <InfoLine label="动作" value={selectedShot?.shot?.action || '未记录'} />
                    </div>
                  </div>
                  <div className="flex min-h-0 flex-col gap-2">
                    <div className="flex items-center justify-between rounded-[var(--radius-md)] border border-[var(--color-border-dim)] bg-[var(--bg-panel)] px-3 py-2">
                      <div>
                        <div className="text-xs font-semibold text-[var(--color-text-primary)]">候选方案（3/3）</div>
                        <div className="text-[11px] text-[var(--color-text-muted)]">确认前保留旧候选，不覆盖可用资产</div>
                      </div>
                      <Badge variant="primary">{selectedImages.length || 0} 张</Badge>
                    </div>
                    <div className="grid flex-1 grid-cols-3 gap-2 lg:grid-cols-1">
                      {(selectedImages.length ? selectedImages.slice(0, 3) : [undefined, undefined, undefined]).map((image, index) => (
                        <button
                          key={image?.id || index}
                          type="button"
                          className={`rounded-[var(--radius-md)] border p-2 text-left transition-colors ${image?.isConfirmed ? 'border-[var(--color-primary)] bg-[var(--color-primary-muted)]/45' : 'border-[var(--color-border-dim)] bg-[var(--bg-panel)] hover:border-[var(--color-border-bright)]'}`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-xs font-medium text-[var(--color-text-secondary)]">候选 {index + 1}</span>
                            <Badge variant={image?.isConfirmed ? 'success' : image?.isSelected ? 'info' : 'default'}>{image?.isConfirmed ? '确认' : image?.isSelected ? '选择' : '候选'}</Badge>
                          </div>
                          <WorkbenchImage src={image?.imageUrl || confirmedImage?.imageUrl} alt={`候选 ${index + 1}`} className="mt-2 aspect-video" />
                        </button>
                      ))}
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <Link href={`/projects/${project.id}/episodes/${episodeId}/shot-images`}>
                        <Button size="sm" variant="outline" className="w-full" icon={<Eye size={14} />}>分镜审查</Button>
                      </Link>
                      <Link href={`/projects/${project.id}/episodes/${episodeId}/shot-videos`}>
                        <Button size="sm" variant="aurora" className="w-full" icon={<Video size={14} />}>视频片段</Button>
                      </Link>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </Panel>
        </div>

        <div className="space-y-4">
          <Panel title="今日任务">
            <div className="space-y-3">
              <div>
                <div className="flex items-center justify-between text-xs text-[var(--color-text-muted)]">
                  <span>生产总进度</span>
                  <span>{completedSteps}/9</span>
                </div>
                <ProgressBar value={Math.round((completedSteps / 9) * 100)} variant="aurora" />
              </div>
              <Link href={activeStep?.href || `/projects/${project.id}/story`}>
                <Button className="w-full" variant="aurora" icon={<ArrowRight size={14} />}>打开阶段页面</Button>
              </Link>
              <Link href={`/projects/${project.id}/tasks`}>
                <Button className="w-full" variant="outline" icon={<ListChecks size={14} />}>查看任务队列</Button>
              </Link>
              <div className="space-y-2">
                {tasks.slice(0, 5).map((task) => (
                  <div key={task.id} className="flex items-center gap-2 rounded-[var(--radius-md)] bg-[var(--bg-panel)] px-2.5 py-2">
                    <TaskStatusIcon status={task.status} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-xs font-medium text-[var(--color-text-primary)]">{taskLabels[task.taskType] || task.taskType}</div>
                      <div className="text-[11px] text-[var(--color-text-muted)]">{task.progress}% · {statusLabel(task.status)}</div>
                    </div>
                  </div>
                ))}
                {tasks.length === 0 && <div className="text-xs text-[var(--color-text-muted)]">暂无任务记录。</div>}
              </div>
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
            更新于 {formatDateTime(project.updatedAt)} · {sceneList.length} 个场景 · 输出 {project.aspectRatio || '9:16'} · {project.targetPlatform || '短视频平台'}
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

function InfoLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[54px_minmax(0,1fr)] gap-2">
      <span className="text-[var(--color-text-muted)]">{label}</span>
      <span className="truncate text-[var(--color-text-primary)]">{value}</span>
    </div>
  )
}

function shotsByNo<T extends { shot?: { shotNo?: number | null } }>(groups: T[]) {
  return [...groups].sort((a, b) => (a.shot?.shotNo || 0) - (b.shot?.shotNo || 0))
}
