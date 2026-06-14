// ============================================
// 版本管理服务
// ============================================
import prisma from '@/lib/prisma'

type JsonValue = import('@prisma/client').Prisma.InputJsonValue

export type EntityType = 'STORY_PACKAGE' | 'CHARACTER_SET' | 'CHARACTER_IMAGE_SET' |
  'STORYBOARD' | 'SHOT_IMAGE_SET' | 'SHOT_VIDEO_SET' | 'VOICE_SCRIPT' | 'FINAL_VIDEO'

export type ChangeType = 'GENERATE' | 'REGENERATE' | 'EDIT' | 'CONFIRM' | 'ROLLBACK' | 'SELECT'

export interface CreateVersionInput {
  projectId: string
  entityType: EntityType | string
  entityId: string
  snapshot: Record<string, unknown>
  changeType?: ChangeType | string
  description?: string
  sourceTaskId?: string
  isConfirmed?: boolean
}

export class VersionService {
  /** 创建版本记录 */
  async createVersion(input: CreateVersionInput) {
    const latest = await prisma.projectVersion.findFirst({
      where: { projectId: input.projectId, entityType: input.entityType },
      orderBy: { version: 'desc' },
    })
    const nextVersion = (latest?.version || 0) + 1

    // 清除同类型旧的 current 标记
    await prisma.projectVersion.updateMany({
      where: { projectId: input.projectId, entityType: input.entityType, isCurrent: true },
      data: { isCurrent: false },
    })

    return prisma.projectVersion.create({
      data: {
        projectId: input.projectId,
        entityType: input.entityType,
        entityId: input.entityId,
        version: nextVersion,
        snapshot: input.snapshot as unknown as JsonValue,
        changeType: input.changeType || 'GENERATE',
        description: input.description || '',
        sourceTaskId: input.sourceTaskId || null,
        isCurrent: true,
        isConfirmed: input.isConfirmed || false,
      },
    })
  }

  /** 获取项目的版本列表 */
  async getVersions(projectId: string, entityType?: string) {
    const where: Record<string, unknown> = { projectId }
    if (entityType) where.entityType = entityType
    return prisma.projectVersion.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 100,
    })
  }

  /** 获取单个版本 */
  async getVersion(versionId: string) {
    return prisma.projectVersion.findUnique({ where: { id: versionId } })
  }

  /** 获取当前版本 */
  async getCurrentVersion(projectId: string, entityType: string) {
    return prisma.projectVersion.findFirst({
      where: { projectId, entityType, isCurrent: true },
    })
  }

  /** 设置当前版本 */
  async setCurrentVersion(versionId: string) {
    const ver = await prisma.projectVersion.findUnique({ where: { id: versionId } })
    if (!ver) throw new Error('版本不存在')

    // 取消同类型的其他 current
    await prisma.projectVersion.updateMany({
      where: { projectId: ver.projectId, entityType: ver.entityType },
      data: { isCurrent: false },
    })
    // 设置当前
    await prisma.projectVersion.update({
      where: { id: versionId },
      data: { isCurrent: true },
    })

    return this.getVersion(versionId)
  }

  /** 确认版本 */
  async confirmVersion(versionId: string) {
    return prisma.projectVersion.update({
      where: { id: versionId },
      data: { isConfirmed: true },
    })
  }

  /** 回退到指定版本 */
  async rollbackToVersion(versionId: string) {
    const targetVer = await prisma.projectVersion.findUnique({ where: { id: versionId } })
    if (!targetVer) throw new Error('版本不存在')

    const snapshot = targetVer.snapshot as Record<string, unknown>
    const entityType = targetVer.entityType

    // 根据 entity_type 恢复业务数据
    switch (entityType) {
      case 'STORY_PACKAGE': {
        const { story_package, project_status } = snapshot as { story_package?: Record<string,unknown>; project_status?: string }
        if (story_package?.id) {
          await prisma.storyPackage.update({
            where: { id: story_package.id as string },
            data: { content: ((story_package.content as Record<string,unknown>) || {}) as unknown as JsonValue },
          })
        }
        if (project_status) {
          await prisma.project.update({
            where: { id: targetVer.projectId },
            data: { status: project_status },
          })
        }
        break
      }
      case 'CHARACTER_SET': {
        const { project_status } = snapshot as { project_status?: string }
        if (project_status) {
          await prisma.project.update({
            where: { id: targetVer.projectId },
            data: { status: project_status },
          })
        }
        break
      }
      case 'STORYBOARD': {
        const { project_status } = snapshot as { project_status?: string }
        if (project_status) {
          await prisma.project.update({
            where: { id: targetVer.projectId },
            data: { status: project_status },
          })
        }
        break
      }
      case 'SHOT_IMAGE_SET': {
        const { confirmed_image_ids, project_status } = snapshot as { confirmed_image_ids?: string[]; project_status?: string }
        if (confirmed_image_ids?.length) {
          await prisma.shotImage.updateMany({
            where: { projectId: targetVer.projectId },
            data: { isSelected: false, isConfirmed: false },
          })
          await prisma.shotImage.updateMany({
            where: { id: { in: confirmed_image_ids } },
            data: { isSelected: true, isConfirmed: true },
          })
        }
        if (project_status) {
          await prisma.project.update({
            where: { id: targetVer.projectId }, data: { status: project_status },
          })
        }
        break
      }
      case 'SHOT_VIDEO_SET': {
        const { confirmed_video_ids, project_status } = snapshot as { confirmed_video_ids?: string[]; project_status?: string }
        if (confirmed_video_ids?.length) {
          await prisma.shotVideo.updateMany({
            where: { projectId: targetVer.projectId },
            data: { isSelected: false, isConfirmed: false },
          })
          await prisma.shotVideo.updateMany({
            where: { id: { in: confirmed_video_ids } },
            data: { isSelected: true, isConfirmed: true },
          })
        }
        if (project_status) {
          await prisma.project.update({
            where: { id: targetVer.projectId }, data: { status: project_status },
          })
        }
        break
      }
      default: {
        if (snapshot.project_status) {
          await prisma.project.update({
            where: { id: targetVer.projectId },
            data: { status: snapshot.project_status as string },
          })
        }
      }
    }

    // 设为当前版本
    await this.setCurrentVersion(versionId)

    // 创建 rollback 记录
    return this.createVersion({
      projectId: targetVer.projectId,
      entityType: targetVer.entityType,
      entityId: targetVer.entityId,
      snapshot: targetVer.snapshot as Record<string,unknown>,
      changeType: 'ROLLBACK',
      description: `回退到 v${targetVer.version}`,
    })
  }

  /** 对比两个版本 */
  async compareVersions(fromId: string, toId: string) {
    const from = await prisma.projectVersion.findUnique({ where: { id: fromId } })
    const to = await prisma.projectVersion.findUnique({ where: { id: toId } })
    if (!from || !to) throw new Error('版本不存在')

    const fromSnap = from.snapshot as Record<string,unknown>
    const toSnap = to.snapshot as Record<string,unknown>

    const diff: Record<string, { from: unknown; to: unknown }> = {}
    for (const key of Object.keys({ ...fromSnap, ...toSnap })) {
      if (JSON.stringify(fromSnap[key]) !== JSON.stringify(toSnap[key])) {
        diff[key] = { from: fromSnap[key], to: toSnap[key] }
      }
    }

    return { from: { id: from.id, version: from.version }, to: { id: to.id, version: to.version }, diff }
  }
}

export const versionService = new VersionService()
