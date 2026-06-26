import { NextRequest, NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'
import prisma from '@/lib/prisma'

/**
 * POST /api/projects/:id/episodes/:episodeId/release-package/generate
 * 生成发布包 manifest，并写回 FinalVideo.assetPackageUrl。
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; episodeId: string }> }
) {
  try {
    const { id: projectId, episodeId } = await params

    const project = await prisma.project.findUnique({ where: { id: projectId } })
    if (!project) return NextResponse.json({ success: false, error: '项目不存在' }, { status: 404 })

    const episode = await prisma.episode.findFirst({ where: { id: episodeId, projectId } })
    if (!episode) return NextResponse.json({ success: false, error: '剧集不存在' }, { status: 404 })

    const finalVideo = await prisma.finalVideo.findFirst({
      where: { projectId, episodeId },
      orderBy: { createdAt: 'desc' },
    })
    if (!finalVideo) {
      return NextResponse.json({ success: false, error: '请先生成最终成片' }, { status: 400 })
    }

    const shots = await prisma.shot.findMany({
      where: { projectId, episodeId },
      orderBy: { shotNo: 'asc' },
      include: {
        shotImages: { where: { isConfirmed: true }, take: 1 },
        shotVideos: { where: { isConfirmed: true }, take: 1 },
      },
    })

    const outputDir = path.join(process.cwd(), 'uploads', 'release_packages')
    fs.mkdirSync(outputDir, { recursive: true })
    const fileName = `${projectId}_ep${episode.episodeNo || 1}_release_manifest.json`
    const packagePath = path.join(outputDir, fileName)

    const manifest = {
      generatedAt: new Date().toISOString(),
      project: {
        id: project.id,
        name: project.projectName,
        targetPlatform: project.targetPlatform,
        aspectRatio: project.aspectRatio,
        artStyle: project.artStyle,
      },
      episode: {
        id: episode.id,
        episodeNo: episode.episodeNo,
        title: episode.title,
        duration: episode.duration,
      },
      finalVideo: {
        id: finalVideo.id,
        videoUrl: finalVideo.videoUrl,
        duration: finalVideo.duration,
        aspectRatio: finalVideo.aspectRatio,
        fps: finalVideo.fps,
      },
      shots: shots.map(shot => ({
        id: shot.id,
        shotNo: shot.shotNo,
        shotName: shot.shotName,
        duration: (shot.endTime || 0) - (shot.startTime || 0),
        imageUrl: shot.shotImages[0]?.imageUrl || null,
        videoUrl: shot.shotVideos[0]?.videoUrl || null,
      })),
    }

    fs.writeFileSync(packagePath, JSON.stringify(manifest, null, 2), 'utf-8')

    const updated = await prisma.finalVideo.update({
      where: { id: finalVideo.id },
      data: { assetPackageUrl: packagePath },
    })

    return NextResponse.json({
      success: true,
      data: {
        finalVideoId: updated.id,
        packageUrl: packagePath,
        manifest,
      },
    })
  } catch (error) {
    console.error('Failed to generate release package:', error)
    return NextResponse.json({ success: false, error: '生成发布包失败' }, { status: 500 })
  }
}
