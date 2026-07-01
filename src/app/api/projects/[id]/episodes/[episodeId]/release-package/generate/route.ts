import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { persistReleasePackageJson, resolveMediaReadUrl } from '@/server/services/media-persist'

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
        videoUrl: await resolveMediaReadUrl(finalVideo.storageObjectKey, finalVideo.videoUrl),
        storageObjectKey: finalVideo.storageObjectKey,
        storageProvider: finalVideo.storageProvider,
        duration: finalVideo.duration,
        aspectRatio: finalVideo.aspectRatio,
        fps: finalVideo.fps,
      },
      shots: await Promise.all(shots.map(async shot => ({
        id: shot.id,
        shotNo: shot.shotNo,
        shotName: shot.shotName,
        duration: (shot.endTime || 0) - (shot.startTime || 0),
        imageStorageObjectKey: shot.shotImages[0]?.storageObjectKey || null,
        videoStorageObjectKey: shot.shotVideos[0]?.storageObjectKey || null,
        imageUrl: shot.shotImages[0]
          ? await resolveMediaReadUrl(shot.shotImages[0].storageObjectKey, shot.shotImages[0].imageUrl)
          : null,
        videoUrl: shot.shotVideos[0]
          ? await resolveMediaReadUrl(shot.shotVideos[0].storageObjectKey, shot.shotVideos[0].videoUrl)
          : null,
      }))),
    }

    const persistedPackage = await persistReleasePackageJson(
      JSON.stringify(manifest, null, 2),
      projectId,
      `episodes/${episodeId}`,
    )

    const updated = await prisma.finalVideo.update({
      where: { id: finalVideo.id },
      data: {
        assetPackageUrl: persistedPackage.readUrl,
        assetPackageObjectKey: persistedPackage.storageObjectKey,
        assetPackageStorageProvider: persistedPackage.storageProvider,
      },
    })

    return NextResponse.json({
      success: true,
      data: {
        finalVideoId: updated.id,
        packageUrl: persistedPackage.readUrl,
        packageObjectKey: persistedPackage.storageObjectKey,
        packageStorageProvider: persistedPackage.storageProvider,
        manifest,
      },
    })
  } catch (error) {
    console.error('Failed to generate release package:', error)
    return NextResponse.json({ success: false, error: '生成发布包失败' }, { status: 500 })
  }
}
