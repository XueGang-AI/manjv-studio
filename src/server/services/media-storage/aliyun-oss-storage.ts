/**
 * Aliyun OSS Provider（Phase 8）
 * --------------------------------------------
 * 基于官方 ali-oss SDK，使用 V4 签名。
 * 实现 MediaStorageProvider 统一接口，不建立第二套媒体存储接口。
 *
 * Client 初始化：
 * - authorizationV4: true（禁用 V1）
 * - region/bucket/secure 配置化
 * - 上传 Client：按 OSS_USE_INTERNAL_ENDPOINT 选择 endpoint（内网仅阿里云杭州同地域后端）
 * - 签名 Client：永远用公网 endpoint（返回浏览器/Ark 的 URL 必须公网可达）
 *
 * 安全：
 * - 凭证仅服务端环境变量，不发送客户端
 * - 签名 URL 只在 API 返回/模型调用前动态生成，不写 DB/日志
 * - 错误响应脱敏，不含完整签名 URL
 * - 不把 internal endpoint 返回客户端
 */

import OSS from 'ali-oss'
import fs from 'fs'
import path from 'path'
import os from 'os'
import crypto from 'crypto'
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
import {
  type AliyunOssConfig,
  OSS_PROVIDER_NAME,
  readAliyunOssConfig,
} from './aliyun-oss-config'

/** 分片上传阈值（>16MB 用 multipartUpload） */
const MULTIPART_THRESHOLD = 16 * 1024 * 1024
/** 临时文件目录前缀 */
const TEMP_PREFIX = 'manjv-oss-ingest-'

/** 创建 OSS Client（上传用，按 useInternalEndpoint 选择 endpoint） */
function createUploadClient(config: AliyunOssConfig): OSS {
  const endpoint = config.useInternalEndpoint && config.internalEndpoint
    ? config.internalEndpoint
    : config.publicEndpoint
  return new OSS({
    authorizationV4: true,
    region: config.region,
    bucket: config.bucket,
    accessKeyId: config.accessKeyId,
    accessKeySecret: config.accessKeySecret,
    endpoint,
    secure: true,
  })
}

/** 创建 OSS Client（签名读取用，永远公网 endpoint） */
function createSignClient(config: AliyunOssConfig): OSS {
  return new OSS({
    authorizationV4: true,
    region: config.region,
    bucket: config.bucket,
    accessKeyId: config.accessKeyId,
    accessKeySecret: config.accessKeySecret,
    endpoint: config.publicEndpoint,
    secure: true,
  })
}

/** 将 Web ReadableStream 写入临时文件，返回路径与大小+checksum */
async function streamToTempFile(
  stream: ReadableStream<Uint8Array>,
  maxBytes: number,
): Promise<{ filePath: string; size: number; checksum: string }> {
  const tmpDir = os.tmpdir()
  const tmpPath = path.join(tmpDir, `${TEMP_PREFIX}${crypto.randomBytes(8).toString('hex')}`)
  const writer = fs.createWriteStream(tmpPath)
  const hash = crypto.createHash('sha256')
  let total = 0
  let exceeded = false
  const reader = stream.getReader()
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      if (value) {
        total += value.byteLength
        if (total > maxBytes) { exceeded = true; break }
        hash.update(value)
        writer.write(value)
      }
    }
    await new Promise<void>((resolve, reject) => { writer.end(() => resolve()); writer.on('error', reject) })
  } finally {
    try { await stream.cancel() } catch { /* noop */ }
  }
  if (exceeded) {
    try { fs.unlinkSync(tmpPath) } catch { /* noop */ }
    throw new Error(`来源资源超过大小限制（${maxBytes} 字节）`)
  }
  return { filePath: tmpPath, size: total, checksum: hash.digest('hex') }
}

/** 上传文件到 OSS（小文件 put / 大文件 multipartUpload） */
async function uploadFile(
  client: OSS,
  bucket: string,
  objectKey: string,
  filePath: string,
  contentType: string,
): Promise<void> {
  const stat = fs.statSync(filePath)
  const headers = {
    'Content-Type': contentType,
    'Cache-Control': 'public, max-age=86400',
    'Content-Disposition': 'inline',
  }
  try {
    if (stat.size > MULTIPART_THRESHOLD) {
      // 大文件：分片上传
      await client.multipartUpload(objectKey, filePath, {
        headers,
        partSize: 5 * 1024 * 1024, // 5MB 分片
        timeout: 600000, // 10 分钟
      })
    } else {
      // 小文件：直接 put
      await client.put(objectKey, filePath, { headers })
    }
  } catch (err) {
    // 分片上传失败时中止（避免残留分片计费）
    const e = err as { name?: string }
    if (e?.name === 'abortMultipartUpload' || stat.size > MULTIPART_THRESHOLD) {
      try { await (client as unknown as { abortMultipartUpload?: (name: string, uploadId: string) => Promise<unknown> }).abortMultipartUpload?.(objectKey, '') } catch { /* noop */ }
    }
    throw err
  }
}

