import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { promptTemplateService } from '@/server/services/prompt-template.service'
import { adapterFactory } from '@/server/model-adapters/adapter.factory'
import type { TextGenerationRequest } from '@/server/model-adapters/types'

/**
 * POST /api/projects/:id/characters/generate
 * 生成角色设定卡
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: projectId } = await params

    // 1. 获取项目信息
    const project = await prisma.project.findUnique({ where: { id: projectId } })
    if (!project) {
      return NextResponse.json({ success: false, error: '项目不存在' }, { status: 404 })
    }

    // 2. 检查状态 — 必须已确认故事方案
    if (project.status !== 'STORY_CONFIRMED' && project.status !== 'CHARACTER_PENDING_CONFIRM' && project.status !== 'CHARACTER_CONFIRMED') {
      return NextResponse.json({
        success: false,
        error: '请先确认故事方案后再生成角色设定',
      }, { status: 400 })
    }

    // 3. 获取最新故事方案
    const storyPackage = await prisma.storyPackage.findFirst({
      where: { projectId, confirmed: true },
      orderBy: { version: 'desc' },
    })
    if (!storyPackage) {
      return NextResponse.json({
        success: false,
        error: '请先确认故事方案后再生成角色设定',
      }, { status: 400 })
    }

    // 4. 更新状态
    await prisma.project.update({
      where: { id: projectId },
      data: { status: 'CHARACTER_GENERATING' },
    })

    const task = await prisma.generationTask.create({
      data: {
        projectId,
        taskType: 'GENERATE_CHARACTERS',
        modelName: process.env.AGNES_TEXT_MODEL || 'Agnes-2.0-Flash',
        status: 'running',
        input: { project_id: projectId },
      },
    })

    try {
      // 5. 渲染模板
      const storyContent = storyPackage.content as Record<string, unknown>
      const rendered = await promptTemplateService.render('character_design', {
        project_name: project.projectName,
        story_type: project.storyType || '',
        main_characters: JSON.stringify(project.mainCharacters || []),
        background: project.background || '',
        story_summary: project.storySummary || '',
        art_style: project.artStyle || '',
        target_platform: project.targetPlatform || '',
        story_package_json: JSON.stringify(storyContent),
      })

      // 6. 调用模型
      const textAdapter = adapterFactory.getTextAdapter(project.modelProvider)
      const genRequest: TextGenerationRequest = {
        taskType: 'character_design',
        systemPrompt: rendered.systemPrompt,
        userPrompt: rendered.userPrompt,
        temperature: 0.7,
        maxTokens: 4096,
      }

      const response = await textAdapter.generate(genRequest)
      const content = response.json as Record<string, unknown> | undefined
      if (!content || !content.characters || !Array.isArray(content.characters)) {
        throw new Error('模型输出缺少 characters 数组')
      }

      const characters = content.characters as Array<Record<string, unknown>>

      // 7. 计算版本号
      const latestChar = await prisma.character.findFirst({
        where: { projectId },
        orderBy: { version: 'desc' },
      })
      const nextVersion = (latestChar?.version || 0) + 1

      // 8. 批量创建角色 (version record created above)
      const created = await Promise.all(
        characters.map((char) =>
          prisma.character.create({
            data: {
              projectId,
              name: (char.name as string) || '',
              gender: (char.gender as string) || '',
              age: (char.age as number) || null,
              roleType: (char.role_type as string) || '',
              identity: (char.identity as string) || '',
              appearance: (char.appearance as Record<string, unknown>) || {},
              clothing: (char.clothing as Record<string, unknown>) || {},
              personality: (char.personality as Record<string, unknown>) || {},
              signatureFeatures: (char.signature_features as unknown[]) || [],
              languageStyle: (char.language_style as Record<string, unknown>) || {},
              actionHabits: (char.action_habits as unknown[]) || [],
              emotionalArc: (char.emotional_arc as string) || '',
              zhFixedPrompt: (char.zh_fixed_prompt as string) || '',
              enFixedPrompt: (char.en_fixed_prompt as string) || '',
              referenceStyle: typeof char.reference_style === 'object'
                ? JSON.stringify(char.reference_style)
                : (char.reference_style as string) || '',
              version: nextVersion,
              confirmed: false,
            },
          })
        )
      )

      // 9. 创建版本记录
      const { versionService: vs } = await import('@/server/services/version.service')
      await vs.createVersion({
        projectId, entityType: 'CHARACTER_SET', entityId: projectId,
        snapshot: { character_count: created.length, project_status: 'CHARACTER_PENDING_CONFIRM' },
        changeType: 'GENERATE', description: `生成 ${created.length} 个角色`, sourceTaskId: task.id,
      })

      // 10. 更新项目状态
      await prisma.project.update({
        where: { id: projectId },
        data: { status: 'CHARACTER_PENDING_CONFIRM' },
      })

      await prisma.generationTask.update({
        where: { id: task.id },
        data: { status: 'success', output: { count: created.length, version: nextVersion } },
      })

      return NextResponse.json({
        success: true,
        data: {
          characters: created,
          version: nextVersion,
          count: created.length,
        },
      })

    } catch (genError) {
      const errorMsg = (genError as Error).message
      await prisma.project.update({
        where: { id: projectId },
        data: { status: 'STORY_CONFIRMED' },
      })
      await prisma.generationTask.update({
        where: { id: task.id },
        data: { status: 'failed', errorMessage: errorMsg },
      })
      return NextResponse.json({ success: false, error: errorMsg }, { status: 500 })
    }
  } catch (error) {
    console.error('Failed to generate characters:', error)
    return NextResponse.json(
      { success: false, error: '生成角色设定失败' },
      { status: 500 }
    )
  }
}
