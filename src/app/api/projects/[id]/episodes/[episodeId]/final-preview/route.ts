import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { toLocalMediaReadUrl } from '@/server/services/local-media-read-url'
import { resolveMediaReadUrl } from '@/server/services/media-persist'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; episodeId: string }> }
) {
  try {
    const { id: projectId, episodeId } = await params

    const project = await prisma.project.findUnique({ where: { id: projectId } })
    const finalVideos = await prisma.finalVideo.findMany({
      where: { episodeId, projectId },
      orderBy: { createdAt: 'desc' },
    })

    const shots = await prisma.shot.findMany({
      where: { episodeId, projectId },
      orderBy: { shotNo: 'asc' },
      include: {
        shotVideos: { where: { isConfirmed: true } },
      },
    })

    const allVideosConfirmed = shots.every(s => s.shotVideos.length > 0)
    const readableFinalVideos = await Promise.all(finalVideos.map(async video => ({
      ...video,
      videoUrl: await resolveMediaReadUrl(
        video.storageObjectKey,
        toLocalMediaReadUrl(video.videoUrl) || video.videoUrl,
      ),
      assetPackageUrl: await resolveMediaReadUrl(
        video.assetPackageObjectKey,
        toLocalMediaReadUrl(video.assetPackageUrl) || video.assetPackageUrl,
      ),
    })))

    return NextResponse.json({
      success: true,
      data: {
        projectId, episodeId, projectStatus: project?.status || '',
        finalVideos: readableFinalVideos,
        latest: readableFinalVideos[0] || null,
        shotsWithVideos: shots.map(s => ({
          shotNo: s.shotNo, shotName: s.shotName,
          videoCount: s.shotVideos.length,
        })),
        allVideosConfirmed,
        canRender: allVideosConfirmed && project?.status === 'SHOT_VIDEO_CONFIRMED',
      },
    })
  } catch (error) {
    console.error('Failed to fetch final preview:', error)
    return NextResponse.json({ success: false, error: '获取失败' }, { status: 500 })
  }
}
