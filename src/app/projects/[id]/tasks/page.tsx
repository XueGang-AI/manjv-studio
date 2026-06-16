'use client'

import { useState, useEffect, useCallback } from 'react'
import { useParams } from 'next/navigation'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  RefreshCw, XCircle, RotateCcw, FileText, Loader2,
  ChevronDown, ChevronUp, Clock, Trash2, AlertTriangle, X,
} from 'lucide-react'
import { useTaskSSE, type TaskUpdateEvent } from '@/lib/hooks/use-task-sse'

const STATUS_CONFIG: Record<string, { variant: 'default'|'success'|'warning'|'danger'|'info'; label: string }> = {
  pending: { variant: 'default', label: '等待中' },
  running: { variant: 'info', label: '执行中' },
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
  GENERATE_SHOT_IMAGES: '分镜图生成',
  GENERATE_SHOT_VIDEOS: '视频片段生成',
  RENDER_FINAL_VIDEO: '成片合成',
  QUALITY_CHECK: '质量检查',
}

const TERMINAL_STATUSES = ['success', 'failed', 'cancelled']
const ACTIVE_STATUSES = ['pending', 'running', 'retrying']

interface TaskItem {
  id: string; taskType: string; status: string; progress: number
  retryCount: number; maxRetries: number; errorMessage: string | null
  startedAt: string | null; finishedAt: string | null; createdAt: string
}

interface LogItem {
  id: string; level: string; message: string; createdAt: string
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

  const fetchTasks = useCallback(async () => {
    try {
      const res = await fetch(`/api/projects/${projectId}/tasks`)
      const data = await res.json()
      if (data.success) setTasks(data.data || [])
    } catch {} finally { setLoading(false) }
  }, [projectId])

  useEffect(() => { fetchTasks() }, [fetchTasks])

