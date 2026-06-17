import { NextRequest, NextResponse } from 'next/server'
import { qcService } from '@/server/services/qc.service'

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const reports = await qcService.getReports((await params).id)
    return NextResponse.json({ success: true, data: reports })
  } catch {
    return NextResponse.json({ success: false, error: '获取报告失败' }, { status: 500 })
  }
}
