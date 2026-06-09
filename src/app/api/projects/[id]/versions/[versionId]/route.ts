import { NextRequest, NextResponse } from 'next/server'
import { versionService } from '@/server/services/version.service'

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string; versionId: string }> }) {
  try {
    const ver = await versionService.getVersion((await params).versionId)
    if (!ver) return NextResponse.json({ success: false, error: '版本不存在' }, { status: 404 })
    return NextResponse.json({ success: true, data: ver })
  } catch (error) {
    return NextResponse.json({ success: false, error: '获取失败' }, { status: 500 })
  }
}
