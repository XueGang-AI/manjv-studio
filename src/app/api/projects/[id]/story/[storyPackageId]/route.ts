import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'

type JsonValue = import('@prisma/client').Prisma.InputJsonValue

/**
 * PATCH /api/projects/:id/story/:storyPackageId
 * 更新故事方案内容
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; storyPackageId: string }> }
) {
  try {
    const { id: projectId, storyPackageId } = await params
    const body = await request.json()

    // 校验 JSON 合法性
    let content: Record<string, unknown>
    if (body.content) {
      if (typeof body.content === 'string') {
        try {
          content = JSON.parse(body.content)
        } catch {
          return NextResponse.json(
            { success: false, error: '故事方案内容不是合法的 JSON' },
            { status: 400 }
          )
        }
      } else if (typeof body.content === 'object') {
        content = body.content
      } else {
        return NextResponse.json(
          { success: false, error: '无效的故事方案内容' },
          { status: 400 }
        )
      }
    } else {
      return NextResponse.json(
        { success: false, error: '缺少 content 字段' },
        { status: 400 }
      )
    }

    // 验证 storyPackage 存在且属于该项目
    const existing = await prisma.storyPackage.findFirst({
      where: { id: storyPackageId, projectId },
    })

    if (!existing) {
      return NextResponse.json(
        { success: false, error: '故事方案不存在' },
        { status: 404 }
      )
    }

    const updated = await prisma.storyPackage.update({
      where: { id: storyPackageId },
      data: { content: content as unknown as JsonValue },
    })

    return NextResponse.json({ success: true, data: updated })
  } catch (error) {
    console.error('Failed to update story package:', error)
    return NextResponse.json(
      { success: false, error: '更新故事方案失败' },
      { status: 500 }
    )
  }
}
