'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useParams } from 'next/navigation'
import {
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Clock,
  FileText,
  ListChecks,
  Loader2,
  RefreshCw,
  RotateCcw,
  Server,
  Trash2,
  X,
  XCircle,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ProgressBar } from '@/components/ui/progress-bar'
import { useTaskSSE } from '@/lib/hooks/use-task-sse'
import {
  EmptyState,
  MetricCard,
  Panel,
  StatusPill,
  TaskStatusIcon,
  WorkbenchPageHeader,
  formatDateTime,
} from '@/components/production-workbench/workbench-ui'

const STATUS_CONFIG: Record<string, { variant: 'default'|'success'|'warning'|'danger'|'info'; label: string }> = {
  pending: { variant: 'default', label: '队列中' },
  running: { variant: 'info', label: '运行中' },
  success: { variant: 'success', label: '成功' },
  failed: { variant: 'danger', label: '失败' },
  cancelled: { variant: 'warning', label: '已取消' },
  retrying: { variant: 'warning', label: '重试中' },
}

const TASK_LABELS: Record<string, string> = {
  GENERATE_STORY_PACKAGE: '故事方案生成',
  GENERATE_CHARACTERS: '角色设定生成',
  GENERATE_CHARACTER_IMAGES: '角色图生成',
  GENERATE_STORYBOARD: '分镜脚本生成',
  GENERATE_SCENE_REFERENCES: '场景参考图生成',
  GENERATE_SHOT_IMAGES: '分镜图生成',
  GENERATE_SHOT_VIDEOS: '视频片段生成',
  RENDER_FINAL_VIDEO: 'FFmpeg 成片',
  QUALITY_CHECK: '质量检查',
}

const TERMINAL_STATUSES = ['success', 'failed', 'cancelled']
const ACTIVE_STATUSES = ['pending', 'running', 'retrying']

interface TaskItem {
  id: string
  taskType: string
  status: string
  progress: number
  retryCount: number
  maxRetries: number
  errorMessage: string | null
  startedAt: string | null
  finishedAt: string | null
  createdAt: string
  updatedAt?: string
}

interface LogItem {
  id: string
  level: string
  message: string
  createdAt: string
}

interface WorkerHealth {
  status: string
  checks?: Record<string, { status: string; latency?: number; note?: string }>
  workers?: Array<Record<string, unknown>>
}

