import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { toLocalMediaReadUrl } from '@/server/services/local-media-read-url'

/**
 * GET /api/projects/:id/episodes/:episodeId/scene-references
 * 读取当前剧集的场景参考图。
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; episodeId: string }> }
) {
  try {
    const { id: projectId, episodeId } = await params

    const scenes = await prisma.scene.findMany({
      where: { projectId, episodeId },
      orderBy: { createdAt: 'asc' },
      include: {
        sceneImages: { orderBy: { createdAt: 'asc' } },
        shots: { select: { id: true, shotNo: true, location: true, sceneTime: true }, orderBy: { shotNo: 'asc' } },
      },
    })

    const readableScenes = scenes.map(scene => ({
      ...scene,
      sceneImages: scene.sceneImages.map(image => ({
        ...image,
        imageUrl: toLocalMediaReadUrl(image.imageUrl) || image.imageUrl,
      })),
    }))

    return NextResponse.json({ success: true, data: { scenes: readableScenes } })
  } catch (error) {
    console.error('Failed to fetch scene references:', error)
    return NextResponse.json({ success: false, error: '获取场景参考图失败' }, { status: 500 })
  }
}
