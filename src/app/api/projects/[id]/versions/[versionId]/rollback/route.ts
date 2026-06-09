import { NextRequest, NextResponse } from 'next/server'
import { versionService } from '@/server/services/version.service'

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string; versionId: string }> }) {
  try {
    const result = await versionService.rollbackToVersion((await params).versionId)
    return NextResponse.json({ success: true, data: result })
  } catch (error) {
    return NextResponse.json({ success: false, error: (error as Error).message }, { status: 400 })
  }
}
