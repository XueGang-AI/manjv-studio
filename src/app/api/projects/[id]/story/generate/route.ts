import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { promptTemplateService } from '@/server/services/prompt-template.service'
import { adapterFactory } from '@/server/model-adapters/adapter.factory'
import type { TextGenerationRequest } from '@/server/model-adapters/types'

/**
 * POST /api/projects/:id/story/generate
 * 生成故事方案
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

    // 2. 检查项目状态
    if (project.status === 'STORY_GENERATING') {
      return NextResponse.json({ success: false, error: '故事方案正在生成中，请稍候' }, { status: 409 })
    }

    // 3. 更新项目状态为生成中
    await prisma.project.update({
      where: { id: projectId },
      data: { status: 'STORY_GENERATING' },
    })

    // 4. 创建生成任务记录
    const task = await prisma.generationTask.create({
      data: {
        projectId,
        taskType: 'GENERATE_STORY_PACKAGE',
        modelName: process.env.AGNES_TEXT_MODEL || 'Agnes-2.0-Flash',
        status: 'running',
        input: { project_id: projectId },
      },
    })

    // 5. 记录日志
    await prisma.taskLog.create({
      data: {
        taskId: task.id,
        level: 'INFO',
        message: '开始生成故事方案',
      },
    })

    try {
      // 6. 准备变量
      const variables: Record<string, string> = {
        project_name: project.projectName,
        story_type: project.storyType || '',
        background: project.background || '',
        main_characters: JSON.stringify(project.mainCharacters || []),
        core_conflict: project.coreConflict || '用户暂未明确核心冲突，请根据故事背景和梗概自动提炼潜在矛盾、人物关系张力或情绪驱动力。',
        story_summary: project.storySummary || '',
        full_story: project.fullStory || '',
        art_style: project.artStyle || '',
        target_platform: project.targetPlatform || '',
        episode_count: String(project.episodeCount),
        episode_duration: String(project.episodeDuration),
        aspect_ratio: project.aspectRatio || '9:16',
        audience: project.audience || '',
        ending_type: project.endingType || '',
      }

      // 7. 渲染 Prompt 模板
      const rendered = await promptTemplateService.render('story_analysis', variables)

      // 8. 调用模型适配器
      const textAdapter = adapterFactory.getTextAdapter()
      const genRequest: TextGenerationRequest = {
        taskType: 'story_analysis',
        systemPrompt: rendered.systemPrompt,
        userPrompt: rendered.userPrompt,
        outputSchema: rendered.outputSchema || undefined,
        temperature: 0.7,
        maxTokens: 4096,
      }

      const response = await textAdapter.generate(genRequest)

      // 9. 解析并校验 JSON
      let content: Record<string, unknown>
      if (response.json) {
        content = response.json as Record<string, unknown>
      } else {
        // 尝试从原始文本解析
        try {
          content = JSON.parse(response.rawText)
        } catch {
          // 重试一次
          await prisma.taskLog.create({
            data: {
              taskId: task.id,
              level: 'WARN',
              message: '首次 JSON 解析失败，正在重试',
              detail: { raw_preview: response.rawText.substring(0, 200) },
            },
          })

          const retryResponse = await textAdapter.generate({
            ...genRequest,
            systemPrompt: rendered.systemPrompt + '\n\nCRITICAL: Your previous response was not valid JSON. You MUST output ONLY a valid JSON object. No markdown, no explanations.',
          })

          if (retryResponse.json) {
            content = retryResponse.json as Record<string, unknown>
          } else {
            try {
              content = JSON.parse(retryResponse.rawText)
            } catch {
              throw new Error('模型输出无法解析为 JSON，请重试')
            }
          }
        }
      }

      // 10. 计算版本号
      const latestPackage = await prisma.storyPackage.findFirst({
        where: { projectId },
        orderBy: { version: 'desc' },
      })
      const nextVersion = (latestPackage?.version || 0) + 1

      // 11. 保存故事方案
      // 创建版本记录
      const { versionService: vs } = await import('@/server/services/version.service')
      await vs.createVersion({
        projectId, entityType: 'STORY_PACKAGE', entityId: projectId,
        snapshot: { project_status: 'STORY_PENDING_CONFIRM', generated_at: new Date().toISOString() },
        changeType: 'GENERATE', description: '生成故事方案', sourceTaskId: task.id,
      })

      const storyPackage = await prisma.storyPackage.create({
        data: {
          projectId,
          version: nextVersion,
          content: content as Record<string, unknown>,
          confirmed: false,
        },
      })

      // 12. 更新项目状态
      await prisma.project.update({
        where: { id: projectId },
        data: { status: 'STORY_PENDING_CONFIRM' },
      })

      // 13. 更新任务状态
      await prisma.generationTask.update({
        where: { id: task.id },
        data: {
          status: 'success',
          output: { story_package_id: storyPackage.id, version: nextVersion },
        },
      })

      await prisma.taskLog.create({
        data: {
          taskId: task.id,
          level: 'INFO',
          message: `故事方案生成成功 (v${nextVersion})`,
        },
      })

      return NextResponse.json({
        success: true,
        data: {
          storyPackage,
          task: { id: task.id, status: 'success' },
          usage: response.usage,
        },
      })

    } catch (genError) {
      // 生成失败
      const errorMsg = (genError as Error).message

      await prisma.project.update({
        where: { id: projectId },
        data: { status: 'DRAFT' }, // 回退到草稿
      })

      await prisma.generationTask.update({
        where: { id: task.id },
        data: {
          status: 'failed',
          errorMessage: errorMsg,
        },
      })

      await prisma.taskLog.create({
        data: {
          taskId: task.id,
          level: 'ERROR',
          message: errorMsg,
        },
      })

      return NextResponse.json(
        { success: false, error: errorMsg },
        { status: 500 }
      )
    }
  } catch (error) {
    console.error('Failed to generate story:', error)
    return NextResponse.json(
      { success: false, error: '生成故事方案失败' },
      { status: 500 }
    )
  }
}
