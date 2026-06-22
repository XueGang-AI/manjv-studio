/**
 * MediaStorage Factory（Phase 7/8）
 * --------------------------------------------
 * 根据环境变量选择 provider：
 * - MEDIA_STORAGE_PROVIDER=local（默认，仅 development）
 * - MEDIA_STORAGE_PROVIDER=s3（S3-compatible 通用实现）
 * - MEDIA_STORAGE_PROVIDER=aliyun-oss（阿里云 OSS，V4 签名，生产推荐）
 *
 * 安全：
 * - production + local → 抛配置错误，不自动退回本地磁盘
 * - production 不会自动退回 local 或 s3（必须显式配置）
 * - 凭证仅服务端读取，不发送客户端
 * - 启动时校验必要变量
 *
 * 环境变量：
 * - MEDIA_STORAGE_PROVIDER: local | s3 | aliyun-oss
 * - S3: MEDIA_STORAGE_ACCESS_KEY/SECRET_KEY/REGION/BUCKET/ENDPOINT/FORCE_PATH_STYLE/PUBLIC_BASE_URL
 * - OSS: OSS_BUCKET/OSS_REGION/OSS_PUBLIC_ENDPOINT/OSS_INTERNAL_ENDPOINT/OSS_USE_INTERNAL_ENDPOINT/
 *        OSS_ACCESS_KEY_ID/OSS_ACCESS_KEY_SECRET/OSS_SIGNED_URL_EXPIRES_SECONDS
 */

import { localStorageProvider } from './local-storage'
import { createS3StorageProvider, type S3ProviderConfig } from './s3-storage'
import { createAliyunOssStorageProvider } from './aliyun-oss-storage'
import { readAliyunOssConfig } from './aliyun-oss-config'
import type { MediaStorageProvider } from './types'

export type StorageProviderName = 'local' | 's3' | 'aliyun-oss'

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

  if (providerName === 'aliyun-oss') {
    // readAliyunOssConfig 内部校验完整性，缺失时抛错（生产不退回 local/s3）
    const config = readAliyunOssConfig()
    cachedProvider = createAliyunOssStorageProvider(config)
    return cachedProvider
  }

  throw new Error(`未知的 MEDIA_STORAGE_PROVIDER: ${providerName}`)
}

/** 测试专用：重置缓存（切换 provider） */
export function __resetMediaStorageCache(): void {
  cachedProvider = null
}

export type { MediaStorageProvider } from './types'
