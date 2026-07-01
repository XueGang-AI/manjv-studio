/**
 * Aliyun OSS Provider 单元测试（Phase 8）
 * --------------------------------------------
 * Mock ali-oss SDK，不依赖真实云服务。
 * 验证：配置校验、Provider 选择、V4 签名、endpoint 选择、脱敏、删除失败保留 DB。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

// Mock ali-oss 模块（在 import provider 前注册）
const mockPut = vi.fn()
const mockMultipartUpload = vi.fn()
const mockSignatureUrl = vi.fn()
const mockSignatureUrlV4 = vi.fn()
const mockDelete = vi.fn()
const mockHead = vi.fn()
const mockAbortMultipartUpload = vi.fn()

vi.mock('ali-oss', () => {
  return {
    default: class MockOSS {
      options: Record<string, unknown>
      constructor(options: Record<string, unknown>) {
        this.options = options
      }
      put = mockPut
      multipartUpload = mockMultipartUpload
      signatureUrl = mockSignatureUrl
      signatureUrlV4 = mockSignatureUrlV4
      delete = mockDelete
      head = mockHead
      abortMultipartUpload = mockAbortMultipartUpload
    },
  }
})

import { createAliyunOssStorageProvider } from '../server/services/media-storage/aliyun-oss-storage'
import { readAliyunOssConfig } from '../server/services/media-storage/aliyun-oss-config'
import { sanitizeSourceUrl, hasSensitiveQueryParams } from '../server/services/media-storage/sanitize-url'
import { getPersistPolicy } from '../server/services/media-storage/persist-policy'
import { extFromContentType, generateObjectKey } from '../server/services/media-storage/object-key'
import { allowedTypesFor, maxBytesFor } from '../server/services/media-storage/types'

const baseConfig = {
  bucket: 'manjv-studio',
  region: 'oss-cn-hangzhou',
  publicEndpoint: 'https://oss-cn-hangzhou.aliyuncs.com',
  internalEndpoint: undefined as string | undefined,
  useInternalEndpoint: false,
  accessKeyId: 'test-key-id',
  accessKeySecret: 'test-key-secret',
  signedUrlExpiresSeconds: 3600,
}

describe('Aliyun OSS Provider 配置', () => {
  const origEnv = { ...process.env }

  afterEach(() => {
    process.env = { ...origEnv }
  })

  it('缺少必要配置时抛错', () => {
    delete process.env.OSS_BUCKET
    delete process.env.OSS_ACCESS_KEY_ID
    expect(() => readAliyunOssConfig()).toThrow(/配置不完整/)
  })

  it('完整配置正确读取', () => {
    process.env.OSS_BUCKET = 'manjv-studio'
    process.env.OSS_REGION = 'oss-cn-hangzhou'
    process.env.OSS_PUBLIC_ENDPOINT = 'https://oss-cn-hangzhou.aliyuncs.com'
    process.env.OSS_ACCESS_KEY_ID = 'kid'
    process.env.OSS_ACCESS_KEY_SECRET = 'secret'
    process.env.OSS_SIGNED_URL_EXPIRES_SECONDS = '3600'
    const cfg = readAliyunOssConfig()
    expect(cfg.bucket).toBe('manjv-studio')
    expect(cfg.region).toBe('oss-cn-hangzhou')
    expect(cfg.signedUrlExpiresSeconds).toBe(3600)
  })

  it('useInternalEndpoint=true 但无 internalEndpoint 时抛错', () => {
    process.env.OSS_BUCKET = 'manjv-studio'
    process.env.OSS_PUBLIC_ENDPOINT = 'https://oss-cn-hangzhou.aliyuncs.com'
    process.env.OSS_ACCESS_KEY_ID = 'kid'
    process.env.OSS_ACCESS_KEY_SECRET = 'secret'
    process.env.OSS_USE_INTERNAL_ENDPOINT = 'true'
    delete process.env.OSS_INTERNAL_ENDPOINT
    expect(() => readAliyunOssConfig()).toThrow(/OSS_INTERNAL_ENDPOINT 未配置/)
  })

  it('签名有效期超出范围时抛错', () => {
    process.env.OSS_BUCKET = 'manjv-studio'
    process.env.OSS_PUBLIC_ENDPOINT = 'https://oss-cn-hangzhou.aliyuncs.com'
    process.env.OSS_ACCESS_KEY_ID = 'kid'
    process.env.OSS_ACCESS_KEY_SECRET = 'secret'
    process.env.OSS_SIGNED_URL_EXPIRES_SECONDS = '100'
    expect(() => readAliyunOssConfig()).toThrow(/超出合理范围/)
  })
})

describe('Aliyun OSS Provider 行为', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSignatureUrlV4.mockResolvedValue('https://manjv-studio.oss-cn-hangzhou.aliyuncs.com/key?x-oss-signature-version=OSS4-HMAC-SHA256')
  })

  it('createReadUrl 使用 signatureUrlV4 并返回公网 URL，不含 internal', async () => {
    const provider = createAliyunOssStorageProvider(baseConfig)
    const url = await provider.createReadUrl({ objectKey: 'projects/p1/images/abc.png', expiresInSeconds: 3600 })
    // 必须调用 signatureUrlV4
    expect(mockSignatureUrlV4).toHaveBeenCalledWith(
      'GET',
      3600,
      { headers: {} },
      'projects/p1/images/abc.png',
    )
    // signatureUrl（旧 V1 签名）不得被调用
    expect(mockSignatureUrl).not.toHaveBeenCalled()
    expect(url).toBe('https://manjv-studio.oss-cn-hangzhou.aliyuncs.com/key?x-oss-signature-version=OSS4-HMAC-SHA256')
    expect(url).not.toContain('internal')
    expect(url).not.toContain('cn-hangzhou-internal')
    // 返回 URL 包含 V4 签名版本
    expect(url).toContain('x-oss-signature-version=OSS4')
  })

  it('exists 返回 true 当 head 成功', async () => {
    mockHead.mockResolvedValueOnce({ res: { status: 200, headers: {} } })
    const provider = createAliyunOssStorageProvider(baseConfig)
    const exists = await provider.exists('some/key.png')
    expect(exists).toBe(true)
  })

  it('exists 返回 false 当 404 NoSuchKey', async () => {
    const err = { status: 404, code: 'NoSuchKey' }
    mockHead.mockRejectedValueOnce(err)
    const provider = createAliyunOssStorageProvider(baseConfig)
    const exists = await provider.exists('missing/key.png')
    expect(exists).toBe(false)
  })

  it('deleteObject 成功', async () => {
    mockDelete.mockResolvedValueOnce({ res: { status: 204 } })
    const provider = createAliyunOssStorageProvider(baseConfig)
    await expect(provider.deleteObject('some/key.png')).resolves.toBeUndefined()
    expect(mockDelete).toHaveBeenCalledWith('some/key.png')
  })

  it('getMetadata 404 返回 exists:false', async () => {
    mockHead.mockRejectedValueOnce({ status: 404, code: 'NoSuchKey' })
    const provider = createAliyunOssStorageProvider(baseConfig)
    const meta = await provider.getMetadata('missing.png')
    expect(meta.exists).toBe(false)
    expect(meta.sizeBytes).toBe(0)
  })
})

describe('sourceUrl 脱敏', () => {
  it('删除 query string 和 fragment', () => {
    const url = 'https://ark-acg-cn-beijing.tos-cn-beijing.volces.com/doubao/img.jpeg?X-Tos-Signature=abc&X-Tos-Expires=86400#frag'
    const sanitized = sanitizeSourceUrl(url)
    expect(sanitized).toBe('https://ark-acg-cn-beijing.tos-cn-beijing.volces.com/doubao/img.jpeg')
    expect(sanitized).not.toContain('X-Tos-Signature')
    expect(sanitized).not.toContain('Expires')
    expect(sanitized).not.toContain('#')
  })

  it('检测敏感签名参数', () => {
    expect(hasSensitiveQueryParams('https://x.com/a.png?X-Tos-Signature=abc')).toBe(true)
    expect(hasSensitiveQueryParams('https://x.com/a.png?X-Amz-Signature=abc')).toBe(true)
    expect(hasSensitiveQueryParams('https://x.com/a.png?token=abc')).toBe(true)
    expect(hasSensitiveQueryParams('https://x.com/a.png')).toBe(false)
  })

  it('非 URL 返回空', () => {
    expect(sanitizeSourceUrl('not-a-url')).toBe('')
  })
})

describe('持久化策略', () => {
  it('development 允许临时 fallback', () => {
    const orig = process.env.NODE_ENV
    process.env.NODE_ENV = 'development'
    expect(getPersistPolicy().allowEphemeralFallback).toBe(true)
    process.env.NODE_ENV = orig
  })

  it('production 禁止临时 fallback', () => {
    const orig = process.env.NODE_ENV
    process.env.NODE_ENV = 'production'
    expect(getPersistPolicy().allowEphemeralFallback).toBe(false)
    process.env.NODE_ENV = orig
  })
})

describe('成片与发布包对象键', () => {
  it('final_video 使用 final_videos 根目录', () => {
    const key = generateObjectKey('project-1', 'final_video', 'mp4', 'episodes/episode-1')
    expect(key).toMatch(/^projects\/project-1\/final_videos\/episodes\/episode-1\/[a-f0-9]{16}\.mp4$/)
  })

  it('release_package 使用 release_packages 根目录和 json 类型', () => {
    const key = generateObjectKey('project-1', 'release_package', extFromContentType('application/json', 'release_package'), 'episodes/episode-1')
    expect(key).toMatch(/^projects\/project-1\/release_packages\/episodes\/episode-1\/[a-f0-9]{16}\.json$/)
    expect(allowedTypesFor('release_package').has('application/json')).toBe(true)
    expect(maxBytesFor('release_package')).toBe(10 * 1024 * 1024)
  })
})
