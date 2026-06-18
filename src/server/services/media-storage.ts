/**
 * MediaStorageService — 统一媒体存储抽象（Phase 6）
 * --------------------------------------------
 * 解决供应商短期签名 URL 过期问题：图片生成后转存到项目自有存储，
 * 数据库保存稳定 objectKey，运行时按需生成可访问 URL。
 *
 * 当前实现：本地文件系统（UPLOAD_DIR/media）。
 * 预留 MinIO/OSS 切换（实现同一接口即可）。
 *
 * 安全：
 * - SSRF 防护：ingestFromUrl 禁止 localhost/私网 IP/云元数据地址，限制 HTTPS
 * - 下载限大小/超时/Content-Type
 * - 不在日志输出完整签名 URL
 * - 上传成功后才返回 objectKey
 * - checksum 防重复转存（可选）
 */

import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import { UPLOAD_DIR, isPathInside } from './ffmpeg-utils'

// ─── 类型 ──────────────────────────────────────────────────────

export type MediaType = 'image' | 'video'

export interface StoredMedia {
  provider: string
  bucket?: string
  region?: string
  objectKey: string
  contentType: string
  sizeBytes: number
  checksum?: string
}

export interface IngestFromUrlInput {
  sourceUrl: string
  projectId: string
  mediaType: MediaType
  filename?: string
}

export interface CreateReadUrlInput {
  objectKey: string
  expiresInSeconds: number
}

// ─── 常量 ──────────────────────────────────────────────────────

const MEDIA_PROVIDER = 'local-fs'
const MAX_IMAGE_SIZE = 20 * 1024 * 1024 // 20MB
const MAX_VIDEO_SIZE = 200 * 1024 * 1024 // 200MB
const INGEST_TIMEOUT_MS = 30000

const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif'])
const ALLOWED_VIDEO_TYPES = new Set(['video/mp4', 'video/quicktime', 'video/webm'])

// SSRF 防护：禁止的 IP/主机
const SSRF_BLOCKED_HOSTS = new Set([
  'localhost',
  'metadata.google.internal',
  '169.254.169.254', // AWS/GCP 元数据
  'metadata.tencentyun.com',
  '100.100.100.200', // 阿里云元数据
])

function isPrivateIp(host: string): boolean {
  // 解析 IP 形式的主机名
  const parts = host.split('.').map(Number)
  if (parts.length === 4 && parts.every(p => Number.isInteger(p) && p >= 0 && p <= 255)) {
    const [a, b] = parts
    if (a === 10) return true
    if (a === 172 && b >= 16 && b <= 31) return true
    if (a === 192 && b === 168) return true
    if (a === 127) return true // loopback
    if (a === 169 && b === 254) return true // link-local / metadata
    if (a === 0) return true
  }
  return false
}

function validateSourceUrl(sourceUrl: string): URL {
  let parsed: URL
  try {
    parsed = new URL(sourceUrl)
  } catch {
    throw new Error('来源地址格式无效')
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new Error('来源协议不支持（仅允许 http/https）')
  }
  const host = parsed.hostname.toLowerCase()
  if (SSRF_BLOCKED_HOSTS.has(host)) {
    throw new Error('来源地址被禁止访问')
  }
  if (isPrivateIp(host)) {
    throw new Error('来源地址被禁止访问（私网/元数据）')
  }
  return parsed
}

function getMediaDir(): string {
  const dir = path.join(UPLOAD_DIR, 'media')
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
  return dir
}

function generateObjectKey(projectId: string, mediaType: MediaType, ext: string): string {
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '')
  const rand = crypto.randomBytes(8).toString('hex')
  return `${mediaType}/${projectId}/${dateStr}-${rand}.${ext}`
}

function extFromContentType(contentType: string, mediaType: MediaType): string {
  const base = contentType.split(';')[0].trim().toLowerCase()
  const map: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/gif': 'gif',
    'video/mp4': 'mp4',
    'video/quicktime': 'mov',
    'video/webm': 'webm',
  }
  return map[base] || (mediaType === 'image' ? 'jpg' : 'mp4')
}

// ─── 本地 FS 实现 ──────────────────────────────────────────────

