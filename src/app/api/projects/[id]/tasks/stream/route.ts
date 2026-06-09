import { NextRequest } from 'next/server'
import { taskService } from '@/server/queues/task-queue.service'

/**
 * GET /api/projects/:id/tasks/stream
 * SSE 实时任务状态推送
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: projectId } = await params

  const encoder = new TextEncoder()
  let closed = false

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: string) => {
        if (!closed) controller.enqueue(encoder.encode(`data: ${data}\n\n`))
      }

      // 每秒推送一次任务状态
      const interval = setInterval(async () => {
        try {
          const tasks = await taskService.getProjectTasks(projectId, 20)
          send(JSON.stringify({ success: true, data: tasks }))
        } catch {
          send(JSON.stringify({ success: false, error: '获取任务失败' }))
        }
      }, 1000)

      // 清理
      request.signal.addEventListener('abort', () => {
        closed = true
        clearInterval(interval)
        controller.close()
      })
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  })
}
