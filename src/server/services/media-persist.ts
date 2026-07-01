/**
 * 媒体持久化辅助（Phase 6/7）
 * --------------------------------------------
 * 将供应商短期签名 URL 图片转存到项目自有存储，
 * 数据库保存稳定 storageObjectKey，运行时按需生成可访问 URL。
 *
 * 用法：图片生成成功后调用 persistImageFromUrl，写入 CharacterImage/ShotImage 的
 * storageObjectKey/storageProvider/sourceUrl。imageUrl 改为运行时生成的 readUrl。
 *
 * 失败处理：转存失败抛错，调用方决定是否标记处理失败（不推进到可确认状态）。
 *
 * 数据库字段语义（Phase 7）：
 * - storageObjectKey：长期文件身份，正式业务规范来源
 * - storageProvider：该对象由哪个 provider 管理
 * - sourceUrl：供应商原始地址，仅来源审计/迁移用，不作长期读取
 * - imageUrl/videoUrl：兼容字段，运行时由 resolveMediaReadUrl 动态生成，
 *   不再永久保存短期签名 URL
 */

import { mediaStorage, type MediaType } from './media-storage'
import { sanitizeSourceUrl } from './media-storage/sanitize-url'
import { getPersistPolicy, isProduction } from './media-storage/persist-policy'
import fs from 'fs'

export interface PersistOutcome {
  storageObjectKey: string | null
  storageProvider: string | null
  /** 兼容字段值（local: readUrl；s3: readUrl；fallback: 供应商临时 URL） */
  imageUrl: string
  /** 脱敏来源 URL */
  sourceUrl: string
  /** 是否成功持久化到自有存储 */
  persisted: boolean
  /** 失败原因（persisted=false 时） */
  error?: string
}

/**
 * 统一持久化 + fallback 决策（Phase 7.1）。
 *
 * 行为：
 * - 转存成功 → persisted=true，imageUrl=readUrl，storageObjectKey 有值
 * - 转存失败 + dev（allowEphemeralFallback=true）→ persisted=false，imageUrl=供应商临时 URL（脱敏 warning），storageObjectKey=null
 * - 转存失败 + prod（allowEphemeralFallback=false）→ persisted=false，imageUrl=''（不保存供应商 URL），storageObjectKey=null
 *
 * 调用方按 persisted 决定：
 * - persisted=true → 写 DB，可推进业务
 * - persisted=false + dev → 写 DB（fallback），标记无 storageObjectKey
 * - persisted=false + prod → 不写 DB / 任务 failed，不推进业务
 */
export async function persistImageWithPolicy(
  sourceUrl: string,
  projectId: string,
  mediaType: MediaType,
  keyPrefix?: string,
): Promise<PersistOutcome> {
  if (!sourceUrl) {
    return { storageObjectKey: null, storageProvider: null, imageUrl: '', sourceUrl: '', persisted: false, error: '来源 URL 为空' }
  }

  try {
    const stored = await mediaStorage.ingestFromUrl({ sourceUrl, projectId, mediaType, keyPrefix })
    const readUrl = await mediaStorage.createReadUrl({ objectKey: stored.objectKey, expiresInSeconds: 86400 })
    return {
      storageObjectKey: stored.objectKey,
      storageProvider: stored.provider,
      imageUrl: readUrl,
      sourceUrl: sanitizeSourceUrl(sourceUrl),
      persisted: true,
    }
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'unknown'
    const policy = getPersistPolicy()
    if (policy.allowEphemeralFallback) {
      // dev: 允许临时 fallback，输出脱敏 warning（不含完整签名 URL）
      console.warn(`[media-persist] dev fallback: 转存失败（${errorMsg}），使用供应商临时 URL`)
      return {
        storageObjectKey: null,
        storageProvider: null,
        imageUrl: sourceUrl, // dev 临时 fallback（内存中，写 DB 后过期）
        sourceUrl: sanitizeSourceUrl(sourceUrl),
        persisted: false,
        error: errorMsg,
      }
    }
    // prod: 禁止 fallback，不保存供应商 URL
    console.error(`[media-persist] production persist failed: ${errorMsg}`)
    return {
      storageObjectKey: null,
      storageProvider: null,
      imageUrl: '', // 不保存供应商签名 URL
      sourceUrl: sanitizeSourceUrl(sourceUrl),
      persisted: false,
      error: errorMsg,
    }
  }
}

export { isProduction }

export interface PersistImageResult {
  storageObjectKey: string
  storageProvider: string
  /** 脱敏后的来源 URL（仅 protocol+host+pathname，无签名参数） */
  sourceUrl: string
  /** 运行时可访问 URL（local: /api/media；s3: 临时签名 URL） */
  readUrl: string
  checksum?: string
  sizeBytes?: number
  contentType?: string
}

/**
 * 转存供应商图片到自有存储。
 * @param sourceUrl 供应商短期签名 URL（如 Ark TOS URL）— 完整 URL 仅内存中用于下载
 * @param projectId 项目 ID（用于 objectKey 路径）
 * @param keyPrefix 可选业务子路径（如 episodes/{eid}/shots/{sid}）
 * @returns 持久化结果，sourceUrl 已脱敏（无签名参数）
 */