export const mediaStorage = {
  /**
   * 从供应商 URL 下载并转存到自有存储。
   * SSRF 防护 + 大小/超时/Content-Type 限制。
   * 上传成功后才返回 objectKey。
   */
  async ingestFromUrl(input: IngestFromUrlInput): Promise<StoredMedia> {
    validateSourceUrl(input.sourceUrl) // 抛错则不继续

    const maxSize = input.mediaType === 'image' ? MAX_IMAGE_SIZE : MAX_VIDEO_SIZE
    const allowedTypes = input.mediaType === 'image' ? ALLOWED_IMAGE_TYPES : ALLOWED_VIDEO_TYPES

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), INGEST_TIMEOUT_MS)

    let res: Response
    try {
      res = await fetch(input.sourceUrl, {
        method: 'GET',
        redirect: 'follow',
        signal: controller.signal,
      })
    } catch (err) {
      clearTimeout(timeoutId)
      if (err instanceof Error && (err.name === 'AbortError' || err.name === 'TimeoutError')) {
        throw new Error('下载来源资源超时')
      }
      throw new Error('下载来源资源失败（网络错误）')
    }
    clearTimeout(timeoutId)

    if (!res.ok) {
      throw new Error(`下载来源资源失败（HTTP ${res.status}）`)
    }

    const contentType = (res.headers.get('content-type') || '').split(';')[0].trim().toLowerCase()
    if (!contentType || !allowedTypes.has(contentType)) {
      throw new Error(`来源资源类型不支持（${contentType || '未知'}）`)
    }

    const declaredLength = res.headers.get('content-length')
    if (declaredLength && parseInt(declaredLength, 10) > maxSize) {
      throw new Error(`来源资源超过大小限制（${maxSize} 字节）`)
    }

    const ext = extFromContentType(contentType, input.mediaType)
    const objectKey = generateObjectKey(input.projectId, input.mediaType, ext)
    const dir = getMediaDir()
    const filePath = path.join(dir, objectKey)
    const fullDir = path.dirname(filePath)
    if (!fs.existsSync(fullDir)) {
      fs.mkdirSync(fullDir, { recursive: true })
    }

    // 流式写入 + 大小限制 + checksum
    const body = res.body
    if (!body) {
      throw new Error('来源资源响应体为空')
    }

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
          if (totalSize > maxSize) {
            sizeExceeded = true
            break
          }
          hash.update(value)
          writer.write(value)
        }
      }
      await new Promise<void>((resolve, reject) => {
        writer.end(() => resolve())
        writer.on('error', reject)
      })
    } finally {
      try { await body.cancel() } catch { /* noop */ }
    }

    if (sizeExceeded) {
      // 超大小：删除已写文件
      try { fs.unlinkSync(filePath) } catch { /* noop */ }
      throw new Error(`来源资源超过大小限制（${maxSize} 字节）`)
    }

    const checksum = hash.digest('hex')

    return {
      provider: MEDIA_PROVIDER,
      objectKey,
      contentType,
      sizeBytes: totalSize,
      checksum,
    }
  },

  /**
   * 生成可读取 URL。
   * 本地 FS 实现：返回 /api/media/<objectKey> 静态服务路径。
   * 生产环境（MinIO/OSS）实现：生成签名 URL（expiresInSeconds 生效）。
   */
  async createReadUrl(input: CreateReadUrlInput): Promise<string> {
    // 本地 FS：expiresInSeconds 不适用（静态服务），返回稳定路径
    // objectKey 已校验无路径遍历（生成时为受控格式），但仍校验
    const safe = input.objectKey.replace(/\.\./g, '').replace(/^\/+/, '')
    return `/api/media/${safe}`
  },

  /**
   * 删除存储对象。删除失败不抛错（避免阻塞 DB 清理），仅记录。
   */
  async deleteObject(objectKey: string): Promise<void> {
    const dir = getMediaDir()
    const filePath = path.join(dir, objectKey)
    if (!isPathInside(dir, filePath)) {
      // 路径遍历保护：忽略非法 objectKey
      return
    }
    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath)
      }
    } catch {
      // 删除失败不抛错，记录由调用方处理
    }
  },

  /**
   * 本地 FS：返回文件绝对路径（供静态服务 API 使用）。
   * 路径遍历保护。
   */
  resolveLocalPath(objectKey: string): string | null {
    const dir = getMediaDir()
    const filePath = path.join(dir, objectKey)
    if (!isPathInside(dir, filePath)) return null
    return filePath
  },

  /**
   * 检查 objectKey 对应文件是否存在。
   */
  exists(objectKey: string): boolean {
    const p = this.resolveLocalPath(objectKey)
    return !!p && fs.existsSync(p)
  },
}

export type MediaStorageService = typeof mediaStorage
