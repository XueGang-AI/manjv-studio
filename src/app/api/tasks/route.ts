import { NextResponse } from 'next/server'
import { taskService } from '@/server/queues/task-queue.service'

export async function GET() {
  try {
    const tasks = await taskService.getAllTasks(50)
    return NextResponse.json({ success: true, data: tasks })
  } catch {
    return NextResponse.json({ success: false, error: '获取任务失败' }, { status: 500 })
  }
}
