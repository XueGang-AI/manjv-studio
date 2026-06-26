// ============================================
// Story Package Worker Handler
// ============================================

import prisma from '@/lib/prisma'
import { adapterFactory } from '@/server/model-adapters/adapter.factory'
import { getRuntimeModelName } from '@/server/model-adapters/model-config'
import type { TextGenerationRequest } from '@/server/model-adapters/types'
import { taskService } from '@/server/queues/task-queue.service'
import { promptTemplateService } from '@/server/services/prompt-template.service'
import { emitTaskEvent, taskToUpdateEvent } from '../task-events'

type JsonValue = import('@prisma/client').Prisma.InputJsonValue

export async function handleStoryPackage(taskId: string): Promise<void> {
  const existingTask = await prisma.generationTask.findUnique({ where: { id: taskId } })
  if (!existingTask) throw new Error('任务不存在')
  if (existingTask.status === 'success') return
  if (existingTask.status !== 'pending' && existingTask.status !== 'running' && existingTask.status !== 'retrying') return

  const task = await taskService.startTask(taskId)

  try {
    const projectId = task.projectId
    const project = await prisma.project.findUnique({ where: { id: projectId } })
    if (!project) throw new Error('项目不存在')

    await emitTaskEvent('task.running', taskToUpdateEvent(task))
    await taskService.appendLog(taskId, 'INFO', '开始生成故事方案')
    await taskService.updateProgress(taskId, 10)

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

    const rendered = await promptTemplateService.render('story_analysis', variables)
    const textAdapter = adapterFactory.getTextAdapter(project.modelProvider)
    const genRequest: TextGenerationRequest = {
      taskType: 'story_analysis',
      systemPrompt: rendered.systemPrompt,
      userPrompt: rendered.userPrompt,
      outputSchema: rendered.outputSchema || undefined,
      temperature: 0.7,
      maxTokens: 4096,
    }

    const response = await textAdapter.generate(genRequest)
    let content: Record<string, unknown>
    if (response.json) {
      content = response.json as Record<string, unknown>
    } else {
      try {
        content = JSON.parse(response.rawText)
      } catch {
        await taskService.appendLog(taskId, 'WARN', '首次 JSON 解析失败，正在重试', {
          raw_preview: response.rawText.substring(0, 200),
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

    await taskService.updateProgress(taskId, 70)

    const latestPackage = await prisma.storyPackage.findFirst({
      where: { projectId },
      orderBy: { version: 'desc' },
    })
    const nextVersion = (latestPackage?.version || 0) + 1

    const { versionService: vs } = await import('@/server/services/version.service')
    await vs.createVersion({
      projectId,
      entityType: 'STORY_PACKAGE',
      entityId: projectId,
      snapshot: { project_status: 'STORY_PENDING_CONFIRM', generated_at: new Date().toISOString() },
      changeType: 'GENERATE',
      description: '生成故事方案',
      sourceTaskId: task.id,
    })

    const storyPackage = await prisma.storyPackage.create({
      data: {
        projectId,
        version: nextVersion,
        content: content as unknown as JsonValue,
        confirmed: false,
      },
    })

    await prisma.project.update({
      where: { id: projectId },
      data: { status: 'STORY_PENDING_CONFIRM' },
    })

    await taskService.appendLog(taskId, 'INFO', `故事方案生成成功 (v${nextVersion})`)
    const completed = await taskService.completeTask(taskId, {
      story_package_id: storyPackage.id,
      version: nextVersion,
      model_name: getRuntimeModelName('text'),
    })
    await emitTaskEvent('task.completed', taskToUpdateEvent(completed))
  } catch (error) {
    const errorMsg = (error as Error).message
    try {
      await prisma.project.update({ where: { id: task.projectId }, data: { status: 'DRAFT' } })
      await taskService.appendLog(taskId, 'ERROR', errorMsg)
    } catch {
      /* ignore */
    }
    const failed = await taskService.failTask(taskId, errorMsg)
    await emitTaskEvent('task.failed', taskToUpdateEvent(failed))
  }
}
