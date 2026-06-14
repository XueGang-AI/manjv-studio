import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { validateProjectForm, formatValidationErrors } from '@/lib/validators'

/**
 * GET /api/projects
 * 获取项目列表
 */
export async function GET() {
  try {
    const projects = await prisma.project.findMany({
      orderBy: { updatedAt: 'desc' },
      select: {
        id: true,
        projectName: true,
        storyType: true,
        targetPlatform: true,
        episodeCount: true,
        episodeDuration: true,
        artStyle: true,
        status: true,
        modelProvider: true,
        createdAt: true,
        updatedAt: true,
      },
    })
    return NextResponse.json({ success: true, data: projects })
  } catch (error) {
    console.error('Failed to fetch projects:', error)
    return NextResponse.json(
      { success: false, error: '获取项目列表失败' },
      { status: 500 }
    )
  }
}

/**
 * POST /api/projects
 * 创建新项目
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    // 后端校验
    const validation = validateProjectForm(body)
    if (!validation.valid) {
      return NextResponse.json(
        { success: false, error: formatValidationErrors(validation.errors), errors: validation.errors },
        { status: 400 }
      )
    }

    const defaultUserId = '00000000-0000-0000-0000-000000000001'

    const project = await prisma.project.create({
      data: {
        userId: defaultUserId,
        projectName: body.project_name.trim(),
        storyType: body.story_type,
        background: body.background?.trim() || null,
        mainCharacters: Array.isArray(body.main_characters)
          ? body.main_characters.filter(Boolean)
          : [],
        coreConflict: body.core_conflict?.trim() || null,
        storySummary: body.story_summary?.trim() || null,
        fullStory: body.full_story?.trim() || null,
        artStyle: body.art_style,
        targetPlatform: body.target_platform,
        episodeCount: Number(body.episode_count) || 10,
        episodeDuration: Number(body.episode_duration) || 90,
        aspectRatio: body.aspect_ratio || '9:16',
        modelProvider: body.model_provider || 'agnes',
        status: 'DRAFT',
      },
    })

    return NextResponse.json({ success: true, data: project }, { status: 201 })
  } catch (error) {
    console.error('Failed to create project:', error)
    return NextResponse.json(
      { success: false, error: '创建项目失败，请重试' },
      { status: 500 }
    )
  }
}
