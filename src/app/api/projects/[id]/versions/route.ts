import { NextRequest, NextResponse } from 'next/server'
import { versionService } from '@/server/services/version.service'

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: projectId } = await params
    const { searchParams } = new URL(request.url)
    const entityType = searchParams.get('entity_type') || undefined
    const versions = await versionService.getVersions(projectId, entityType)
    return NextResponse.json({ success: true, data: versions })
  } catch {
    return NextResponse.json({ success: false, error: '获取版本失败' }, { status: 500 })
  }
}
