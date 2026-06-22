/**
 * MediaStorage barrel（Phase 7）
 * --------------------------------------------
 * 对外统一入口：getMediaStorage() 按 factory 选择 provider。
 * 保留 Phase 6 的 mediaStorage 兼容名（委托当前 provider）。
 */
export * from './types'
export { getMediaStorage, validateS3Config, __resetMediaStorageCache } from './factory'
export type { StorageProviderName } from './factory'
export { localStorageProvider } from './local-storage'
export { createS3StorageProvider, type S3ProviderConfig } from './s3-storage'
export { validateSourceUrl, isSsrfBlockedHost, isPrivateIp } from './security'
export { generateObjectKey, extFromContentType } from './object-key'
export { getPersistPolicy, isProduction, type MediaPersistencePolicy } from './persist-policy'
export { sanitizeSourceUrl, hasSensitiveQueryParams } from './sanitize-url'

import { getMediaStorage } from './factory'
import { resolveLocalPath as localResolveLocalPath } from './local-storage'
import type {
  IngestFromUrlInput,
  CreateReadUrlInput,
  StoredMedia,
  MediaObjectMetadata,
} from './types'

/**
 * Phase 6 兼容入口：mediaStorage 委托当前 factory provider。
 * 新代码应直接用 getMediaStorage()。
 */
export const mediaStorage = {
  get name() {
    return getMediaStorage().name
  },
  ingestFromUrl(input: IngestFromUrlInput): Promise<StoredMedia> {
    return getMediaStorage().ingestFromUrl(input)
  },
  createReadUrl(input: CreateReadUrlInput): Promise<string> {
    return getMediaStorage().createReadUrl(input)
  },
  deleteObject(objectKey: string): Promise<void> {
    return getMediaStorage().deleteObject(objectKey)
  },
  exists(objectKey: string): Promise<boolean> {
    return getMediaStorage().exists(objectKey)
  },
  getMetadata(objectKey: string): Promise<MediaObjectMetadata> {
    return getMediaStorage().getMetadata(objectKey)
  },
  /**
   * local 专用：解析本地路径（供 /api/media 路由使用）。
   * 非 local provider 返回 null。
   */
  resolveLocalPath(objectKey: string): string | null {
    if (getMediaStorage().name === 'local-fs') {
      return localResolveLocalPath(objectKey)
    }
    return null
  },
}
