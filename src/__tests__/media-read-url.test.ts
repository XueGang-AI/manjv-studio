import fs from 'fs'
import path from 'path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { __resetMediaStorageCache } from '@/server/services/media-storage'
import { resolveMediaReadUrl, resolveMediaRenderSource } from '@/server/services/media-persist'

const testObjectKey = 'projects/test-project/videos/read-url-test.mp4'
const testFilePath = path.resolve('uploads/media', testObjectKey)
const testProviderPath = path.join('uploads/media', testObjectKey)

describe('resolveMediaReadUrl', () => {
  beforeEach(() => {
    process.env.MEDIA_STORAGE_PROVIDER = 'local'
    delete process.env.MEDIA_STORAGE_ENABLE_REMOTE
    __resetMediaStorageCache()
    fs.rmSync(path.dirname(testFilePath), { recursive: true, force: true })
  })

  afterEach(() => {
    fs.rmSync(path.dirname(testFilePath), { recursive: true, force: true })
    __resetMediaStorageCache()
  })

  it('本地对象真实存在时返回 /api/media 读取 URL', async () => {
    fs.mkdirSync(path.dirname(testFilePath), { recursive: true })
    fs.writeFileSync(testFilePath, 'video')

    await expect(resolveMediaReadUrl(testObjectKey, null)).resolves.toBe(`/api/media/${testObjectKey}`)
  })

  it('本地对象缺失时不再返回必然 404 的本地 legacy URL', async () => {
    await expect(resolveMediaReadUrl(testObjectKey, `/api/media/${testObjectKey}`)).resolves.toBeNull()
  })

  it('本地对象缺失时可回退非本地 legacy URL', async () => {
    await expect(resolveMediaReadUrl(testObjectKey, 'https://media.example.test/signed.mp4')).resolves.toBe(
      'https://media.example.test/signed.mp4',
    )
  })

  it('后端渲染时把本地 storage object 解析为受控文件路径', async () => {
    fs.mkdirSync(path.dirname(testFilePath), { recursive: true })
    fs.writeFileSync(testFilePath, 'video')

    await expect(resolveMediaRenderSource(testObjectKey, `/api/media/${testObjectKey}`)).resolves.toBe(testProviderPath)
  })

  it('后端渲染可从 /api/media legacy URL 解析本地文件路径', async () => {
    fs.mkdirSync(path.dirname(testFilePath), { recursive: true })
    fs.writeFileSync(testFilePath, 'video')

    await expect(resolveMediaRenderSource(null, `/api/media/${testObjectKey}`)).resolves.toBe(testProviderPath)
  })
})
