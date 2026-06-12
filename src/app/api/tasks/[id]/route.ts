import { NextRequest, NextResponse } from 'next/server'
import { taskService } from '@/server/queues/task-queue.service'

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const task = await taskService.getTask((await params).id)
    if (!task) return NextResponse.json({ success: false, error: '任务不存在' }, { status: 404 })
    return NextResponse.json({ success: true, data: task })
  } catch (error) {
    return NextResponse.json({ success: false, error: '获取失败' }, { status: 500 })
  }
}

/**
 * DELETE /api/tasks/:id
 * 硬删除单个已终态任务及其日志
 */
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const task = await taskService.deleteTask((await params).id)
    return NextResponse.json({ success: true, data: { id: task.id, deleted: true } })
  } catch (error) {
    const msg = (error as Error).message
    const status = msg.includes('请先取消') ? 400 : 404
    return NextResponse.json({ success: false, error: msg }, { status })
  }
}
