import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { validateProjectForm, formatValidationErrors } from '@/lib/validators'

/**
 * GET /api/projects/:id
 * 获取项目详情
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const project = await prisma.project.findUnique({
      where: { id },
      include: {
        storyPackages: { orderBy: { version: 'desc' }, take: 1 },
        characters: true,
        episodes: { orderBy: { episodeNo: 'asc' } },
      },
    })

    if (!project) {
      return NextResponse.json(
        { success: false, error: '项目不存在' },
        { status: 404 }
      )
    }

    return NextResponse.json({ success: true, data: project })
  } catch (error) {
    console.error('Failed to fetch project:', error)
    return NextResponse.json(
      { success: false, error: '获取项目详情失败' },
      { status: 500 }
    )
  }
}

/**
 * PATCH /api/projects/:id
 * 更新项目
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    // 先确认项目存在
    const existing = await prisma.project.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json(
        { success: false, error: '项目不存在' },
        { status: 404 }
      )
    }

    const body = await request.json()

    // 校验（更新时可以部分校验，这里走完整校验，但需要合并已有数据）
    const merged = {
      project_name: body.project_name ?? existing.projectName,
      story_type: body.story_type ?? existing.storyType,
      background: body.background ?? existing.background,
      main_characters: body.main_characters ?? existing.mainCharacters,
      core_conflict: body.core_conflict ?? existing.coreConflict,
      story_summary: body.story_summary ?? existing.storySummary,
      full_story: body.full_story ?? existing.fullStory,
      art_style: body.art_style ?? existing.artStyle,
      target_platform: body.target_platform ?? existing.targetPlatform,
      episode_count: body.episode_count ?? existing.episodeCount,
      episode_duration: body.episode_duration ?? existing.episodeDuration,
      aspect_ratio: body.aspect_ratio ?? existing.aspectRatio,
    }

    const validation = validateProjectForm(merged)
    if (!validation.valid) {
      return NextResponse.json(
        { success: false, error: formatValidationErrors(validation.errors), errors: validation.errors },
        { status: 400 }
      )
    }

    // 构建更新数据，只更新传入的字段
    const updateData: Record<string, unknown> = {}
    const fieldMap: Record<string, string> = {
      project_name: 'projectName',
      story_type: 'storyType',
      background: 'background',
      main_characters: 'mainCharacters',
      core_conflict: 'coreConflict',
      story_summary: 'storySummary',
      full_story: 'fullStory',
      art_style: 'artStyle',
      target_platform: 'targetPlatform',
      episode_count: 'episodeCount',
      episode_duration: 'episodeDuration',
      aspect_ratio: 'aspectRatio',
    }

    for (const [snakeKey, camelKey] of Object.entries(fieldMap)) {
      if (snakeKey in body) {
        updateData[camelKey] = body[snakeKey]
      }
    }
    if ('status' in body) {
      updateData.status = body.status
    }

    // Trim string fields
    for (const [key, val] of Object.entries(updateData)) {
      if (typeof val === 'string') {
        updateData[key] = val.trim()
      }
    }

    const project = await prisma.project.update({
      where: { id },
      data: updateData,
    })

    return NextResponse.json({ success: true, data: project })
  } catch (error) {
    console.error('Failed to update project:', error)
    return NextResponse.json(
      { success: false, error: '更新项目失败' },
      { status: 500 }
    )
  }
}

/**
 * DELETE /api/projects/:id
 * 删除项目（级联删除关联数据）
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    // 确认项目存在
    const existing = await prisma.project.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json(
        { success: false, error: '项目不存在' },
        { status: 404 }
      )
    }

    // 按从属顺序级联删除关联数据
    // 先删除子表数据
    await prisma.generationTask.deleteMany({ where: { projectId: id } })
    await prisma.shotVideo.deleteMany({ where: { projectId: id } })
    await prisma.videoPrompt.deleteMany({ where: { projectId: id } })
    await prisma.shotImage.deleteMany({ where: { projectId: id } })
    await prisma.imagePrompt.deleteMany({ where: { projectId: id } })
    await prisma.shot.deleteMany({ where: { projectId: id } })
    await prisma.voiceScript.deleteMany({ where: { projectId: id } })
    await prisma.finalVideo.deleteMany({ where: { projectId: id } })
    await prisma.episode.deleteMany({ where: { projectId: id } })
    await prisma.characterImage.deleteMany({ where: { projectId: id } })
    await prisma.character.deleteMany({ where: { projectId: id } })
    await prisma.storyPackage.deleteMany({ where: { projectId: id } })
    await prisma.taskLog.deleteMany({ where: { task: { projectId: id } } })
    await prisma.projectVersion.deleteMany({ where: { projectId: id } })
    await prisma.qCReport.deleteMany({ where: { projectId: id } })
    await prisma.assetFile.deleteMany({ where: { projectId: id } })

    // 最后删除项目本身
    await prisma.project.delete({ where: { id } })

    return NextResponse.json({ success: true, message: '项目已删除' })
  } catch (error) {
    console.error('Failed to delete project:', error)
    return NextResponse.json(
      { success: false, error: '删除项目失败' },
      { status: 500 }
    )
  }
}
