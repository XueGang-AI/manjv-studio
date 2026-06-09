// ============================================
// 统一生成 Worker — 按 taskType 分发
// ============================================
import { taskService } from './task-queue.service'
import { adapterFactory } from '@/server/model-adapters/adapter.factory'
import { ffmpegService } from '@/server/services/ffmpeg.service'
import prisma from '@/lib/prisma'
import type { TextGenerationRequest, ImageGenerationRequest, VideoGenerationRequest } from '@/server/model-adapters/types'

/**
 * 执行单个任务的主要入口
 */
export async function executeTask(taskId: string): Promise<void> {
  const task = await taskService.getTask(taskId)
  if (!task) throw new Error(`Task ${taskId} not found`)

  await taskService.startTask(taskId)
  await taskService.appendLog(taskId, 'INFO', `开始执行 ${task.taskType}`)

  try {
    switch (task.taskType) {
      case 'GENERATE_STORY_PACKAGE': await executeStoryGen(task); break
      case 'GENERATE_CHARACTERS': await executeCharacterGen(task); break
      case 'GENERATE_CHARACTER_IMAGES': await executeCharImageGen(task); break
      case 'GENERATE_STORYBOARD': await executeStoryboardGen(task); break
      case 'GENERATE_SHOT_IMAGES': await executeShotImageGen(task); break
      case 'GENERATE_SHOT_VIDEOS': await executeShotVideoGen(task); break
      case 'RENDER_FINAL_VIDEO': await executeRender(task); break
      case 'QUALITY_CHECK': await executeQC(task); break
      default:
        throw new Error(`Unknown task type: ${task.taskType}`)
    }
    await taskService.completeTask(taskId)
    await taskService.appendLog(taskId, 'INFO', '任务执行成功')
  } catch (error) {
    const msg = (error as Error).message
    await taskService.failTask(taskId, msg)
    await taskService.appendLog(taskId, 'ERROR', msg)
  }
}

async function executeStoryGen(task: { projectId: string; input: Record<string,unknown> | null }) {
  await taskService.updateProgress(task.projectId, 10)
  const textAdapter = adapterFactory.getTextAdapter()
  const genReq: TextGenerationRequest = { taskType: 'story_analysis', systemPrompt: '', userPrompt: '', temperature: 0.7, maxTokens: 4096 }
  await textAdapter.generate(genReq)
  await taskService.updateProgress(task.projectId, 100)
}

async function executeCharacterGen(task: { projectId: string; input: Record<string,unknown> | null }) {
  await taskService.updateProgress(task.projectId, 10)
  const textAdapter = adapterFactory.getTextAdapter()
  const genReq: TextGenerationRequest = { taskType: 'character_design', systemPrompt: '', userPrompt: '', temperature: 0.7, maxTokens: 4096 }
  await textAdapter.generate(genReq)
  await taskService.updateProgress(task.projectId, 100)
}

async function executeCharImageGen(task: { projectId: string; episodeId?: string | null; input: Record<string,unknown> | null }) {
  await taskService.updateProgress(task.projectId, 10)
  const imgAdapter = adapterFactory.getImageAdapter()
  const genReq: ImageGenerationRequest = { taskType: 'character_image', prompt: 'test', numOutputs: 1 }
  await imgAdapter.generate(genReq)
  await taskService.updateProgress(task.projectId, 100)
}

async function executeStoryboardGen(task: { projectId: string; input: Record<string,unknown> | null }) {
  await taskService.updateProgress(task.projectId, 10)
  const textAdapter = adapterFactory.getTextAdapter()
  const genReq: TextGenerationRequest = { taskType: 'storyboard', systemPrompt: '', userPrompt: '', temperature: 0.7, maxTokens: 8192 }
  await textAdapter.generate(genReq)
  await taskService.updateProgress(task.projectId, 100)
}

async function executeShotImageGen(task: { projectId: string; episodeId?: string | null; input: Record<string,unknown> | null }) {
  await taskService.updateProgress(task.projectId, 10)
  const imgAdapter = adapterFactory.getImageAdapter()
  const genReq: ImageGenerationRequest = { taskType: 'shot_image', prompt: 'test', numOutputs: 1 }
  await imgAdapter.generate(genReq)
  await taskService.updateProgress(task.projectId, 100)
}

async function executeShotVideoGen(task: { projectId: string; episodeId?: string | null; input: Record<string,unknown> | null }) {
  await taskService.updateProgress(task.projectId, 10)
  const videoAdapter = adapterFactory.getVideoAdapter()
  const genReq: VideoGenerationRequest = { taskType: 'image_to_video', prompt: 'test', duration: 5 }
  await videoAdapter.generate(genReq)
  await taskService.updateProgress(task.projectId, 100)
}

async function executeRender(task: { projectId: string; episodeId?: string | null; input: Record<string,unknown> | null }) {
  await taskService.updateProgress(task.projectId, 10)
  await taskService.updateProgress(task.projectId, 100)
}

async function executeQC(task: { projectId: string; input: Record<string,unknown> | null }) {
  await taskService.updateProgress(task.projectId, 50)
  await taskService.appendLog(task.projectId, 'INFO', 'QC placeholder')
  await taskService.updateProgress(task.projectId, 100)
}
