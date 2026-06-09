import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'

/**
 * PATCH /api/projects/:id/characters/:charId
 * 更新单个角色
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; charId: string }> }
) {
  try {
    const { id: projectId, charId } = await params
    const body = await request.json()

    const existing = await prisma.character.findFirst({
      where: { id: charId, projectId },
    })
    if (!existing) {
      return NextResponse.json({ success: false, error: '角色不存在' }, { status: 404 })
    }

    const updateData: Record<string, unknown> = {}
    const fieldMap: Record<string, string> = {
      name: 'name', gender: 'gender', age: 'age',
      role_type: 'roleType', identity: 'identity',
      appearance: 'appearance', clothing: 'clothing',
      personality: 'personality', signature_features: 'signatureFeatures',
      language_style: 'languageStyle', action_habits: 'actionHabits',
      emotional_arc: 'emotionalArc', zh_fixed_prompt: 'zhFixedPrompt',
      en_fixed_prompt: 'enFixedPrompt', reference_style: 'referenceStyle',
    }

    for (const [snakeKey, camelKey] of Object.entries(fieldMap)) {
      if (snakeKey in body) {
        updateData[camelKey] = body[snakeKey]
      }
    }

    const updated = await prisma.character.update({
      where: { id: charId },
      data: updateData,
    })

    return NextResponse.json({ success: true, data: updated })
  } catch (error) {
    console.error('Failed to update character:', error)
    return NextResponse.json(
      { success: false, error: '更新角色失败' },
      { status: 500 }
    )
  }
}
