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
