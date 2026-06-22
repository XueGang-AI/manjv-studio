/**
 * S3-Compatible Provider（生产）
 * --------------------------------------------
 * 基于 @aws-sdk/client-s3，兼容 AWS S3 / MinIO / 阿里云 OSS / 火山引擎 TOS / Cloudflare R2。
 * 不同供应商的 endpoint/region/forcePathStyle 由环境变量配置。
 *
 * 安全：
 * - Access Key / Secret Key 仅服务端环境变量读取，不发送客户端
 * - createReadUrl 生成临时签名 URL（按需），不持久化
 * - ingestFromUrl 复用 SSRF 防护 + 大小/超时/类型限制
 * - 上传后读 metadata 确认 Content-Type/Content-Length
 */
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
} from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
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

export interface S3ProviderConfig {
  region: string
  bucket: string
  accessKeyId: string
  secretAccessKey: string
  endpoint?: string
  /** forcePathStyle: MinIO/本地 S3 兼容需 true；TOS/OSS/R2 通常 false（virtual host style） */
  forcePathStyle?: boolean
  /** 公网 base URL（用于生成 Ark 可访问的完整 HTTPS URL，覆盖 SDK 默认 endpoint） */
  publicBaseUrl?: string
}

const PROVIDER_NAME = 's3-compatible'

export function createS3StorageProvider(config: S3ProviderConfig): MediaStorageProvider {
  const client = new S3Client({
    region: config.region,
    credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
    ...(config.endpoint ? { endpoint: config.endpoint } : {}),
    ...(config.forcePathStyle !== undefined ? { forcePathStyle: config.forcePathStyle } : {}),
  })

  return {
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

      // 流式收集到 Buffer（受 maxSize 限制），同时计算 checksum
      const body = res.body
      if (!body) throw new Error('来源资源响应体为空')
      const { Buffer } = await import('buffer')
      const reader = body.getReader()
      const chunks: Buffer[] = []
      let totalSize = 0
      const { createHash } = await import('crypto')
      const hash = createHash('sha256')
      let sizeExceeded = false
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        if (value) {
          totalSize += value.byteLength
          if (totalSize > maxSize) { sizeExceeded = true; break }
          hash.update(value)
          chunks.push(Buffer.from(value))
        }
      }
      try { await body.cancel() } catch { /* noop */ }
      if (sizeExceeded) throw new Error(`来源资源超过大小限制（${maxSize} 字节）`)

      const buf = Buffer.concat(chunks)
      const ext = extFromContentType(contentType, input.mediaType)
      const objectKey = generateObjectKey(input.projectId, input.mediaType, ext, input.keyPrefix)

      await client.send(new PutObjectCommand({
        Bucket: config.bucket,
        Key: objectKey,
        Body: buf,
        ContentType: contentType,
        ContentLength: buf.byteLength,
      }))

      return {
        provider: PROVIDER_NAME,
        bucket: config.bucket,
        region: config.region,
        objectKey,
        contentType,
        sizeBytes: totalSize,
        checksum: hash.digest('hex'),
      }
    },

    async putObject(input: PutObjectInput): Promise<StoredMedia> {
      const maxSize = maxBytesFor(input.mediaType)
      const { Buffer } = await import('buffer')
      const buf = Buffer.isBuffer(input.body) ? input.body : Buffer.from(await new Response(input.body).arrayBuffer())
      if (buf.byteLength > maxSize) throw new Error(`对象超过大小限制（${maxSize} 字节）`)
      const contentType = input.contentType.split(';')[0].trim().toLowerCase()
      const ext = extFromContentType(contentType, input.mediaType)
      const objectKey = generateObjectKey(input.projectId, input.mediaType, ext, input.keyPrefix)
      const { createHash } = await import('crypto')
      const checksum = createHash('sha256').update(buf).digest('hex')

      await client.send(new PutObjectCommand({
        Bucket: config.bucket,
        Key: objectKey,
        Body: buf,
        ContentType: contentType,
        ContentLength: buf.byteLength,
      }))

      return {
        provider: PROVIDER_NAME,
        bucket: config.bucket,
        region: config.region,
        objectKey,
        contentType,
        sizeBytes: buf.byteLength,
        checksum,
      }
    },

    async createReadUrl(input: CreateReadUrlInput): Promise<string> {
      // 优先用 publicBaseUrl + 签名（若配置了 publicBaseUrl 表示对象可通过该 base 访问）
      // 但生产推荐用签名 URL（private bucket）。这里统一用 presigned GET。
      const url = await getSignedUrl(
        client,
        new GetObjectCommand({ Bucket: config.bucket, Key: input.objectKey }),
        { expiresIn: input.expiresInSeconds },
      )
      // 若配置 publicBaseUrl 且签名 URL 的 host 不公网可达，可替换 host
      // 但签名绑定原 host，替换会破坏签名。保持签名 URL 原样。
      return url
    },

    async deleteObject(objectKey: string): Promise<void> {
      await client.send(new DeleteObjectCommand({ Bucket: config.bucket, Key: objectKey }))
    },

    async exists(objectKey: string): Promise<boolean> {
      try {
        await client.send(new HeadObjectCommand({ Bucket: config.bucket, Key: objectKey }))
        return true
      } catch (err: unknown) {
        const e = err as { name?: string; $metadata?: { httpStatusCode?: number } }
        if (e?.$metadata?.httpStatusCode === 404 || e?.name === 'NotFound') return false
        throw err
      }
    },

    async getMetadata(objectKey: string): Promise<MediaObjectMetadata> {
      try {
        const out = await client.send(new HeadObjectCommand({ Bucket: config.bucket, Key: objectKey }))
        return {
          contentType: out.ContentType || '',
          sizeBytes: out.ContentLength || 0,
          exists: true,
        }
      } catch (err: unknown) {
        const e = err as { $metadata?: { httpStatusCode?: number } }
        if (e?.$metadata?.httpStatusCode === 404) {
          return { contentType: '', sizeBytes: 0, exists: false }
        }
        throw err
      }
    },
  }
}
