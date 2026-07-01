/**
 * MediaStorage 类型定义（Phase 7）
 * --------------------------------------------
 * 统一媒体存储抽象接口，支持 local（dev）与 s3-compatible（生产）Provider。
 */

export type MediaType = 'image' | 'video' | 'final_video' | 'release_package'

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
  /** 可选：带业务语义的子路径（如 episodes/{eid}/shots/{sid}） */
  keyPrefix?: string
  filename?: string
}

export interface PutObjectInput {
  /** 上传数据（Buffer 或 Web ReadableStream） */
  body: Buffer | ReadableStream<Uint8Array>
  projectId: string
  mediaType: MediaType
  contentType: string
  keyPrefix?: string
  filename?: string
}

export interface CreateReadUrlInput {
  objectKey: string
  /** 签名有效期（秒）。local provider 忽略。 */
  expiresInSeconds: number
}

export interface MediaObjectMetadata {
  contentType: string
  sizeBytes: number
  checksum?: string
  exists: boolean
}

export interface MediaStorageProvider {
  readonly name: string
  /** 从供应商 URL 下载并转存（SSRF 防护 + 大小/超时/类型限制） */
  ingestFromUrl(input: IngestFromUrlInput): Promise<StoredMedia>
  /** 直接上传 Buffer/Stream */
  putObject(input: PutObjectInput): Promise<StoredMedia>
  /** 生成可读取 URL（local: 稳定路径；s3: 临时签名 URL） */
  createReadUrl(input: CreateReadUrlInput): Promise<string>
  /** 删除对象 */
  deleteObject(objectKey: string): Promise<void>
  /** 对象是否存在 */
  exists(objectKey: string): Promise<boolean>
  /** 读取对象元数据 */
  getMetadata(objectKey: string): Promise<MediaObjectMetadata>
}

export const MAX_IMAGE_SIZE = 20 * 1024 * 1024 // 20MB
export const MAX_VIDEO_SIZE = 200 * 1024 * 1024 // 200MB
export const MAX_RELEASE_PACKAGE_SIZE = 10 * 1024 * 1024 // 10MB
export const INGEST_TIMEOUT_MS = 30000

export const ALLOWED_IMAGE_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
])

export const ALLOWED_VIDEO_TYPES = new Set([
  'video/mp4',
  'video/quicktime',
  'video/webm',
])

export const ALLOWED_RELEASE_PACKAGE_TYPES = new Set([
  'application/json',
])

export function maxBytesFor(mediaType: MediaType): number {
  if (mediaType === 'image') return MAX_IMAGE_SIZE
  if (mediaType === 'release_package') return MAX_RELEASE_PACKAGE_SIZE
  return MAX_VIDEO_SIZE
}

export function allowedTypesFor(mediaType: MediaType): Set<string> {
  if (mediaType === 'image') return ALLOWED_IMAGE_TYPES
  if (mediaType === 'release_package') return ALLOWED_RELEASE_PACKAGE_TYPES
  return ALLOWED_VIDEO_TYPES
}
