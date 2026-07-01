/**
 * Local FS Provider（仅 development）
 * --------------------------------------------
 * 本地文件系统存储。生产环境禁止使用（factory 会拒绝 production + local）。
 */
import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import { UPLOAD_DIR, isPathInside } from '../ffmpeg-utils'
import { validateSourceUrl } from './security'
import { generateObjectKey, extFromContentType } from './object-key'
import {
  type MediaStorageProvider,
  type StoredMedia,
  type IngestFromUrlInput,
  type PutObjectInput,
  type CreateReadUrlInput,
  type MediaObjectMetadata,
  maxBytesFor,
  allowedTypesFor,
  INGEST_TIMEOUT_MS,
} from './types'

const PROVIDER_NAME = 'local-fs'

function getMediaDir(): string {
  const dir = path.join(UPLOAD_DIR, 'media')
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
  return dir
}

function localStorageProviderResolveLocalPath(objectKey: string): string | null {
  const dir = getMediaDir()
  const filePath = path.join(dir, objectKey)
  if (!isPathInside(dir, filePath)) return null
  return filePath
}

async function streamToBuffer(stream: ReadableStream<Uint8Array>): Promise<Buffer> {
  const reader = stream.getReader()
  const chunks: Uint8Array[] = []
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    if (value) chunks.push(value)
  }
  return Buffer.concat(chunks)
}

export const localStorageProvider: MediaStorageProvider = {
  name: PROVIDER_NAME,

  async ingestFromUrl(input: IngestFromUrlInput): Promise<StoredMedia> {
    validateSourceUrl(input.sourceUrl)
    const maxSize = maxBytesFor(input.mediaType)
    const allowedTypes = allowedTypesFor(input.mediaType)

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), INGEST_TIMEOUT_MS)
    let res: Response
    try {
      res = await fetch(input.sourceUrl, { method: 'GET', redirect: 'follow', signal: controller.signal })
    } catch (err) {
      clearTimeout(timeoutId)
      if (err instanceof Error && (err.name === 'AbortError' || err.name === 'TimeoutError')) {
        throw new Error('下载来源资源超时')
      }
      throw new Error('下载来源资源失败（网络错误）')
    }
    clearTimeout(timeoutId)
    if (!res.ok) throw new Error(`下载来源资源失败（HTTP ${res.status}）`)

    const contentType = (res.headers.get('content-type') || '').split(';')[0].trim().toLowerCase()
    if (!contentType || !allowedTypes.has(contentType)) {
      throw new Error(`来源资源类型不支持（${contentType || '未知'}）`)
    }
    const declaredLength = res.headers.get('content-length')
    if (declaredLength && parseInt(declaredLength, 10) > maxSize) {
      throw new Error(`来源资源超过大小限制（${maxSize} 字节）`)
    }

    const ext = extFromContentType(contentType, input.mediaType)
    const objectKey = generateObjectKey(input.projectId, input.mediaType, ext, input.keyPrefix)
    const filePath = localStorageProviderResolveLocalPath(objectKey)!
    fs.mkdirSync(path.dirname(filePath), { recursive: true })

    const body = res.body
    if (!body) throw new Error('来源资源响应体为空')

    const writer = fs.createWriteStream(filePath)
    const hash = crypto.createHash('sha256')
    let totalSize = 0
    let sizeExceeded = false
    try {
      const reader = body.getReader()
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        if (value) {
          totalSize += value.byteLength
          if (totalSize > maxSize) { sizeExceeded = true; break }
          hash.update(value)
          writer.write(value)
        }
      }
      await new Promise<void>((resolve, reject) => { writer.end(() => resolve()); writer.on('error', reject) })
    } finally {
      try { await body.cancel() } catch { /* noop */ }
    }
    if (sizeExceeded) {
      try { fs.unlinkSync(filePath) } catch { /* noop */ }
      throw new Error(`来源资源超过大小限制（${maxSize} 字节）`)
    }
    return { provider: PROVIDER_NAME, objectKey, contentType, sizeBytes: totalSize, checksum: hash.digest('hex') }
  },

  async putObject(input: PutObjectInput): Promise<StoredMedia> {
    const maxSize = maxBytesFor(input.mediaType)
    const buf = Buffer.isBuffer(input.body) ? input.body : await streamToBuffer(input.body)
    if (buf.byteLength > maxSize) {
      throw new Error(`对象超过大小限制（${maxSize} 字节）`)
    }
    const contentType = input.contentType.split(';')[0].trim().toLowerCase()
    const ext = extFromContentType(contentType, input.mediaType)
    const objectKey = generateObjectKey(input.projectId, input.mediaType, ext, input.keyPrefix)
    const filePath = localStorageProviderResolveLocalPath(objectKey)!
    fs.mkdirSync(path.dirname(filePath), { recursive: true })
    fs.writeFileSync(filePath, buf)
    const hash = crypto.createHash('sha256').update(buf).digest('hex')
    return { provider: PROVIDER_NAME, objectKey, contentType, sizeBytes: buf.byteLength, checksum: hash }
  },

  async createReadUrl(input: CreateReadUrlInput): Promise<string> {
    // local: 返回静态服务路径，expiresInSeconds 不适用
    const safe = input.objectKey.replace(/\.\./g, '').replace(/^\/+/, '')
    return `/api/media/${safe}`
  },

  async deleteObject(objectKey: string): Promise<void> {
    const p = localStorageProviderResolveLocalPath(objectKey)
    if (!p) return
    try { if (fs.existsSync(p)) fs.unlinkSync(p) } catch { /* noop */ }
  },

  async exists(objectKey: string): Promise<boolean> {
    const p = localStorageProviderResolveLocalPath(objectKey)
    return !!p && fs.existsSync(p)
  },

  async getMetadata(objectKey: string): Promise<MediaObjectMetadata> {
    const p = localStorageProviderResolveLocalPath(objectKey)
    if (!p || !fs.existsSync(p)) {
      return { contentType: '', sizeBytes: 0, exists: false }
    }
    const stat = fs.statSync(p)
    const ext = objectKey.split('.').pop()?.toLowerCase() || ''
    const contentTypeMap: Record<string, string> = {
      jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif',
      mp4: 'video/mp4', mov: 'video/quicktime', webm: 'video/webm',
      json: 'application/json',
    }
    return {
      contentType: contentTypeMap[ext] || 'application/octet-stream',
      sizeBytes: stat.size,
      exists: true,
    }
  },
}

// local 专用：解析本地路径（供 /api/media 路由使用）
export const resolveLocalPath = localStorageProviderResolveLocalPath
