/**
 * MediaStorage Factory（Phase 7）
 * --------------------------------------------
 * 根据环境变量选择 provider：
 * - MEDIA_STORAGE_PROVIDER=local（默认，仅 development）
 * - MEDIA_STORAGE_PROVIDER=s3（生产，S3-compatible）
 *
 * 安全：
 * - production + local → 抛配置错误，不自动退回本地磁盘
 * - 凭证仅服务端读取，不发送客户端
 * - 启动时校验必要变量
 *
 * 环境变量：
 * - MEDIA_STORAGE_PROVIDER: local | s3
 * - MEDIA_STORAGE_ACCESS_KEY / SECRET_KEY（s3 必填）
 * - MEDIA_STORAGE_REGION / BUCKET / ENDPOINT（s3 必填）
 * - MEDIA_STORAGE_FORCE_PATH_STYLE: true/false（MinIO 需 true，TOS/OSS/R2 通常 false）
 * - MEDIA_STORAGE_PUBLIC_BASE_URL: 公网 base URL（可选，用于 Ark 可访问地址）
 */

import { localStorageProvider } from './local-storage'
import { createS3StorageProvider, type S3ProviderConfig } from './s3-storage'
import type { MediaStorageProvider } from './types'

export type StorageProviderName = 'local' | 's3'

function isProduction(): boolean {
  return process.env.NODE_ENV === 'production'
}

function readBool(value: string | undefined, defaultValue = false): boolean {
  if (value === undefined) return defaultValue
  return value === 'true' || value === '1'
}

/** 校验 S3 配置完整性，返回错误信息列表 */
export function validateS3Config(): string[] {
  const errors: string[] = []
  if (!process.env.MEDIA_STORAGE_ACCESS_KEY) errors.push('MEDIA_STORAGE_ACCESS_KEY 未配置')
  if (!process.env.MEDIA_STORAGE_SECRET_KEY) errors.push('MEDIA_STORAGE_SECRET_KEY 未配置')
  if (!process.env.MEDIA_STORAGE_REGION) errors.push('MEDIA_STORAGE_REGION 未配置')
  if (!process.env.MEDIA_STORAGE_BUCKET) errors.push('MEDIA_STORAGE_BUCKET 未配置')
  return errors
}

let cachedProvider: MediaStorageProvider | null = null

export function getMediaStorage(): MediaStorageProvider {
  if (cachedProvider) return cachedProvider

  const providerName = (process.env.MEDIA_STORAGE_PROVIDER || 'local') as StorageProviderName

  if (providerName === 'local') {
    if (isProduction()) {
      throw new Error(
        '生产环境禁止使用本地文件系统存储（MEDIA_STORAGE_PROVIDER=local）。' +
        '请配置 MEDIA_STORAGE_PROVIDER=s3 及相应凭证。',
      )
    }
    cachedProvider = localStorageProvider
    return cachedProvider
  }

  if (providerName === 's3') {
    const errors = validateS3Config()
    if (errors.length > 0) {
      throw new Error('S3 存储配置不完整：' + errors.join('；'))
    }
    const config: S3ProviderConfig = {
      region: process.env.MEDIA_STORAGE_REGION!,
      bucket: process.env.MEDIA_STORAGE_BUCKET!,
      accessKeyId: process.env.MEDIA_STORAGE_ACCESS_KEY!,
      secretAccessKey: process.env.MEDIA_STORAGE_SECRET_KEY!,
      endpoint: process.env.MEDIA_STORAGE_ENDPOINT,
      forcePathStyle: readBool(process.env.MEDIA_STORAGE_FORCE_PATH_STYLE, false),
      publicBaseUrl: process.env.MEDIA_STORAGE_PUBLIC_BASE_URL,
    }
    cachedProvider = createS3StorageProvider(config)
    return cachedProvider
  }

  throw new Error(`未知的 MEDIA_STORAGE_PROVIDER: ${providerName}`)
}

/** 测试专用：重置缓存（切换 provider） */
export function __resetMediaStorageCache(): void {
  cachedProvider = null
}

export type { MediaStorageProvider } from './types'
