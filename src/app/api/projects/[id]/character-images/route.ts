import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { toLocalMediaReadUrl } from '@/server/services/local-media-read-url'
import { resolveMediaReadUrl } from '@/server/services/media-persist'

/**
 * GET /api/projects/:id/character-images
 * 获取所有角色候选图（按角色分组）
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: projectId } = await params

    const project = await prisma.project.findUnique({ where: { id: projectId } })
    if (!project) {
      return NextResponse.json({ success: false, error: '项目不存在' }, { status: 404 })
    }

    // 获取所有已确认的角色
    const characters = await prisma.character.findMany({
      where: { projectId, confirmed: true },
      orderBy: { createdAt: 'asc' },
    })

    // 获取每个角色的候选图
    const grouped = await Promise.all(
      characters.map(async (char) => {
        const images = await prisma.characterImage.findMany({
          where: { characterId: char.id, projectId },
          orderBy: { createdAt: 'desc' },
        })
        const readableImages = await Promise.all(images.map(async image => ({
          ...image,
          imageUrl: await resolveMediaReadUrl(
            image.storageObjectKey,
            toLocalMediaReadUrl(image.imageUrl) || image.imageUrl,
          ),
        })))
        // 统计各 reference_type 确认情况
        const confirmedTypes = [...new Set(readableImages.filter(i => i.isConfirmed).map(i => i.referenceType || 'front_full_body'))]
        return {
          character: {
            id: char.id,
            name: char.name,
            roleType: char.roleType,
            zhFixedPrompt: char.zhFixedPrompt,
            enFixedPrompt: char.enFixedPrompt,
          },
          images: readableImages,
          selectedImage: readableImages.find(img => img.isSelected) || null,
          confirmed: readableImages.some(img => img.isConfirmed),
          confirmedTypes,
          confirmedTypeCount: confirmedTypes.length,
        }
      })
    )

    const allConfirmed = grouped.length > 0 && grouped.every(g => g.confirmed)

    return NextResponse.json({
      success: true,
      data: {
        projectId,
        projectStatus: project.status,
        characters: grouped,
        allConfirmed,
      },
    })
  } catch (error) {
    console.error('Failed to fetch character images:', error)
    return NextResponse.json(
      { success: false, error: '获取角色图失败' },
      { status: 500 }
    )
  }
}
