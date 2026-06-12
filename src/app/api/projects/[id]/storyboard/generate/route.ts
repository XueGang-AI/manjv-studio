import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { promptTemplateService } from '@/server/services/prompt-template.service'
import { adapterFactory } from '@/server/model-adapters/adapter.factory'
import { getMaxShotDuration, normalizeShotDurations } from '@/lib/utils'
import type { TextGenerationRequest } from '@/server/model-adapters/types'

/**
 * POST /api/projects/:id/storyboard/generate
 * 生成第 1 集分镜脚本
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: projectId } = await params

    const project = await prisma.project.findUnique({ where: { id: projectId } })
    if (!project) {
      return NextResponse.json({ success: false, error: '项目不存在' }, { status: 404 })
    }

    // 检查前置条件
    if (project.status !== 'CHARACTER_IMAGE_CONFIRMED' &&
        project.status !== 'STORYBOARD_PENDING_CONFIRM' &&
        project.status !== 'STORYBOARD_CONFIRMED') {
      return NextResponse.json({
        success: false,
        error: '请先完成故事方案、角色设定和标准角色图确认',
      }, { status: 400 })
    }

    // 获取已确认的故事方案
    const storyPackage = await prisma.storyPackage.findFirst({
      where: { projectId, confirmed: true },
      orderBy: { version: 'desc' },
    })
    if (!storyPackage) {
      return NextResponse.json({ success: false, error: '请先确认故事方案' }, { status: 400 })
    }

    // 获取已确认角色
    const characters = await prisma.character.findMany({
      where: { projectId, confirmed: true },
    })

    // 获取标准角色图
    const characterImages = await prisma.characterImage.findMany({
      where: { projectId, isConfirmed: true },
    })

    // 更新状态
    await prisma.project.update({
      where: { id: projectId }, data: { status: 'STORYBOARD_GENERATING' },
    })

    const task = await prisma.generationTask.create({
      data: {
        projectId, taskType: 'GENERATE_STORYBOARD',
        modelName: project.modelProvider === 'ark' ? (process.env.ARK_TEXT_MODEL || 'doubao-seed-character-251128') : (process.env.AGNES_TEXT_MODEL || 'agnes-2.0-flash'),
        status: 'running', input: { project_id: projectId },
      },
    })

    try {
      // 获取或创建第 1 集 episode（计算版本号）
      const existingEpisode = await prisma.episode.findFirst({
        where: { projectId, episodeNo: 1 },
        orderBy: { version: 'desc' },
      })
      const nextVersion = (existingEpisode?.version || 0) + 1

      // 读取素材库做轻量注入
      const materialRefs = loadMaterialRefs(project)

      // 计算视频模型单镜头时长上限，传给 prompt 约束 AI 生成合理时长的镜头
      const maxShotDuration = getMaxShotDuration(project.modelProvider)

      // 渲染 Prompt
      const rendered = await promptTemplateService.render('storyboard', {
        project_name: project.projectName,
        story_type: project.storyType || '',
        background: project.background || '',
        core_conflict: project.coreConflict || '用户暂未明确核心冲突，请根据故事背景和梗概自动提炼潜在矛盾、人物关系张力或情绪驱动力。',
        story_summary: project.storySummary || '',
        art_style: project.artStyle || '',
        target_platform: project.targetPlatform || '',
        episode_duration: String(project.episodeDuration),
        max_shot_duration: String(maxShotDuration),
        episode_number: '1',
        aspect_ratio: project.aspectRatio || '9:16',
        story_package_json: JSON.stringify(storyPackage.content),
        characters_json: JSON.stringify(characters.map(c => ({
          name: c.name, role_type: c.roleType, zh_fixed_prompt: c.zhFixedPrompt,
          en_fixed_prompt: c.enFixedPrompt, appearance: c.appearance, personality: c.personality,
          signature_features: c.signatureFeatures,
        }))),
        selected_character_images_json: JSON.stringify(characterImages.map(i => ({
          character_id: i.characterId, image_url: i.imageUrl, prompt: i.prompt, is_confirmed: true,
        }))),
        episode_outline: JSON.stringify((storyPackage.content as Record<string,unknown>)?.episode_outline || []),
        relationship_json: '{}',
      })

      // 在 System Prompt 末尾追加素材库参考
      const enhancedSystem = rendered.systemPrompt + materialRefs

      const textAdapter = adapterFactory.getTextAdapter(project.modelProvider)
      const genReq: TextGenerationRequest = {
        taskType: 'storyboard',
        systemPrompt: enhancedSystem,
        userPrompt: rendered.userPrompt,
        temperature: 0.7,
        maxTokens: 8192,
      }

      const response = await textAdapter.generate(genReq)
      const content = response.json as Record<string, unknown> | undefined
      if (!content || !content.shots || !Array.isArray(content.shots)) {
        throw new Error('模型输出缺少 shots 数组')
      }

      const episodeData = (content.episode || {}) as Record<string, unknown>
      let shots = content.shots as Array<Record<string, unknown>>

      // 后处理：拆分超长镜头 + 校正总时长 = episodeDuration + 重建连续时间轴
      shots = normalizeShotDurations(shots, project.episodeDuration, maxShotDuration)

      // 保存 Episode
      const episode = await prisma.episode.create({
        data: {
          projectId,
          episodeNo: 1,
          title: (episodeData.title as string) || '第 1 集',
          duration: (episodeData.duration as number) || project.episodeDuration,
          coreTask: (episodeData.core_task as string) || '',
          emotionCurve: (episodeData.emotion_curve as string) || '',
          openingHook: (episodeData.opening_hook as string) || '',
          endingHook: (episodeData.ending_hook as string) || '',
          version: nextVersion,
          confirmed: false,
          status: 'DRAFT',
        },
      })

      // 保存 Shots + ImagePrompts + VideoPrompts
      const createdShots = []
      for (const shot of shots) {
        const shotRecord = await prisma.shot.create({
          data: {
            episodeId: episode.id,
            projectId,
            shotNo: (shot.shot_no as number) || 1,
            shotName: (shot.shot_name as string) || '',
            startTime: (shot.start_time as number) || 0,
            endTime: (shot.end_time as number) || 10,
            sceneTime: (shot.scene_time as string) || '',
            location: (shot.location as string) || '',
            characters: (shot.characters as unknown[]) || [],
            action: (shot.action as string) || '',
            camera: (shot.camera as Record<string,unknown>) || {},
            visual: (shot.visual as Record<string,unknown>) || {},
            emotion: (shot.emotion as string) || '',
            sfx: (shot.sfx as string) || '',
            bgm: (shot.bgm as string) || '',
            dialogue: (shot.dialogue as string) || '',
            purpose: (shot.purpose as string) || '',
          },
        })

        // ImagePrompt
        const imgP = (shot.image_prompt as Record<string,string>) || {}
        if (imgP.zh || imgP.en) {
          await prisma.imagePrompt.create({
            data: {
              shotId: shotRecord.id, projectId,
              zhPrompt: imgP.zh || '',
              enPrompt: imgP.en || '',
              negativePrompt: imgP.negative || '',
              aspectRatio: project.aspectRatio,
              style: project.artStyle,
              params: {},
              confirmed: false,
            },
          })
        }

        // VideoPrompt
        const vidP = (shot.video_prompt as string) || ''
        if (vidP) {
          await prisma.videoPrompt.create({
            data: {
              shotId: shotRecord.id, projectId,
              prompt: vidP,
              duration: (shot.duration as number) || (shot.end_time as number || 10) - (shot.start_time as number || 0),
              motionStrength: 'medium',
              cameraMotion: ((shot.camera as Record<string,string>)?.movement) || '',
              params: { fps: 24 },
              confirmed: false,
            },
          })
        }

        createdShots.push(shotRecord)
      }

      // 保存配音时间轴
      if (content.voice_timeline && Array.isArray(content.voice_timeline)) {
        await prisma.voiceScript.create({
          data: {
            episodeId: episode.id, projectId,
            content: { timeline: content.voice_timeline },
            confirmed: false,
          },
        })
      }

      // 更新状态
      await prisma.project.update({
        where: { id: projectId }, data: { status: 'STORYBOARD_PENDING_CONFIRM' },
      })
      const { versionService: vs } = await import('@/server/services/version.service')
      await vs.createVersion({
        projectId, entityType: 'STORYBOARD', entityId: episode.id,
        snapshot: { episode_id: episode.id, shot_count: createdShots.length, project_status: 'STORYBOARD_PENDING_CONFIRM' },
        changeType: 'GENERATE', description: `生成第 1 集分镜 (${createdShots.length} 镜头)`, sourceTaskId: task.id,
      })
      await prisma.generationTask.update({
        where: { id: task.id },
        data: { status: 'success', output: { episode_id: episode.id, shot_count: createdShots.length, version: nextVersion } },
      })

      return NextResponse.json({
        success: true,
        data: { episode, shots: createdShots, shotCount: createdShots.length, version: nextVersion },
      })
    } catch (genError) {
      const errorMsg = (genError as Error).message
      await prisma.project.update({ where: { id: projectId }, data: { status: 'CHARACTER_IMAGE_CONFIRMED' } })
      await prisma.generationTask.update({ where: { id: task.id }, data: { status: 'failed', errorMessage: errorMsg } })
      return NextResponse.json({ success: false, error: errorMsg }, { status: 500 })
    }
  } catch (error) {
    console.error('Failed to generate storyboard:', error)
    return NextResponse.json({ success: false, error: '生成分镜失败' }, { status: 500 })
  }
}

/** 从素材库加载相关参考并格式化为 prompt 片段 */
function loadMaterialRefs(project: { artStyle?: string | null; targetPlatform?: string | null }): string {
  const fs = require('fs')
  const path = require('path')
  const promptsDir = path.resolve(process.cwd(), 'prompts')

  let ref = '\n\n## 参考素材库（精选）\n'

  try {
    // 运镜术语参考
    const cameraTerms = JSON.parse(fs.readFileSync(path.join(promptsDir, 'camera/camera_terms.json'), 'utf-8'))
    const terms = (cameraTerms.entries || []).slice(0, 10)
    if (terms.length) ref += '\n可用镜头术语：' + terms.map((t: {term_zh?: string}) => t.term_zh || t.text || '').filter(Boolean).slice(0, 10).join('、')
  } catch {}

  try {
    // 风格修饰词
    const styles = JSON.parse(fs.readFileSync(path.join(promptsDir, 'style/cinematic_style_library.json'), 'utf-8'))
    const entries = (styles.entries || []).slice(0, 8)
    if (entries.length) ref += '\n可用风格修饰词示例：' + entries.map((e: {prompt?: string; modifier?: string}) => e.prompt || e.modifier || '').filter(Boolean).slice(0, 8).join('、')
  } catch {}

  try {
    // 经典运镜
    const classicMoves = JSON.parse(fs.readFileSync(path.join(promptsDir, 'camera/classic_camera_moves.json'), 'utf-8'))
    const moves = (classicMoves.entries || []).slice(0, 5)
    if (moves.length) ref += '\n经典运镜参考：' + moves.map((m: {text?: string}) => m.text || '').filter(Boolean).slice(0, 5).join(' | ')
  } catch {}

  ref += '\n\n请结合以上素材库知识，在分镜中灵活运用镜头语言。\n'
  return ref
}
