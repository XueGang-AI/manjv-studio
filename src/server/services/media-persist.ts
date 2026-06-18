/**
 * 图片持久化辅助（Phase 6）
 * --------------------------------------------
 * 将供应商短期签名 URL 图片转存到项目自有存储，
 * 数据库保存稳定 storageObjectKey，运行时生成可访问 URL。
 *
 * 用法：图片生成成功后调用，写入 CharacterImage/ShotImage 的
 * storageObjectKey/storageProvider/sourceUrl，imageUrl 改为本地可访问 URL。
 *
 * 失败处理：转存失败抛错，调用方决定是否标记处理失败（不推进到可确认状态）。
 */

import { mediaStorage, type MediaType } from './media-storage'

export interface PersistImageResult {
  storageObjectKey: string
  storageProvider: string
  sourceUrl: string
  /** 本地可访问 URL（替代供应商短期签名 URL） */
  readUrl: string
}

/**
 * 转存供应商图片到自有存储。
 * @param sourceUrl 供应商短期签名 URL（如 Ark TOS URL）
 * @param projectId 项目 ID（用于 objectKey 路径）
 * @returns 持久化结果，含 storageObjectKey + 可访问 readUrl
 */
export async function persistImageFromUrl(
  sourceUrl: string,
  projectId: string,
): Promise<PersistImageResult> {
  if (!sourceUrl) {
    throw new Error('来源图片 URL 为空')
  }
  const stored = await mediaStorage.ingestFromUrl({
    sourceUrl,
    projectId,
    mediaType: 'image' as MediaType,
  })
  const readUrl = await mediaStorage.createReadUrl({
    objectKey: stored.objectKey,
    expiresInSeconds: 86400,
  })
  return {
    storageObjectKey: stored.objectKey,
    storageProvider: stored.provider,
    sourceUrl,
    readUrl,
  }
}

/**
 * 为已有 storageObjectKey 生成可访问 URL（运行时）。
 * 本地 FS 返回稳定 /api/media/ 路径。
 */
export async function getReadUrl(storageObjectKey: string): Promise<string> {
  return mediaStorage.createReadUrl({
    objectKey: storageObjectKey,
    expiresInSeconds: 86400,
  })
}
