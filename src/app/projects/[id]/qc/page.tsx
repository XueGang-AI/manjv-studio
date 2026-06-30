'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useParams } from 'next/navigation'
import { AlertCircle, AlertTriangle, CheckCircle2, Loader2, Play, ShieldCheck } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  EmptyState,
  MetricCard,
  Panel,
  WorkbenchPageHeader,
  formatDateTime,
} from '@/components/production-workbench/workbench-ui'
import { cn } from '@/lib/utils'

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
        await fetchReports(firstEpisode?.id || null)
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

  const issues = useMemo(() => {
    const fresh = results.flatMap((result) => result.issues || [])
    if (fresh.length > 0) return fresh
    return reports.flatMap((report) => report.issues || [])
  }, [reports, results])

  const selectedIssue = issues[selectedIssueIndex] || issues[0] || null
  const score = results.length > 0
    ? Math.round(results.reduce((sum, result) => sum + result.score, 0) / results.length)
    : reports[0]?.score ?? 0
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
    <div className="space-y-5 p-5">
      <WorkbenchPageHeader
        eyebrow="Quality control"
        title="QC 质检"
        description="规则 QC 会输出评分、严重程度、镜头号、时间段、问题类型和建议动作；缺失字段按旧报告结构降级展示。"
        actions={
          <Button onClick={runQC} disabled={running} variant="aurora" icon={running ? <Loader2 size={16} className="animate-spin" /> : <Play size={16} />}>
            {running ? '检测中...' : '运行 QC'}
          </Button>
        }
      />

      {error && (
        <div className="rounded-[var(--radius-md)] border border-[var(--color-danger)]/30 bg-[var(--color-danger-muted)] p-3 text-sm text-[var(--color-danger)]">
          {error}
        </div>
      )}

      <div className="grid gap-3 md:grid-cols-5">
        <MetricCard label="总体评分" value={score || '-'} helper={score ? scoreLabel(score) : '尚未检测'} icon={<ShieldCheck size={18} />} tone={score >= 75 ? 'success' : score ? 'warning' : 'default'} />
        <MetricCard label="P0 严重问题" value={severityCounts.P0} helper="阻塞发布" icon={<AlertTriangle size={18} />} tone={severityCounts.P0 ? 'danger' : 'success'} />
        <MetricCard label="P1 高优先级" value={severityCounts.P1} helper="尽快修复" icon={<AlertCircle size={18} />} tone={severityCounts.P1 ? 'danger' : 'success'} />
        <MetricCard label="P2 中优先级" value={severityCounts.P2} helper="建议优化" icon={<AlertCircle size={18} />} tone={severityCounts.P2 ? 'warning' : 'success'} />
        <MetricCard label="P3 低优先级" value={severityCounts.P3} helper="可接受风险" icon={<CheckCircle2 size={18} />} tone="info" />
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <Panel title="问题列表" description={`${issues.length} 条问题，按严重程度与镜头位置追踪。`}>
          {issues.length === 0 ? (
            <EmptyState icon={<ShieldCheck size={24} />} title="暂无 QC 问题" description={reports.length || results.length ? '最近报告没有返回问题项。' : '点击运行 QC 开始检查项目。'} />
          ) : (
            <div className="overflow-hidden rounded-[var(--radius-lg)] border border-[var(--color-border-dim)]">
              <div className="grid grid-cols-[86px_90px_120px_minmax(0,1fr)_150px] gap-3 border-b border-[var(--color-border-dim)] bg-[var(--bg-panel)] px-3 py-2 text-xs font-medium text-[var(--color-text-muted)]">
                <div>严重级别</div>
                <div>镜头</div>
                <div>问题类型</div>
                <div>描述</div>
                <div>建议动作</div>
              </div>
              <div className="divide-y divide-[var(--color-border-dim)]">
                {issues.map((issue, index) => (
                  <button
                    key={`${issue.field || issue.issueType || 'issue'}-${index}`}
                    onClick={() => setSelectedIssueIndex(index)}
                    className={cn(
                      'grid w-full grid-cols-[86px_90px_120px_minmax(0,1fr)_150px] gap-3 px-3 py-3 text-left text-sm transition-colors hover:bg-[var(--bg-hover)]',
                      selectedIssueIndex === index ? 'bg-[var(--color-primary-muted)]/50' : 'bg-[var(--bg-elevated)]',
                    )}
                  >
                    <div><SeverityBadge severity={normalizedSeverity(issue)} /></div>
                    <div className="text-[var(--color-text-secondary)]">{issue.shotNo ? `镜头 ${issue.shotNo}` : '-'}</div>
                    <div className="truncate font-mono text-xs text-[var(--color-text-muted)]">{issue.issueType || issue.field || '-'}</div>
                    <div className="truncate text-[var(--color-text-primary)]">{issue.problem || '未提供问题描述'}</div>
                    <div className="truncate text-xs text-[var(--color-text-secondary)]">{actionLabel(issue.recommendedAction)}</div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </Panel>

        <div className="space-y-5">
          <Panel title="选中问题详情">
            {selectedIssue ? (
              <div className="space-y-4">
                <div className="flex items-center justify-between gap-3">
                  <SeverityBadge severity={normalizedSeverity(selectedIssue)} />
                  <Badge variant="default">{selectedIssue.timeRange || '无时间段'}</Badge>
                </div>
                <div>
                  <div className="text-sm font-semibold text-[var(--color-text-primary)]">{selectedIssue.problem || '未提供问题描述'}</div>
                  {selectedIssue.suggestion && <p className="mt-2 text-sm leading-6 text-[var(--color-text-muted)]">{selectedIssue.suggestion}</p>}
                </div>
                <div className="space-y-2 text-sm">
                  <Info label="镜头号" value={selectedIssue.shotNo ? String(selectedIssue.shotNo) : '-'} />
                  <Info label="时间段" value={selectedIssue.timeRange || '-'} />
                  <Info label="字段" value={selectedIssue.field || '-'} />
                  <Info label="问题类型" value={selectedIssue.issueType || '-'} />
                  <Info label="建议动作" value={actionLabel(selectedIssue.recommendedAction)} />
                </div>
              </div>
            ) : (
              <EmptyState title="未选中问题" description="QC 运行后可在这里查看问题细节。" />
            )}
          </Panel>

          <Panel title="媒体与剧情检查">
            <div className="space-y-2">
              <ChecklistItem label="成片可播放 / ffprobe 校验" issues={issues} match="final_media" />
              <ChecklistItem label="音轨与响度检查" issues={issues} match="audio|loudness" />
              <ChecklistItem label="黑屏 / 冻结 / 静音" issues={issues} match="black|freeze|silent" />
              <ChecklistItem label="手机屏幕禁用项" issues={issues} match="phone|screen|prompt_phone_safety" />
              <ChecklistItem label="参考图数量与一致性" issues={issues} match="reference_count" />
            </div>
          </Panel>

          <Panel title="历史报告">
            {reports.length === 0 ? (
              <div className="text-sm text-[var(--color-text-muted)]">暂无历史报告。</div>
            ) : (
              <div className="space-y-2">
                {reports.slice(0, 8).map((report) => (
                  <div key={report.id} className="flex items-center justify-between gap-3 rounded-[var(--radius-md)] bg-[var(--bg-panel)] px-3 py-2 text-sm">
                    <span className="font-mono text-[var(--color-text-primary)]">{report.score ?? '-'}</span>
                    <Badge variant={report.passed ? 'success' : 'warning'}>{report.passed ? '通过' : '需处理'}</Badge>
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
