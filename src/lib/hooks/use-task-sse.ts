// ============================================
// useTaskSSE — 通用任务 SSE 订阅 Hook
// ============================================
//
// 替代所有页面的 setInterval polling。
// 连接项目级 SSE 端点，自动解析事件并调用回调。
//
// SSE 协议：
// - event: 类型（snapshot / task.created / task.updated / task.running /
//          task.progress / task.completed / task.failed / heartbeat）
// - id: 事件 ID（用于去重）
// - data: JSON
//
// 去重策略：维护最近 50 个 eventId，跳过已处理的事件

'use client'

import { useEffect, useRef } from 'react'

// ─── 类型 ──────────────────────────────────────────────────────────

export type TaskEventType =
  | 'task.created'
  | 'task.updated'
  | 'task.running'
  | 'task.progress'
  | 'task.completed'
  | 'task.failed'

export interface TaskUpdateEvent {
  eventId: string
  taskId: string
  projectId: string
  episodeId?: string | null
  taskType: string
  status: string
  progress: number
  errorMessage?: string | null
  updatedAt: string
}

interface TaskSSECallbacks {
  /** 收到增量任务更新事件 */
  onTaskUpdate?: (type: TaskEventType, payload: TaskUpdateEvent) => void
  /** 收到全量快照（连接时 + 降级轮询时） */
  onSnapshot?: (tasks: unknown[]) => void
  /** 连接状态变化 */
  onConnectionChange?: (connected: boolean) => void
}

// ─── Hook ──────────────────────────────────────────────────────────

export function useTaskSSE(
  projectId: string | undefined,
  callbacks: TaskSSECallbacks,
) {
  const esRef = useRef<EventSource | null>(null)
  const callbacksRef = useRef(callbacks)
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  /** 去重窗口：最近处理过的事件 ID */
  const seenEventIdsRef = useRef<Set<string>>(new Set())

  // 同步 callbacks ref
  useEffect(() => {
    callbacksRef.current = callbacks
  })

  useEffect(() => {
    if (!projectId) return

    // 重置去重窗口
    seenEventIdsRef.current.clear()

    function connect() {
      // 关闭旧连接
      if (esRef.current) {
        esRef.current.close()
      }
      // 清除待执行的重连定时器
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current)
        reconnectTimerRef.current = null
      }

      const es = new EventSource(`/api/projects/${projectId}/tasks/stream`)
      esRef.current = es

      es.onopen = () => {
        callbacksRef.current.onConnectionChange?.(true)
      }

      // 全量快照事件
      es.addEventListener('snapshot', (e) => {
        try {
          const parsed = JSON.parse(e.data)
          if (parsed.success && parsed.data) {
            callbacksRef.current.onSnapshot?.(parsed.data)
          }
        } catch { /* ignore parse errors */ }
      })

      // 全量更新事件（DB fallback 触发）
      es.addEventListener('update', (e) => {
        try {
          const parsed = JSON.parse(e.data)
          if (parsed.success && parsed.data) {
            callbacksRef.current.onSnapshot?.(parsed.data)
          }
        } catch { /* ignore parse errors */ }
      })

      // 增量任务事件（新协议：点号分隔）
      const taskEventTypes: TaskEventType[] = [
        'task.created',
        'task.updated',
        'task.running',
        'task.progress',
        'task.completed',
        'task.failed',
      ]

      for (const eventType of taskEventTypes) {
        es.addEventListener(eventType, (e) => {
          try {
            const payload: TaskUpdateEvent = JSON.parse(e.data)

            // 去重：跳过已处理的事件
            if (payload.eventId && seenEventIdsRef.current.has(payload.eventId)) {
              return
            }
            if (payload.eventId) {
              seenEventIdsRef.current.add(payload.eventId)
              // 维护窗口大小
              if (seenEventIdsRef.current.size > 50) {
                // 删除最早的条目
                const firstValue = seenEventIdsRef.current.values().next().value
                if (firstValue) seenEventIdsRef.current.delete(firstValue)
              }
            }

            callbacksRef.current.onTaskUpdate?.(eventType, payload)
          } catch { /* ignore parse errors */ }
        })
      }

      // 心跳事件（忽略，仅用于保活）
      es.addEventListener('heartbeat', () => {
        // no-op
      })

      es.onerror = () => {
        callbacksRef.current.onConnectionChange?.(false)
        es.close()
        esRef.current = null

        // 自动重连：3 秒后重试
        reconnectTimerRef.current = setTimeout(() => {
          reconnectTimerRef.current = null
          connect()
        }, 3000)
      }
    }

    connect()

    return () => {
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current)
        reconnectTimerRef.current = null
      }
      if (esRef.current) {
        esRef.current.close()
        esRef.current = null
      }
    }
  }, [projectId])
}
