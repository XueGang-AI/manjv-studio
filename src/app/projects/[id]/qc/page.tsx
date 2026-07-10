'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { AlertCircle, AlertTriangle, CheckCircle2, Loader2, Play, RefreshCcw, ShieldCheck } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  CompactMetricCard,
  EmptyState,
  Panel,
  WorkbenchImage,
  WorkbenchPageHeader,
  formatDateTime,
} from '@/components/production-workbench/workbench-ui'
import { cn } from '@/lib/utils'
import { preferredRepairIssue, repairButtonLabel } from './repair-priority'

interface QCIssue {
  level?: string
  field?: string
  problem?: string
  suggestion?: string
  shotNo?: number
  timeRange?: string
  issueType?: string
  severity?: 'P0' | 'P1' | 'P2' | 'P3'
  recommendedAction?: string
  regenerationIssueTypes?: string[]
  fixNote?: string
  repairTarget?: {
    kind?: string
    shotId?: string
    shotNo?: number
    issueTypes?: string[]
    fixNote?: string
  }
  repairSequence?: Array<NonNullable<QCIssue['repairTarget']>>
}

interface QCResult {
  score: number
  passed: boolean
  level: string
  issues: QCIssue[]
  summary: string
  rewrite_required: boolean
}

interface QCReport {
  id: string
  score: number | null
  passed: boolean
  issues: QCIssue[] | null
  createdAt: string
}

interface ShotImageGroup {
  shot?: {
    id: string
    shotNo: number
    shotName?: string | null
    location?: string | null
    startTime?: number | null
    endTime?: number | null
  }
  images?: Array<{ id: string; imageUrl?: string | null; isConfirmed?: boolean; isSelected?: boolean }>
}