export default function TasksPage() {
  const params = useParams()
  const projectId = params.id as string

  const [tasks, setTasks] = useState<TaskItem[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedTask, setExpandedTask] = useState<string | null>(null)
  const [logs, setLogs] = useState<LogItem[]>([])
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [streamConnected, setStreamConnected] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [health, setHealth] = useState<WorkerHealth | null>(null)

  const fetchTasks = useCallback(async () => {
    try {
      const res = await fetch(`/api/projects/${projectId}/tasks`)
      const data = await res.json()
      if (data.success) setTasks(data.data || [])
    } catch {
      setError('任务列表加载失败')
    } finally {
      setLoading(false)
    }
  }, [projectId])

  const fetchHealth = useCallback(async () => {
    try {
      const res = await fetch('/api/worker/health')
      const data = await res.json()
      if (data.success) setHealth(data.data)
    } catch {
      setHealth(null)
    }
  }, [])

  useEffect(() => {
    queueMicrotask(() => {
      fetchTasks()
      fetchHealth()
    })
  }, [fetchHealth, fetchTasks])

  useTaskSSE(projectId, {
    onTaskUpdate: () => {
      fetchTasks()
    },
    onSnapshot: (taskList) => {
      setTasks(taskList as TaskItem[])
    },
    onConnectionChange: (connected) => {
      setStreamConnected(connected)
    },
  })

  const fetchLogs = async (taskId: string) => {
    const res = await fetch(`/api/tasks/${taskId}/logs`)
    const data = await res.json()
    if (data.success) setLogs(data.data || [])
  }

  const toggleExpand = (taskId: string) => {
    if (expandedTask === taskId) {
      setExpandedTask(null)
      return
    }
    setExpandedTask(taskId)
    fetchLogs(taskId)
  }

  const handleRetry = async (taskId: string) => {
    setActionLoading(taskId)
    setError(null)
    try {
      const res = await fetch(`/api/tasks/${taskId}/retry`, { method: 'POST' })
      const data = await res.json()
      if (data.success) await fetchTasks()
      else setError(data.error || '重试失败')
    } catch {
      setError('重试请求失败')
    } finally {
      setActionLoading(null)
    }
  }

  const handleCancel = async (taskId: string) => {
    setActionLoading(taskId)
    setError(null)
    try {
      const res = await fetch(`/api/tasks/${taskId}/cancel`, { method: 'POST' })
      const data = await res.json()
      if (data.success) await fetchTasks()
      else setError(data.error || '取消失败')
    } catch {
      setError('取消请求失败')
    } finally {
      setActionLoading(null)
    }
  }

  const handleDelete = async (taskId: string) => {
    if (!confirm('确定删除该任务及其日志？此操作不可恢复。')) return
    setActionLoading(taskId)
    setError(null)
    try {
      const res = await fetch(`/api/tasks/${taskId}`, { method: 'DELETE' })
      const data = await res.json()
      if (data.success) {
        if (expandedTask === taskId) setExpandedTask(null)
        await fetchTasks()
      } else {
        setError(data.error || '删除失败')
      }
    } catch {
      setError('删除请求失败')
    } finally {
      setActionLoading(null)
    }
  }

  const handleClearFinished = async () => {
    const finishedCount = tasks.filter((task) => TERMINAL_STATUSES.includes(task.status)).length
    if (finishedCount === 0) return
    if (!confirm(`确定清除 ${finishedCount} 个已结束任务？此操作不可恢复。`)) return
    setActionLoading('clear')
    setError(null)
    try {
      const res = await fetch(`/api/projects/${projectId}/tasks`, { method: 'DELETE' })
      const data = await res.json()
      if (data.success) {
        if (expandedTask && !ACTIVE_STATUSES.includes(tasks.find((task) => task.id === expandedTask)?.status || '')) {
          setExpandedTask(null)
        }
        await fetchTasks()
      } else {
        setError(data.error || '批量清理失败')
      }
    } catch {
      setError('批量清理请求失败')
    } finally {
      setActionLoading(null)
    }
  }

  const summary = useMemo(() => {
    const queued = tasks.filter((task) => task.status === 'pending' || task.status === 'retrying').length
    const running = tasks.filter((task) => task.status === 'running').length
    const success = tasks.filter((task) => task.status === 'success').length
    const failed = tasks.filter((task) => task.status === 'failed').length
    const terminal = tasks.filter((task) => TERMINAL_STATUSES.includes(task.status)).length
    const successRate = terminal ? Math.round((success / terminal) * 100) : 0
    return { queued, running, success, failed, successRate }
  }, [tasks])

  const activeTask = tasks.find((task) => task.id === expandedTask) || tasks.find((task) => task.status === 'failed') || tasks[0]

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
        eyebrow="Operations"
        title="任务队列"
        description="生产任务、Worker 心跳、SSE 刷新和失败日志集中在这里，操作仍使用原有任务 API。"
        actions={
          <>
            {tasks.some((task) => TERMINAL_STATUSES.includes(task.status)) && (
              <Button variant="outline" onClick={handleClearFinished} disabled={actionLoading === 'clear'} icon={actionLoading === 'clear' ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}>
                清除已结束
              </Button>
            )}
            <Button variant="outline" onClick={() => { fetchTasks(); fetchHealth() }} icon={<RefreshCw size={14} />}>刷新</Button>
          </>
        }
      />

      {error && (
        <div className="flex items-start gap-2 rounded-[var(--radius-md)] border border-[var(--color-danger)]/30 bg-[var(--color-danger-muted)] p-3 text-sm text-[var(--color-danger)]">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          <span className="flex-1">{error}</span>
          <button onClick={() => setError(null)}><X size={14} /></button>
        </div>
      )}

      <div className="grid gap-3 md:grid-cols-5">
        <MetricCard label="队列中" value={summary.queued} helper="等待 Worker 领取" icon={<Clock size={18} />} tone="warning" />
        <MetricCard label="运行中" value={summary.running} helper="正在执行" icon={<RefreshCw size={18} />} tone="info" />
        <MetricCard label="已完成" value={summary.success} helper={`成功率 ${summary.successRate}%`} icon={<ListChecks size={18} />} tone="success" />
        <MetricCard label="失败" value={summary.failed} helper="需查看日志或重试" icon={<XCircle size={18} />} tone={summary.failed ? 'danger' : 'success'} />
        <MetricCard label="SSE" value={streamConnected ? '已连接' : '未连接'} helper="任务状态刷新" icon={<Server size={18} />} tone={streamConnected ? 'success' : 'warning'} />
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <Panel title="任务列表" description={`${tasks.length} 个任务，点击行查看详情和日志。`}>
          {tasks.length === 0 ? (
            <EmptyState icon={<FileText size={24} />} title="暂无任务记录" description="生成故事、角色、分镜、视频或成片后，任务会出现在这里。" />
          ) : (
            <div className="overflow-hidden rounded-[var(--radius-lg)] border border-[var(--color-border-dim)]">
              <div className="grid grid-cols-[minmax(220px,1fr)_110px_180px_110px_120px] gap-3 border-b border-[var(--color-border-dim)] bg-[var(--bg-panel)] px-3 py-2 text-xs font-medium text-[var(--color-text-muted)]">
                <div>任务类型</div>
                <div>状态</div>
                <div>进度</div>
                <div>重试</div>
                <div>操作</div>
              </div>
              <div className="divide-y divide-[var(--color-border-dim)]">
                {tasks.map((task) => {
                  const cfg = STATUS_CONFIG[task.status] || { variant: 'default' as const, label: task.status }
                  const isExpanded = expandedTask === task.id
                  const taskIsActive = ACTIVE_STATUSES.includes(task.status)
                  const taskIsTerminal = TERMINAL_STATUSES.includes(task.status)
                  return (
                    <div key={task.id}>
                      <button
                        onClick={() => toggleExpand(task.id)}
                        className="grid w-full grid-cols-[minmax(220px,1fr)_110px_180px_110px_120px] items-center gap-3 bg-[var(--bg-elevated)] px-3 py-3 text-left transition-colors hover:bg-[var(--bg-hover)]"
                      >
                        <div className="flex min-w-0 items-center gap-3">
                          <TaskStatusIcon status={task.status} />
                          <div className="min-w-0">
                            <div className="truncate text-sm font-medium text-[var(--color-text-primary)]">{TASK_LABELS[task.taskType] || task.taskType}</div>
                            <div className="truncate text-xs text-[var(--color-text-muted)]">{formatDateTime(task.createdAt)}</div>
                          </div>
                        </div>
                        <Badge variant={cfg.variant}>{cfg.label}</Badge>
                        <div className="flex items-center gap-2">
                          <ProgressBar value={task.progress} variant={task.status === 'failed' ? 'warning' : 'aurora'} />
                          <span className="w-9 text-right text-xs text-[var(--color-text-muted)]">{task.progress}%</span>
                        </div>
                        <div className="text-xs text-[var(--color-text-secondary)]">{task.retryCount}/{task.maxRetries}</div>
                        <div className="flex items-center justify-end gap-2">
                          {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                        </div>
                      </button>
                      {isExpanded && (
                        <div className="space-y-3 bg-[var(--bg-surface)] px-3 py-3">
                          {task.errorMessage && (
                            <div className="rounded-[var(--radius-md)] bg-[var(--color-danger-muted)] p-3 text-xs text-[var(--color-danger)]">
                              {task.errorMessage}
                            </div>
                          )}
                          <div className="grid gap-3 text-xs md:grid-cols-4">
                            <Info label="开始" value={formatDateTime(task.startedAt)} />
                            <Info label="结束" value={formatDateTime(task.finishedAt)} />
                            <Info label="任务 ID" value={task.id.slice(0, 8)} />
                            <Info label="类型" value={task.taskType} />
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {task.status === 'failed' && task.retryCount < task.maxRetries && (
                              <Button size="sm" onClick={() => handleRetry(task.id)} disabled={!!actionLoading} icon={actionLoading === task.id ? <Loader2 size={14} className="animate-spin" /> : <RotateCcw size={14} />}>重试</Button>
                            )}
                            {taskIsActive && (
                              <Button size="sm" variant="outline" onClick={() => handleCancel(task.id)} disabled={!!actionLoading} icon={<XCircle size={14} />}>取消</Button>
                            )}
                            {taskIsTerminal && (
                              <Button size="sm" variant="destructive" onClick={() => handleDelete(task.id)} disabled={!!actionLoading} icon={actionLoading === task.id ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}>删除</Button>
                            )}
                          </div>
                          <div className="max-h-44 overflow-y-auto rounded-[var(--radius-md)] bg-[var(--bg-panel)] p-2">
                            {logs.length === 0 ? (
                              <div className="text-xs text-[var(--color-text-muted)]">暂无日志</div>
                            ) : logs.map((log) => (
                              <div key={log.id} className="grid grid-cols-[76px_48px_minmax(0,1fr)] gap-2 py-1 text-xs">
                                <span className="text-[var(--color-text-muted)]">{new Date(log.createdAt).toLocaleTimeString('zh-CN')}</span>
                                <span className={log.level === 'ERROR' ? 'text-[var(--color-danger)]' : log.level === 'WARN' ? 'text-[var(--color-warning)]' : 'text-[var(--color-info)]'}>{log.level}</span>
                                <span className="truncate text-[var(--color-text-secondary)]">{log.message}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </Panel>

        <div className="space-y-5">
          <Panel title="Worker 健康状态" action={<StatusPill status={health?.status || 'unknown'} label={health?.status || 'unknown'} />}>
            <div className="space-y-3">
              {health?.checks ? Object.entries(health.checks).map(([name, check]) => (
                <div key={name} className="flex items-center justify-between rounded-[var(--radius-md)] bg-[var(--bg-panel)] px-3 py-2 text-sm">
                  <span className="text-[var(--color-text-secondary)]">{name}</span>
                  <span className="flex items-center gap-2">
                    <StatusPill status={check.status === 'ok' ? 'success' : check.status} label={check.status === 'ok' ? '正常' : check.status} />
                    {check.latency != null && <span className="font-mono text-xs text-[var(--color-text-muted)]">{check.latency}ms</span>}
                  </span>
                </div>
              )) : (
                <div className="text-sm text-[var(--color-text-muted)]">未获取到 Worker 健康信息。</div>
              )}
              <div className="text-xs text-[var(--color-text-muted)]">
                Worker 数：{health?.workers?.length ?? 0} · SSE：{streamConnected ? '已连接' : '未连接'}
              </div>
            </div>
          </Panel>

          <Panel title="失败详情">
            {activeTask ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-[var(--color-text-primary)]">{TASK_LABELS[activeTask.taskType] || activeTask.taskType}</div>
                    <div className="mt-1 text-xs text-[var(--color-text-muted)]">{activeTask.id}</div>
                  </div>
                  <StatusPill status={activeTask.status} />
                </div>
                <div className="rounded-[var(--radius-md)] bg-[var(--bg-panel)] p-3 text-xs leading-5 text-[var(--color-text-secondary)]">
                  {activeTask.errorMessage || '当前选中任务没有错误信息。'}
                </div>
                <Info label="创建时间" value={formatDateTime(activeTask.createdAt)} />
                <Info label="重试次数" value={`${activeTask.retryCount}/${activeTask.maxRetries}`} />
              </div>
            ) : (
              <EmptyState title="无选中任务" description="点击左侧任务行查看详情。" />
            )}
          </Panel>
        </div>
      </div>
    </div>
  )
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[var(--color-text-muted)]">{label}</div>
      <div className="mt-1 truncate font-mono text-[var(--color-text-primary)]">{value}</div>
    </div>
  )
}