export async function persistImageFromUrl(
  sourceUrl: string,
  projectId: string,
  keyPrefix?: string,
): Promise<PersistImageResult> {
  if (!sourceUrl) {
    throw new Error('来源图片 URL 为空')
  }
  const stored = await mediaStorage.ingestFromUrl({
    sourceUrl,
    projectId,
    mediaType: 'image' as MediaType,
    keyPrefix,
  })
  const readUrl = await mediaStorage.createReadUrl({
    objectKey: stored.objectKey,
    expiresInSeconds: 86400,
  })
  return {
    storageObjectKey: stored.objectKey,
    storageProvider: stored.provider,
    // 脱敏：仅保留 protocol+host+pathname，删除签名 query
    sourceUrl: sanitizeSourceUrl(sourceUrl),
    readUrl,
    checksum: stored.checksum,
    sizeBytes: stored.sizeBytes,
    contentType: stored.contentType,
  }
}

/**
 * 转存供应商视频到自有存储（视频生成完成下载后）。
 * sourceUrl 同样脱敏。
 */
export async function persistVideoFromUrl(
  sourceUrl: string,
  projectId: string,
  keyPrefix?: string,
  mediaType: Extract<MediaType, 'video' | 'final_video'> = 'video',
): Promise<PersistImageResult> {
  if (!sourceUrl) {
    throw new Error('来源视频 URL 为空')
  }
  const stored = await mediaStorage.ingestFromUrl({
    sourceUrl,
    projectId,
    mediaType,
    keyPrefix,
  })
  const readUrl = await mediaStorage.createReadUrl({
    objectKey: stored.objectKey,
    expiresInSeconds: 86400,
  })
  return {
    storageObjectKey: stored.objectKey,
    storageProvider: stored.provider,
    sourceUrl: sanitizeSourceUrl(sourceUrl),
    readUrl,
    checksum: stored.checksum,
    sizeBytes: stored.sizeBytes,
    contentType: stored.contentType,
  }
}

export async function persistLocalVideoFile(
  filePath: string,
  projectId: string,
  keyPrefix?: string,
  mediaType: Extract<MediaType, 'video' | 'final_video'> = 'video',
): Promise<PersistImageResult> {
  if (!filePath || !fs.existsSync(filePath)) {
    throw new Error('本地视频文件不存在，无法转存')
  }
  const buffer = fs.readFileSync(filePath)
  const stored = await mediaStorage.putObject({
    body: buffer,
    projectId,
    mediaType,
    contentType: 'video/mp4',
    keyPrefix,
  })
  const readUrl = await mediaStorage.createReadUrl({
    objectKey: stored.objectKey,
    expiresInSeconds: 86400,
  })
  return {
    storageObjectKey: stored.objectKey,
    storageProvider: stored.provider,
    sourceUrl: '',
    readUrl,
    checksum: stored.checksum,
    sizeBytes: stored.sizeBytes,
    contentType: stored.contentType,
  }
}

export async function persistReleasePackageJson(
  json: string,
  projectId: string,
  keyPrefix?: string,
): Promise<PersistImageResult> {
  const stored = await mediaStorage.putObject({
    body: Buffer.from(json, 'utf-8'),
    projectId,
    mediaType: 'release_package',
    contentType: 'application/json',
    keyPrefix,
  })
  const readUrl = await mediaStorage.createReadUrl({
    objectKey: stored.objectKey,
    expiresInSeconds: 86400,
  })
  return {
    storageObjectKey: stored.objectKey,
    storageProvider: stored.provider,
    sourceUrl: '',
    readUrl,
    checksum: stored.checksum,
    sizeBytes: stored.sizeBytes,
    contentType: stored.contentType,
  }
}

/**
 * 为已有 storageObjectKey 生成可访问 URL（运行时）。
 * 每次按需生成新签名 URL，不持久化。
 * local 返回稳定 /api/media/ 路径；s3 返回临时签名 URL。
 */
export async function getReadUrl(storageObjectKey: string): Promise<string> {
  return mediaStorage.createReadUrl({
    objectKey: storageObjectKey,
    expiresInSeconds: 86400,
  })
}

/**
 * 统一解析媒体记录的可读 URL（Phase 7 第六节）。
 *
 * 优先级：
 * 1. 有 storageObjectKey → 按需生成 readUrl（自有存储，长期可访问）
 * 2. 无 storageObjectKey → 回退 legacy imageUrl/videoUrl（历史数据，可能已过期）
 *
 * 不把生成的短期签名 URL 重新持久化进数据库。
 */
export async function resolveMediaReadUrl(
  storageObjectKey: string | null | undefined,
  legacyUrl: string | null | undefined,
): Promise<string | null> {
  if (storageObjectKey) {
    return getReadUrl(storageObjectKey)
  }
  return legacyUrl || null
}
