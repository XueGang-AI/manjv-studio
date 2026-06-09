import { NextRequest, NextResponse } from 'next/server'
import { versionService } from '@/server/services/version.service'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const from = searchParams.get('from')
    const to = searchParams.get('to')
    if (!from || !to) return NextResponse.json({ success: false, error: '缺少 from/to 参数' }, { status: 400 })
    const diff = await versionService.compareVersions(from, to)
    return NextResponse.json({ success: true, data: diff })
  } catch (error) {
    return NextResponse.json({ success: false, error: (error as Error).message }, { status: 400 })
  }
}