  // SSE 实时连接 — 使用统一 Hook
  useTaskSSE(projectId, {
    onTaskUpdate: () => {
      // 增量事件触发刷新
      fetchTasks()
    },
    onSnapshot: (taskList) => {
      // 全量快照直接更新
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
    if (expandedTask === taskId) { setExpandedTask(null); return }
    setExpandedTask(taskId)
    fetchLogs(taskId)
  }

  const handleRetry = async (taskId: string) => {
    setActionLoading(taskId); setError(null)
    try {
      const res = await fetch(`/api/tasks/${taskId}/retry`, { method: 'POST' })
      const data = await res.json()
      if (data.success) await fetchTasks()
      else setError(data.error || '重试失败')
    } catch { setError('重试请求失败') }
    finally { setActionLoading(null) }
  }

  const handleCancel = async (taskId: string) => {
    setActionLoading(taskId); setError(null)
    try {
      const res = await fetch(`/api/tasks/${taskId}/cancel`, { method: 'POST' })
      const data = await res.json()
      if (data.success) await fetchTasks()
      else setError(data.error || '取消失败')
    } catch { setError('取消请求失败') }
    finally { setActionLoading(null) }
  }

  const handleDelete = async (taskId: string) => {
    if (!confirm('确定删除该任务及其日志？此操作不可恢复。')) return
    setActionLoading(taskId); setError(null)
    try {
      const res = await fetch(`/api/tasks/${taskId}`, { method: 'DELETE' })
      const data = await res.json()
      if (data.success) {
        if (expandedTask === taskId) setExpandedTask(null)
        await fetchTasks()
      } else {
        setError(data.error || '删除失败')
      }
    } catch { setError('删除请求失败') }
    finally { setActionLoading(null) }
  }

  const handleClearFinished = async () => {
    const finishedCount = tasks.filter(t => TERMINAL_STATUSES.includes(t.status)).length
    if (finishedCount === 0) return
    if (!confirm(`确定清除 ${finishedCount} 个已结束任务？此操作不可恢复。`)) return
    setActionLoading('clear'); setError(null)
    try {
      const res = await fetch(`/api/projects/${projectId}/tasks`, { method: 'DELETE' })
      const data = await res.json()
      if (data.success) {
        if (expandedTask && !ACTIVE_STATUSES.includes(tasks.find(t => t.id === expandedTask)?.status || '')) {
          setExpandedTask(null)
        }
        await fetchTasks()
      } else {
        setError(data.error || '批量清理失败')
      }
    } catch { setError('批量清理请求失败') }
    finally { setActionLoading(null) }
  }

  const isActive = (status: string) => ACTIVE_STATUSES.includes(status)
  const isTerminal = (status: string) => TERMINAL_STATUSES.includes(status)
  const finishedCount = tasks.filter(t => isTerminal(t.status)).length
  const activeCount = tasks.filter(t => isActive(t.status)).length

  if (loading) return <div className="flex justify-center py-16"><Loader2 size={32} className="animate-spin text-gray-300" /></div>

  return (
    <div className="max-w-4xl mx-auto">
      {/* 头部 */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">任务队列</h1>
          <p className="text-gray-500 mt-1 flex items-center gap-2">
            {tasks.length} 个任务
            {activeCount > 0 && <Badge variant="info" className="text-xs">{activeCount} 活跃</Badge>}
            {finishedCount > 0 && <Badge variant="default" className="text-xs">{finishedCount} 已结束</Badge>}
            <span className={`inline-flex items-center gap-1 text-xs ${streamConnected ? 'text-green-500' : 'text-gray-400'}`}>
              <span className={`w-2 h-2 rounded-full ${streamConnected ? 'bg-green-500 animate-pulse' : 'bg-gray-300'}`} />
              {streamConnected ? 'SSE 实时连接' : 'SSE 未连接'}
            </span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          {finishedCount > 0 && (
            <Button variant="outline" size="sm" onClick={handleClearFinished} disabled={actionLoading === 'clear'}>
              {actionLoading === 'clear' ? <Loader2 size={14} className="mr-1 animate-spin" /> : <Trash2 size={14} className="mr-1" />}
              清除已结束
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={fetchTasks}>
            <RefreshCw size={14} />
          </Button>
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

      {tasks.length === 0 ? (
        <Card className="border-dashed"><CardContent className="flex flex-col items-center py-16">
          <FileText size={48} className="text-gray-300 mb-4" />
          <p className="text-gray-400">暂无任务记录</p>
        </CardContent></Card>
      ) : (
        <div className="space-y-3">
          {tasks.map(task => {
            const cfg = STATUS_CONFIG[task.status] || { variant: 'default' as const, label: task.status }
            const isExpanded = expandedTask === task.id
            const taskIsActive = isActive(task.status)
            const taskIsTerminal = isTerminal(task.status)

            return (
              <Card key={task.id} className={`border-l-4 ${
                task.status === 'success' ? 'border-l-green-400' :
                task.status === 'failed' ? 'border-l-red-400' :
                taskIsActive ? 'border-l-blue-400' : 'border-l-gray-200'
              }`}>
                <div className="px-4 py-3 flex items-center gap-3 cursor-pointer hover:bg-gray-50" onClick={() => toggleExpand(task.id)}>
                  <Badge variant={cfg.variant}>{cfg.label}</Badge>
                  <div className="flex-1 min-w-0">
                    <span className="font-medium text-sm">{TASK_LABELS[task.taskType] || task.taskType}</span>
                    {task.errorMessage && (
                      <p className="text-xs text-red-500 truncate mt-0.5">{task.errorMessage.substring(0, 80)}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 text-xs text-gray-400">
                    {taskIsActive && (
                      <div className="w-20 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                        <div className="h-full bg-blue-500 rounded-full transition-all" style={{ width: `${task.progress}%` }} />
                      </div>
                    )}
                    <span>{task.retryCount}/{task.maxRetries}</span>
                    <Clock size={12} />
                    <span>{new Date(task.createdAt).toLocaleTimeString('zh-CN')}</span>
                    {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                  </div>
                </div>

                {isExpanded && (
                  <div className="px-4 pb-3 border-t pt-3 space-y-2">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                      <div><span className="text-gray-400">状态</span><p><Badge variant={cfg.variant}>{cfg.label}</Badge></p></div>
                      <div><span className="text-gray-400">进度</span><p className="font-mono">{task.progress}%</p></div>
                      <div><span className="text-gray-400">开始</span><p>{task.startedAt ? new Date(task.startedAt).toLocaleTimeString('zh-CN') : '-'}</p></div>
                      <div><span className="text-gray-400">结束</span><p>{task.finishedAt ? new Date(task.finishedAt).toLocaleTimeString('zh-CN') : '-'}</p></div>
                    </div>

                    {/* 操作按钮 */}
                    <div className="flex gap-2 pt-1">
                      {task.status === 'failed' && task.retryCount < task.maxRetries && (
                        <Button size="sm" onClick={() => handleRetry(task.id)} disabled={!!actionLoading}>
                          {actionLoading === task.id ? <Loader2 size={14} className="mr-1 animate-spin" /> : <RotateCcw size={14} className="mr-1" />}
                          重试
                        </Button>
                      )}
                      {taskIsActive && (
                        <Button size="sm" variant="outline" onClick={() => handleCancel(task.id)} disabled={!!actionLoading}>
                          <XCircle size={14} className="mr-1" /> 取消
                        </Button>
                      )}
                      {taskIsTerminal && (
                        <Button size="sm" variant="outline" onClick={() => handleDelete(task.id)} disabled={!!actionLoading}
                          className="text-red-600 hover:text-red-700 hover:bg-red-50">
                          {actionLoading === task.id ? <Loader2 size={14} className="mr-1 animate-spin" /> : <Trash2 size={14} className="mr-1" />}
                          删除
                        </Button>
                      )}
                    </div>

                    {/* 日志 */}
                    <div>
                      <span className="text-xs font-medium text-gray-500">日志 ({logs.length})</span>
                      <div className="mt-1 max-h-40 overflow-y-auto space-y-0.5 bg-gray-50 rounded p-2">
                        {logs.length === 0 ? (
                          <p className="text-xs text-gray-400">暂无日志</p>
                        ) : logs.map(l => (
                          <div key={l.id} className="text-xs flex gap-2">
                            <span className="text-gray-400 shrink-0 w-16">{new Date(l.createdAt).toLocaleTimeString('zh-CN')}</span>
                            <span className={`shrink-0 w-10 ${l.level === 'ERROR' ? 'text-red-500' : l.level === 'WARN' ? 'text-yellow-500' : 'text-gray-500'}`}>
                              [{l.level}]
                            </span>
                            <span className="text-gray-600 truncate">{l.message}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
