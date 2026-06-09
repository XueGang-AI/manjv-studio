import { NextRequest, NextResponse } from 'next/server'
import { taskService } from '@/server/queues/task-queue.service'

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const logs = await taskService.getTaskLogs((await params).id, 100)
    return NextResponse.json({ success: true, data: logs })
  } catch (error) {
    return NextResponse.json({ success: false, error: '获取日志失败' }, { status: 500 })
  }
}
