/**
 * MediaStorage Factory 单元测试（Phase 8）
 * --------------------------------------------
 * 验证 Provider 选择、远程存储显式启用、aliyun-oss 配置缺失失败。
 */
import { describe, it, expect, afterEach, beforeEach } from 'vitest'

import { getMediaStorage, __resetMediaStorageCache, validateS3Config } from '../server/services/media-storage/factory'

describe('MediaStorage Factory', () => {
  const origEnv = { ...process.env }

  beforeEach(() => {
    __resetMediaStorageCache()
  })

  afterEach(() => {
    process.env = { ...origEnv }
    __resetMediaStorageCache()
  })

  it('默认 local provider（development）', () => {
    process.env.NODE_ENV = 'development'
    delete process.env.MEDIA_STORAGE_PROVIDER
    const storage = getMediaStorage()
    expect(storage.name).toBe('local-fs')
  })

  it('production + local 仍使用 local-fs', () => {
    process.env.NODE_ENV = 'production'
    process.env.MEDIA_STORAGE_PROVIDER = 'local'
    const storage = getMediaStorage()
    expect(storage.name).toBe('local-fs')
  })

  it('远程未启用时忽略 aliyun-oss 并回退 local-fs', () => {
    process.env.NODE_ENV = 'production'
    process.env.MEDIA_STORAGE_PROVIDER = 'aliyun-oss'
    delete process.env.MEDIA_STORAGE_ENABLE_REMOTE
    const storage = getMediaStorage()
    expect(storage.name).toBe('local-fs')
  })

  it('远程启用后 aliyun-oss 配置缺失时抛错', () => {
    process.env.NODE_ENV = 'production'
    process.env.MEDIA_STORAGE_PROVIDER = 'aliyun-oss'
    process.env.MEDIA_STORAGE_ENABLE_REMOTE = 'true'
    delete process.env.OSS_BUCKET
    delete process.env.OSS_ACCESS_KEY_ID
    expect(() => getMediaStorage()).toThrow(/配置不完整/)
  })

  it('远程启用且 aliyun-oss 完整配置返回 aliyun-oss provider', () => {
    process.env.NODE_ENV = 'production'
    process.env.MEDIA_STORAGE_PROVIDER = 'aliyun-oss'
    process.env.MEDIA_STORAGE_ENABLE_REMOTE = 'true'
    process.env.OSS_BUCKET = 'manjv-studio'
    process.env.OSS_REGION = 'oss-cn-hangzhou'
    process.env.OSS_PUBLIC_ENDPOINT = 'https://oss-cn-hangzhou.aliyuncs.com'
    process.env.OSS_ACCESS_KEY_ID = 'kid'
    process.env.OSS_ACCESS_KEY_SECRET = 'secret'
    const storage = getMediaStorage()
    expect(storage.name).toBe('aliyun-oss')
  })

  it('未知 provider 抛错', () => {
    process.env.MEDIA_STORAGE_PROVIDER = 'unknown'
    expect(() => getMediaStorage()).toThrow(/未知/)
  })

  it('s3 配置校验返回缺失项', () => {
    delete process.env.MEDIA_STORAGE_ACCESS_KEY
    delete process.env.MEDIA_STORAGE_BUCKET
    const errors = validateS3Config()
    expect(errors.length).toBeGreaterThan(0)
    expect(errors.some(e => e.includes('ACCESS_KEY'))).toBe(true)
  })
})
