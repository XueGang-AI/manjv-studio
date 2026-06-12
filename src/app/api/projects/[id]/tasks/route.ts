import { NextRequest, NextResponse } from 'next/server'
import { taskService } from '@/server/queues/task-queue.service'

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const tasks = await taskService.getProjectTasks((await params).id, 50)
    return NextResponse.json({ success: true, data: tasks })
  } catch (error) {
    return NextResponse.json({ success: false, error: '获取失败' }, { status: 500 })
  }
}

/**
 * DELETE /api/projects/:id/tasks
 * 批量删除该项目下所有已终态任务（success / failed / cancelled）
 */
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const result = await taskService.deleteFinishedTasks((await params).id)
    return NextResponse.json({ success: true, data: result })
  } catch (error) {
    return NextResponse.json({ success: false, error: '批量删除失败' }, { status: 500 })
  }
}
