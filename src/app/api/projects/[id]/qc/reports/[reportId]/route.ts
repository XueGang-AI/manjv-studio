import { NextRequest, NextResponse } from 'next/server'
import { qcService } from '@/server/services/qc.service'

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string; reportId: string }> }) {
  try {
    const report = await qcService.getReport((await params).reportId)
    if (!report) return NextResponse.json({ success: false, error: '报告不存在' }, { status: 404 })
    return NextResponse.json({ success: true, data: report })
  } catch (error) {
    return NextResponse.json({ success: false, error: '获取报告失败' }, { status: 500 })
  }
}