export function createAliyunOssStorageProvider(config?: AliyunOssConfig): MediaStorageProvider {
  const resolvedConfig = config ?? readAliyunOssConfig()
  const uploadClient = createUploadClient(resolvedConfig)
  const signClient = createSignClient(resolvedConfig)

  return {
    name: OSS_PROVIDER_NAME,

    async ingestFromUrl(input: IngestFromUrlInput): Promise<StoredMedia> {
      validateSourceUrl(input.sourceUrl)
      const maxBytes = maxBytesFor(input.mediaType)
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
      if (declaredLength && parseInt(declaredLength, 10) > maxBytes) {
        throw new Error(`来源资源超过大小限制（${maxBytes} 字节）`)
      }

      const body = res.body
      if (!body) throw new Error('来源资源响应体为空')

      // 流式写入临时文件（不读入内存），受 maxBytes 限制
      const { filePath, size, checksum } = await streamToTempFile(body, maxBytes)
      const ext = extFromContentType(contentType, input.mediaType)
      const objectKey = generateObjectKey(input.projectId, input.mediaType, ext, input.keyPrefix)

      try {
        await uploadFile(uploadClient, resolvedConfig.bucket, objectKey, filePath, contentType)
      } finally {
        // 成功/失败都清理临时文件
        try { fs.unlinkSync(filePath) } catch { /* noop */ }
      }

      return {
        provider: OSS_PROVIDER_NAME,
        bucket: resolvedConfig.bucket,
        region: resolvedConfig.region,
        objectKey,
        contentType,
        sizeBytes: size,
        checksum,
      }
    },

    async putObject(input: PutObjectInput): Promise<StoredMedia> {
      const maxBytes = maxBytesFor(input.mediaType)
      const contentType = input.contentType.split(';')[0].trim().toLowerCase()
      const ext = extFromContentType(contentType, input.mediaType)
      const objectKey = generateObjectKey(input.projectId, input.mediaType, ext, input.keyPrefix)

      // Buffer 直接上传
      if (Buffer.isBuffer(input.body)) {
        if (input.body.byteLength > maxBytes) throw new Error(`对象超过大小限制（${maxBytes} 字节）`)
        const checksum = crypto.createHash('sha256').update(input.body).digest('hex')
        await uploadClient.put(objectKey, input.body, {
          headers: {
            'Content-Type': contentType,
            'Cache-Control': 'public, max-age=86400',
            'Content-Disposition': 'inline',
          },
        })
        return {
          provider: OSS_PROVIDER_NAME,
          bucket: resolvedConfig.bucket,
          region: resolvedConfig.region,
          objectKey,
          contentType,
          sizeBytes: input.body.byteLength,
          checksum,
        }
      }

      // Web ReadableStream → 临时文件 → 上传
      const { filePath, size, checksum } = await streamToTempFile(input.body, maxBytes)
      try {
        await uploadFile(uploadClient, resolvedConfig.bucket, objectKey, filePath, contentType)
      } finally {
        try { fs.unlinkSync(filePath) } catch { /* noop */ }
      }
      return {
        provider: OSS_PROVIDER_NAME,
        bucket: resolvedConfig.bucket,
        region: resolvedConfig.region,
        objectKey,
        contentType,
        sizeBytes: size,
        checksum,
      }
    },

    async createReadUrl(input: CreateReadUrlInput): Promise<string> {
      // 签名读取永远用公网 endpoint（signClient）
      // 使用阿里云 OSS V4 签名 API
      const expiresInSeconds = Math.min(
        Math.max(input.expiresInSeconds, 300),
        7 * 24 * 60 * 60,
      )
      const url = await signClient.signatureUrlV4(
        'GET',
        expiresInSeconds,
        { headers: {} },
        input.objectKey,
      )
      return url
    },

    async deleteObject(objectKey: string): Promise<void> {
      await uploadClient.delete(objectKey)
    },

    async exists(objectKey: string): Promise<boolean> {
      try {
        await uploadClient.head(objectKey)
        return true
      } catch (err: unknown) {
        const e = err as { status?: number; code?: string; name?: string }
        if (e?.status === 404 || e?.code === 'NoSuchKey' || e?.name === 'NoSuchKeyError') return false
        throw err
      }
    },

    async getMetadata(objectKey: string): Promise<MediaObjectMetadata> {
      try {
        const head = await uploadClient.head(objectKey)
        const headers = (head?.res?.headers ?? {}) as Record<string, string>
        return {
          contentType: headers['content-type'] || '',
          sizeBytes: parseInt(headers['content-length'] || '0', 10) || 0,
          exists: true,
        }
      } catch (err: unknown) {
        const e = err as { status?: number; code?: string }
        if (e?.status === 404 || e?.code === 'NoSuchKey') {
          return { contentType: '', sizeBytes: 0, exists: false }
        }
        throw err
      }
    },
  }
}
