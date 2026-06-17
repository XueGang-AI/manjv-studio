import { NextRequest, NextResponse } from 'next/server'
import { qcService } from '@/server/services/qc.service'

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string; episodeId: string }> }) {
  try {
    const { id: projectId, episodeId } = await params
    const reports = await qcService.getReports(projectId, episodeId)
    return NextResponse.json({ success: true, data: reports })
  } catch {
    return NextResponse.json({ success: false, error: '获取报告失败' }, { status: 500 })
  }
}
