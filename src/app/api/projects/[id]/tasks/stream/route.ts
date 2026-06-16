import { NextRequest } from 'next/server'
import { taskService } from '@/server/queues/task-queue.service'
import {
  subscribeToProjectEvents,
  isRedisAvailable,
  type TaskEventType,
  type TaskUpdateEvent,
} from '@/server/workers/task-events'

/**
 * GET /api/projects/:id/tasks/stream
 * SSE 实时任务状态推送 — Redis Pub/Sub + DB fallback
 *
 * 事件层级：
 * 1. Redis Pub/Sub（跨进程，Worker → Next.js SSE）source=redis
 * 2. 进程内 EventEmitter（同进程直推）source=local
 * 3. DB 增量轮询 fallback（3 秒，仅查 updatedAt > lastSeenAt）source=db-fallback
 *
 * SSE 协议：
 * - event: 类型（snapshot / task.* / heartbeat / update / error）
 * - id: 事件 ID（用于 Last-Event-ID 重连）
 * - data: JSON（含 source 字段标记事件来源）
 *
 * 安全约束：
 * - 事件不含完整 input/output/FFmpeg stderr/密钥/路径
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: projectId } = await params

  const encoder = new TextEncoder()
  let closed = false
  let lastSentEventId = ''
  const sentEventIds: string[] = []

  const stream = new ReadableStream({
    async start(controller) {
      const send = (eventName: string, data: string, eventId?: string) => {
        if (closed) return
        try {
          let message = `event: ${eventName}\n`
          if (eventId) {
            message += `id: ${eventId}\n`
            lastSentEventId = eventId
            sentEventIds.push(eventId)
            if (sentEventIds.length > 100) sentEventIds.shift()
          }
          message += `data: ${data}\n\n`
          controller.enqueue(encoder.encode(message))
        } catch {
          closed = true
        }
      }

      const sendTaskEvent = (type: TaskEventType, payload: TaskUpdateEvent, source: string) => {
        // 去重：跳过已发送的事件
        if (payload.eventId && sentEventIds.includes(payload.eventId)) return
        // 在 data 中包含 source 标记
        send(type, JSON.stringify({ ...payload, source }), payload.eventId)
      }

      // ─── 1. Last-Event-ID 恢复 ──────────────────────────────────
      const lastEventId = request.headers.get('Last-Event-ID')
      if (lastEventId) {
        try {
          const tsMatch = lastEventId.match(/^evt_(\d+)_/)
          if (tsMatch) {
            const since = new Date(Number(tsMatch[1]))
            const recentTasks = await taskService.getProjectTasks(projectId, 20)
            const changed = recentTasks.filter(t => new Date(t.updatedAt) > since)
            if (changed.length > 0) {
              send('snapshot', JSON.stringify({ success: true, data: changed, incremental: true }))
            }
          }
        } catch {
          // Last-Event-ID 解析失败，推送全量快照
        }
      }

      // ─── 2. 初始全量快照 ─────────────────────────────────────────
      if (!lastEventId) {
        try {
          const tasks = await taskService.getProjectTasks(projectId, 20)
          send('snapshot', JSON.stringify({ success: true, data: tasks }))
        } catch {
          send('error', JSON.stringify({ success: false, error: '获取任务快照失败' }))
        }
      }

      // ─── 3. 订阅 Redis + 进程内事件 ──────────────────────────────
      const subscription = await subscribeToProjectEvents(projectId, (event) => {
        sendTaskEvent(event.type, event.payload, event.source)
      })

      // ─── 4. 心跳保活（30 秒） ────────────────────────────────────
      const heartbeat = setInterval(() => {
        if (closed) return
        send('heartbeat', JSON.stringify({ ts: Date.now(), lastEventId: lastSentEventId }))
      }, 30_000)

      // ─── 5. DB 增量轮询 fallback（3 秒） ────────────────────────
      let lastSeenUpdatedAt = new Date()

      const fallbackPoll = setInterval(async () => {
        if (closed) return
        try {
          const changed = await prismaQueryRecent(projectId, lastSeenUpdatedAt)
          if (changed.length > 0) {
            // DB fallback 事件标记 source=db-fallback
            send('update', JSON.stringify({ success: true, data: changed, source: 'db-fallback' }))
            for (const t of changed) {
              const d = new Date(t.updatedAt)
              if (d > lastSeenUpdatedAt) lastSeenUpdatedAt = d
            }
          }
        } catch {
          // 轮询失败不中断连接
        }
      }, 3_000)

      // ─── 6. 清理 ───────────────────────────────────────────────
      request.signal.addEventListener('abort', () => {
        closed = true
        subscription.unsubscribe()
        clearInterval(heartbeat)
        clearInterval(fallbackPoll)
        try {
          controller.close()
        } catch {
          // Already closed
        }
      })
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  })
}

/** 增量查询：只返回 updatedAt > since 的任务 */
async function prismaQueryRecent(projectId: string, since: Date) {
  const prisma = (await import('@/lib/prisma')).default
  return prisma.generationTask.findMany({
    where: {
      projectId,
      updatedAt: { gt: since },
    },
    orderBy: { updatedAt: 'desc' },
    take: 20,
  })
}