export default function QCProjectPage() {
  const params = useParams()
  const projectId = params.id as string
  const [episodeId, setEpisodeId] = useState<string | null>(null)
  const [results, setResults] = useState<QCResult[]>([])
  const [reports, setReports] = useState<QCReport[]>([])
  const [running, setRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [selectedIssueIndex, setSelectedIssueIndex] = useState(0)
  const [shotImageGroups, setShotImageGroups] = useState<ShotImageGroup[]>([])
  const [repairingKey, setRepairingKey] = useState<string | null>(null)
  const [repairMessage, setRepairMessage] = useState<string | null>(null)

  const fetchReports = useCallback(async (resolvedEpisodeId?: string | null) => {
    const url = resolvedEpisodeId
      ? `/api/projects/${projectId}/episodes/${resolvedEpisodeId}/qc/reports`
      : `/api/projects/${projectId}/qc/reports`
    const res = await fetch(url)
    const data = await res.json()
    if (data.success) setReports(data.data || [])
    setLoading(false)
  }, [projectId])

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const projectJson = await fetch(`/api/projects/${projectId}`).then((res) => res.json())
        const firstEpisode = projectJson.data?.episodes?.find((episode: { episodeNo: number }) => episode.episodeNo === 1) || projectJson.data?.episodes?.[0]
        if (cancelled) return
        setEpisodeId(firstEpisode?.id || null)
        await Promise.all([
          fetchReports(firstEpisode?.id || null),
          firstEpisode?.id
            ? fetch(`/api/projects/${projectId}/episodes/${firstEpisode.id}/shot-images`)
              .then((res) => res.json())
              .then((payload) => {
                if (payload.success && !cancelled) setShotImageGroups((payload.data?.shots || []).sort((a: ShotImageGroup, b: ShotImageGroup) => (a.shot?.shotNo || 0) - (b.shot?.shotNo || 0)))
              })
              .catch(() => undefined)
            : Promise.resolve(),
        ])
      } catch {
        if (!cancelled) {
          setError('QC 报告加载失败')
          setLoading(false)
        }
      }
    }
    load()
    return () => { cancelled = true }
  }, [fetchReports, projectId])

  const runQC = async () => {
    setRunning(true)
    setError(null)
    setResults([])
    try {
      const res = await fetch(`/api/projects/${projectId}/qc/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(episodeId ? { episode_id: episodeId } : {}),
      })
      const data = await res.json()
      if (data.success) {
        setResults(data.data.results || [])
        await fetchReports(episodeId)
      } else {
        setError(data.error || 'QC 运行失败')
      }
    } catch {
      setError('QC 运行失败')
    } finally {
      setRunning(false)
    }
  }

  const runRepair = async (issue: QCIssue) => {
    if (!episodeId) {
      setError('缺少剧集 ID，无法执行返工')
      return
    }
    const target = issue.repairTarget
    if (!target?.kind) {
      setError('该问题没有结构化修复目标')
      return
    }
    if ((target.kind === 'shot_image' || target.kind === 'shot_video') && !target.shotId) {
      setError('该问题未定位到具体镜头，需先人工确认问题镜头')
      return
    }

    const label = repairTargetLabel(target)
    if (!window.confirm(`${label} 会触发真实生成任务，可能消耗 Ark 额度。确认继续？`)) return

    const key = repairTargetKey(issue)
    setRepairingKey(key)
    setRepairMessage(null)
    setError(null)

    try {
      let url = ''
      let body: Record<string, unknown> = {}
      if (target.kind === 'shot_image') {
        url = `/api/projects/${projectId}/episodes/${episodeId}/shots/${target.shotId}/images/regenerate`
        body = {
          issueTypes: target.issueTypes || issue.regenerationIssueTypes || [],
          fixNote: target.fixNote || issue.fixNote || '',
          clientRequestId: `qc-${Date.now()}-${target.kind}-${target.shotId}`,
        }
      } else if (target.kind === 'shot_video') {
        url = `/api/projects/${projectId}/episodes/${episodeId}/shots/${target.shotId}/videos/regenerate`
        body = {
          issueTypes: target.issueTypes || issue.regenerationIssueTypes || [],
          fixNote: target.fixNote || issue.fixNote || '',
          clientRequestId: `qc-${Date.now()}-${target.kind}-${target.shotId}`,
        }
      } else if (target.kind === 'final_render') {
        url = `/api/projects/${projectId}/episodes/${episodeId}/final-preview/render`
        body = { transitionMode: 'auto' }
      } else {
        throw new Error('未知修复目标')
      }

      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.success) {
        const message = typeof data.error === 'string' ? data.error : data.error?.message || '返工任务创建失败'
        throw new Error(message)
      }
      setRepairMessage(data.data?.taskId
        ? `${label}任务已创建：${data.data.taskId}`
        : `${label}候选已创建：${data.data?.candidateId || data.data?.count || '已提交'}`)
    } catch (repairError) {
      setError((repairError as Error).message || '返工失败')
    } finally {
      setRepairingKey(null)
    }
  }

  const issues = useMemo(() => {
    const fresh = results.flatMap((result) => result.issues || [])
    if (results.length > 0) return fresh
    return reports[0]?.issues || []
  }, [reports, results])

  const safeSelectedIssueIndex = issues.length ? Math.min(selectedIssueIndex, issues.length - 1) : 0
  const selectedIssue = issues[safeSelectedIssueIndex] || null
  const selectedRepairIssue = selectedIssue ? preferredRepairIssue(selectedIssue, issues) : null
  const selectedRepairKey = selectedRepairIssue ? repairTargetKey(selectedRepairIssue) : ''
  const selectedCanRepair = !!selectedRepairIssue && canRunRepair(selectedRepairIssue)
  const selectedShotGroup = selectedIssue?.shotNo
    ? shotImageGroups.find((group) => group.shot?.shotNo === selectedIssue.shotNo)
    : shotImageGroups[0]
  const selectedShotFrame = selectedShotGroup?.images?.find((image) => image.isConfirmed) || selectedShotGroup?.images?.find((image) => image.isSelected) || selectedShotGroup?.images?.[0]
  const referenceShotFrame = selectedIssue?.shotNo
    ? (shotImageGroups.find((group) => group.shot?.shotNo === Math.max(1, (selectedIssue.shotNo || 1) - 1))?.images?.find((image) => image.isConfirmed) || shotImageGroups[0]?.images?.find((image) => image.isConfirmed) || shotImageGroups[0]?.images?.[0])
    : shotImageGroups[0]?.images?.[0]
  const score = results.length > 0
    ? Math.round(results.reduce((sum, result) => sum + result.score, 0) / results.length)
    : reports[0]?.score ?? 0
  const latestReport = reports[0] || null
  const historicalIssueCount = reports.slice(1).reduce((sum, report) => sum + (report.issues?.length || 0), 0)
  const severityCounts = useMemo(() => ({
    P0: issues.filter((issue) => normalizedSeverity(issue) === 'P0').length,
    P1: issues.filter((issue) => normalizedSeverity(issue) === 'P1').length,
    P2: issues.filter((issue) => normalizedSeverity(issue) === 'P2').length,
    P3: issues.filter((issue) => normalizedSeverity(issue) === 'P3').length,
  }), [issues])

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 size={32} className="animate-spin text-[var(--color-text-muted)]" />
      </div>
    )
  }

  return (
    <div className="space-y-4 p-4">
      <WorkbenchPageHeader
        eyebrow="Quality control"
        title="QC 质检"
        description="规则 QC 会输出评分、严重程度、镜头号、时间段、问题类型和建议动作；缺失字段按旧报告结构降级展示。"
        actions={
          <div className="flex flex-col items-end gap-1">
            <Button onClick={runQC} disabled={running} variant="aurora" icon={running ? <Loader2 size={16} className="animate-spin" /> : <Play size={16} />}>
              {running ? '检测中...' : '运行 QC'}
            </Button>
            <span className="text-[11px] text-[var(--color-text-muted)]">只读取现有产物，不触发图片/视频生成</span>
          </div>
        }
      />

      {error && (
        <div className="rounded-[var(--radius-md)] border border-[var(--color-danger)]/30 bg-[var(--color-danger-muted)] p-3 text-sm text-[var(--color-danger)]">
          {error}
        </div>
      )}
      {repairMessage && (
        <div className="rounded-[var(--radius-md)] border border-[var(--color-success)]/30 bg-[var(--color-success-muted)] p-3 text-sm text-[var(--color-success)]">
          {repairMessage}
        </div>
      )}

      <div className="grid gap-2 md:grid-cols-5">
        <CompactMetricCard label="总体评分" value={score || '-'} helper={score ? scoreLabel(score) : '尚未检测'} icon={<ShieldCheck size={15} />} tone={score >= 75 ? 'success' : score ? 'warning' : 'default'} progress={score || 0} />
        <CompactMetricCard label="P0" value={severityCounts.P0} helper="阻塞发布" icon={<AlertTriangle size={15} />} tone={severityCounts.P0 ? 'danger' : 'success'} />
        <CompactMetricCard label="P1" value={severityCounts.P1} helper="高优先级" icon={<AlertCircle size={15} />} tone={severityCounts.P1 ? 'danger' : 'success'} />
        <CompactMetricCard label="P2" value={severityCounts.P2} helper="建议优化" icon={<AlertCircle size={15} />} tone={severityCounts.P2 ? 'warning' : 'success'} />
        <CompactMetricCard label="P3" value={severityCounts.P3} helper="可接受风险" icon={<CheckCircle2 size={15} />} tone="info" />
      </div>

      <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-3">
        <div className="grid gap-3 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
        <Panel
          title="当前报告问题"
          description={issues.length ? `${issues.length} 条当前问题，按严重程度与镜头位置追踪。` : latestReport ? `最新报告 ${formatDateTime(latestReport.createdAt)} 未返回当前问题。` : '尚未生成 QC 报告。'}
          bodyClassName="p-2"
        >
          {issues.length === 0 ? (
            <EmptyState icon={<ShieldCheck size={24} />} title="当前无阻断问题" description={reports.length || results.length ? historicalIssueCount ? `历史报告里还有 ${historicalIssueCount} 条旧问题，已移到右侧历史报告中。` : '最新报告没有返回问题项。' : '点击运行 QC 开始检查项目。'} />
          ) : (
            <div className="overflow-hidden rounded-[var(--radius-lg)] border border-[var(--color-border-dim)]">
              <div className="grid grid-cols-[48px_62px_minmax(0,1fr)_82px] gap-2 border-b border-[var(--color-border-dim)] bg-[var(--bg-panel)] px-2.5 py-1.5 text-[10px] font-medium uppercase tracking-[0.1em] text-[var(--color-text-muted)]">
                <div>严重级别</div>
                <div>镜头</div>
                <div>描述</div>
                <div>建议动作</div>
              </div>
              <div className="max-h-[184px] divide-y divide-[var(--color-border-dim)] overflow-y-auto">
                {issues.map((issue, index) => (
                  <button
                    key={`${issue.field || issue.issueType || 'issue'}-${index}`}
                    onClick={() => setSelectedIssueIndex(index)}
                    className={cn(
                      'grid w-full grid-cols-[48px_62px_minmax(0,1fr)_82px] gap-2 px-2.5 py-2 text-left text-sm transition-colors hover:bg-[var(--bg-hover)]',
                      safeSelectedIssueIndex === index ? 'bg-[var(--color-primary-muted)]/50' : 'bg-[var(--bg-elevated)]',
                    )}
                  >
                    <div><SeverityBadge severity={normalizedSeverity(issue)} /></div>
                    <div className="text-[var(--color-text-secondary)]">{issue.shotNo ? `镜头 ${issue.shotNo}` : '-'}</div>
                    <div>
                      <div className="truncate text-xs font-medium text-[var(--color-text-primary)]">{issueProblemLabel(issue)}</div>
                      <div className="truncate text-[11px] text-[var(--color-text-muted)]">{issueTypeLabel(issue.issueType || issue.field)}</div>
                    </div>
                    <div className="truncate text-xs text-[var(--color-text-secondary)]">{actionLabel(issue.recommendedAction)}</div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </Panel>

        <Panel title="帧序列证据" description="按镜头顺序展示可审计首帧，选中 QC 问题后定位对应镜头。" bodyClassName="p-2">
          {shotImageGroups.length === 0 ? (
            <EmptyState title="暂无帧证据" description="分镜图生成后会在这里展示帧序列。" />
          ) : (
            <div className="grid grid-cols-4 gap-1.5 xl:grid-cols-6">
              {shotImageGroups.slice(0, 12).map((group) => {
                const image = group.images?.find((item) => item.isConfirmed) || group.images?.[0]
                const active = selectedIssue?.shotNo === group.shot?.shotNo
                return (
                  <button
                    key={group.shot?.id || group.shot?.shotNo}
                    type="button"
                    onClick={() => {
                      const index = issues.findIndex((issue) => issue.shotNo === group.shot?.shotNo)
                      if (index >= 0) setSelectedIssueIndex(index)
                    }}
                    className={`rounded-[var(--radius-sm)] border p-1 text-left ${active ? 'border-[var(--color-primary)] bg-[var(--color-primary-muted)]' : 'border-[var(--color-border-dim)] bg-[var(--bg-panel)]'}`}
                  >
                    <WorkbenchImage src={image?.imageUrl} alt={`镜头 ${group.shot?.shotNo || ''}`} className="aspect-[4/3] rounded-[var(--radius-sm)]" />
                    <div className="mt-1 flex items-center justify-between text-[11px]">
                      <span className="font-mono text-[var(--color-text-primary)]">{String(group.shot?.shotNo || '-').padStart(2, '0')}</span>
                      <span className="truncate text-[var(--color-text-muted)]">{group.shot?.location || '场景'}</span>
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </Panel>
        </div>

          <Panel title="选中问题详情" bodyClassName="p-3">
            {selectedIssue ? (
              <div className="grid gap-3 xl:grid-cols-[240px_minmax(0,1fr)_220px]">
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <SeverityBadge severity={normalizedSeverity(selectedIssue)} />
                    <Badge variant="default">{selectedIssue.timeRange || '无时间段'}</Badge>
                  </div>
                  <div>
                    <div className="text-sm font-semibold leading-5 text-[var(--color-text-primary)]">{issueProblemLabel(selectedIssue)}</div>
                    {selectedIssue.suggestion && <p className="mt-2 line-clamp-4 text-xs leading-5 text-[var(--color-text-muted)]">{selectedIssue.suggestion}</p>}
                  </div>
                  <div className="space-y-1.5 text-xs">
                    <Info label="镜头号" value={selectedIssue.shotNo ? String(selectedIssue.shotNo) : '-'} />
                    <Info label="问题类型" value={issueTypeLabel(selectedIssue.issueType || selectedIssue.field)} />
                    <Info label="建议动作" value={actionLabel(selectedIssue.recommendedAction)} />
                    <Info label="重生参数" value={issueTypesLabel(selectedIssue.regenerationIssueTypes)} />
                    <Info label="修复目标" value={repairTargetLabel(selectedIssue.repairTarget)} />
                    <Info label="后续动作" value={repairSequenceLabel(selectedIssue.repairSequence)} />
                    {selectedRepairIssue && selectedRepairIssue !== selectedIssue && (
                      <Info label="优先目标" value={repairTargetLabel(selectedRepairIssue.repairTarget)} />
                    )}
                  </div>
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  <FrameCard title="参考帧" src={referenceShotFrame?.imageUrl} />
                  <FrameCard title="问题帧" src={selectedShotFrame?.imageUrl} active />
                </div>
                <div className="flex flex-col justify-between gap-2 rounded-[var(--radius-md)] border border-[var(--color-border-dim)] bg-[var(--bg-panel)] p-3">
                  <div className="space-y-2 text-xs text-[var(--color-text-secondary)]">
                    <Info label="时间段" value={selectedIssue.timeRange || '-'} />
                    <Info label="字段" value={selectedIssue.field || '-'} />
                    <Info label="镜头 ID" value={selectedIssue.repairTarget?.shotId || '-'} />
                    <Info label="返工说明" value={selectedIssue.fixNote || '-'} />
                  </div>
                  <div className="grid gap-2">
                    <Button
                      size="sm"
                      variant="aurora"
                      className="w-full"
                      icon={repairingKey === selectedRepairKey ? <Loader2 size={14} className="animate-spin" /> : <RefreshCcw size={14} />}
                      disabled={!selectedCanRepair || repairingKey === selectedRepairKey}
                      onClick={() => selectedRepairIssue && runRepair(selectedRepairIssue)}
                    >
                      {repairingKey === selectedRepairKey ? '返工提交中' : repairButtonLabel(selectedRepairIssue)}
                    </Button>
                    <Link href={episodeId ? `/projects/${projectId}/episodes/${episodeId}/shot-images` : `/projects/${projectId}/qc`}>
                      <Button size="sm" variant="outline" className="w-full">查看分镜证据</Button>
                    </Link>
                    <Link href={episodeId ? `/projects/${projectId}/episodes/${episodeId}/shot-videos` : `/projects/${projectId}/qc`}>
                      <Button size="sm" variant="aurora" className="w-full">进入视频返工</Button>
                    </Link>
                  </div>
                </div>
              </div>
            ) : (
              <EmptyState title="未选中问题" description="QC 运行后可在这里查看问题细节。" />
            )}
          </Panel>
        </div>

        <div className="space-y-4">
          <Panel title="自动化媒体检测" bodyClassName="p-3">
            <div className="space-y-2">
              <ChecklistItem label="成片可播放 / ffprobe 校验" issues={issues} match="final_media" />
              <ChecklistItem label="音轨与响度检查" issues={issues} match="audio|loudness" />
              <ChecklistItem label="黑屏 / 冻结 / 静音" issues={issues} match="black|freeze|silent" />
              <ChecklistItem label="手机屏幕禁用项" issues={issues} match="phone|screen|prompt_phone_safety" />
              <ChecklistItem label="参考图数量与一致性" issues={issues} match="reference_count" />
            </div>
          </Panel>

          <Panel title="剧情与一致性检查" bodyClassName="p-3">
            <div className="space-y-2">
              <ChecklistItem label="人物一致性" issues={issues} match="character|face|hair|人物|角色" />
              <ChecklistItem label="场景连续性" issues={issues} match="scene|location|场景" />
              <ChecklistItem label="道具/手机安全" issues={issues} match="prop|phone|screen|logo|文字" />
              <ChecklistItem label="剧情节点完整" issues={issues} match="story|plot|剧情" />
            </div>
          </Panel>

          <Panel title="历史报告" bodyClassName="p-3">
            {reports.length === 0 ? (
              <div className="text-sm text-[var(--color-text-muted)]">暂无历史报告。</div>
            ) : (
              <div className="space-y-2">
                {reports.slice(0, 8).map((report) => (
                  <div key={report.id} className="flex items-center justify-between gap-3 rounded-[var(--radius-md)] bg-[var(--bg-panel)] px-3 py-2 text-sm">
                    <span className="font-mono text-[var(--color-text-primary)]">{report.score ?? '-'}</span>
                    <Badge variant={report.passed ? 'success' : 'warning'}>{report.passed ? '通过' : '需处理'}</Badge>
                    <span className="text-xs text-[var(--color-text-muted)]">{report.issues?.length || 0} 问题</span>
                    <span className="truncate text-xs text-[var(--color-text-muted)]">{formatDateTime(report.createdAt)}</span>
                  </div>
                ))}
              </div>
            )}
          </Panel>
        </div>
      </div>
    </div>
  )
}

function normalizedSeverity(issue: QCIssue): 'P0' | 'P1' | 'P2' | 'P3' {
  if (issue.severity) return issue.severity
  if (issue.level === 'high') return 'P1'
  if (issue.level === 'medium') return 'P2'
  return 'P3'
}

function SeverityBadge({ severity }: { severity: 'P0' | 'P1' | 'P2' | 'P3' }) {
  const variant = severity === 'P0' || severity === 'P1' ? 'danger' : severity === 'P2' ? 'warning' : 'info'
  return <Badge variant={variant}>{severity}</Badge>
}

function actionLabel(action?: string) {
  const map: Record<string, string> = {
    accept: '接受风险',
    rerun_shot_image: '重跑分镜图',
    rerun_shot_video: '重跑视频',
    rerender_final: '重新合成',
  }
  return action ? map[action] || action : '-'
}

function issueTypeLabel(value?: string | null) {
  const map: Record<string, string> = {
    reference_count: '参考图数量与一致性',
    prompt_phone_safety: '手机屏幕安全',
    shot_image_partial_black: '分镜图局部黑边',
    shot_video_partial_black: '视频局部黑边',
    final_visual_partial_black: '成片局部黑边',
    visual_qc_unavailable: '视觉检测不可用',
    shot_image_missing: '分镜图缺失',
    shot_video_missing: '视频缺失',
    final_media: '成片媒体校验',
    final_video_missing: '成片缺失',
    final_media_unavailable: '成片媒体不可用',
    final_media_invalid: '成片媒体无效',
    final_audio_missing: '成片音轨缺失',
    final_loudness_low: '成片响度偏低',
    final_black_frames: '成片黑屏风险',
    final_freeze: '成片冻结风险',
    black_frame: '黑屏风险',
    freeze_frame: '冻结风险',
    silent_audio: '静音风险',
    loudness: '响度问题',
    audio: '音轨问题',
  }
  if (!value) return '-'
  return map[value] || value.replace(/_/g, ' ')
}

function issueTypesLabel(values?: string[]) {
  if (!values || values.length === 0) return '-'
  const map: Record<string, string> = {
    character_drift: '人物漂移',
    hair_inconsistent: '发型不一致',
    scene_drift: '场景漂移',
    phone_fake_ui_text: '手机伪 UI/文字',
    fake_text_or_map: '伪文字/伪地图',
    invalid_composition: '黑边/无效构图',
    large_motion_or_hand_deform: '动作/手部问题',
    audio_issue: '音频问题',
    other: '其他',
  }
  return values.map(value => map[value] || value).join('、')
}

function repairTargetLabel(target?: QCIssue['repairTarget']) {
  if (!target?.kind) return '-'
  const map: Record<string, string> = {
    shot_image: '重生分镜图',
    shot_video: '重生视频片段',
    final_render: '重新合成成片',
  }
  const base = map[target.kind] || target.kind
  return target.shotNo ? `${base} · 镜头 ${target.shotNo}` : base
}

function repairSequenceLabel(sequence?: QCIssue['repairSequence']) {
  if (!sequence || sequence.length <= 1) return '-'
  return sequence.map(repairTargetLabel).join(' → ')
}

function repairTargetKey(issue: QCIssue) {
  const target = issue.repairTarget
  return [
    target?.kind || 'none',
    target?.shotId || target?.shotNo || 'global',
    issue.issueType || issue.field || 'issue',
  ].join(':')
}

function canRunRepair(issue: QCIssue) {
  const target = issue.repairTarget
  if (!target?.kind) return false
  if (target.kind === 'shot_image' || target.kind === 'shot_video') return !!target.shotId
  return target.kind === 'final_render'
}

function issueProblemLabel(issue: QCIssue) {
  if (issue.problem && !/^[a-z0-9_.-]+$/i.test(issue.problem)) return issue.problem
  const type = issueTypeLabel(issue.issueType || issue.field)
  if (issue.shotNo) return `镜头 ${issue.shotNo} 需要检查：${type}`
  return type === '-' ? '存在质量风险' : type
}

function scoreLabel(score: number) {
  if (score >= 90) return '优秀'
  if (score >= 75) return '良好'
  if (score >= 60) return '需优化'
  return '不通过'
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-[var(--color-border-dim)] pb-2">
      <span className="text-[var(--color-text-muted)]">{label}</span>
      <span className="truncate text-right text-[var(--color-text-primary)]">{value}</span>
    </div>
  )
}

function FrameCard({ title, src, active }: { title: string; src?: string | null; active?: boolean }) {
  return (
    <div className={`rounded-[var(--radius-md)] border p-2 ${active ? 'border-[var(--color-primary)] bg-[var(--color-primary-muted)]/45' : 'border-[var(--color-border-dim)] bg-[var(--bg-panel)]'}`}>
      <div className="mb-2 flex items-center justify-between text-xs">
        <span className="font-medium text-[var(--color-text-secondary)]">{title}</span>
        {active && <Badge variant="primary">当前问题</Badge>}
      </div>
      <WorkbenchImage src={src} alt={title} className="aspect-video" />
    </div>
  )
}

function ChecklistItem({ label, issues, match }: { label: string; issues: QCIssue[]; match: string }) {
  const regex = new RegExp(match, 'i')
  const hasIssue = issues.some((issue) => regex.test(`${issue.issueType || ''} ${issue.field || ''} ${issue.problem || ''}`))
  return (
    <div className="flex items-center justify-between rounded-[var(--radius-md)] bg-[var(--bg-panel)] px-3 py-2 text-sm">
      <span className="text-[var(--color-text-secondary)]">{label}</span>
      <Badge variant={hasIssue ? 'warning' : 'success'}>{hasIssue ? '需关注' : '通过'}</Badge>
    </div>
  )
}
