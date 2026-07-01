/**
 * objectKey 生成（Phase 7）
 * --------------------------------------------
 * 对象键不使用用户原始文件名，避免冲突和路径问题。
 * 结构：projects/{projectId}/{images|videos|final_videos|release_packages}/{keyPrefix?}/{uuid}.{ext}
 */
import crypto from 'crypto'
import type { MediaType } from './types'

export function extFromContentType(contentType: string, mediaType: MediaType): string {
  const base = contentType.split(';')[0].trim().toLowerCase()
  const map: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/gif': 'gif',
    'video/mp4': 'mp4',
    'video/quicktime': 'mov',
    'video/webm': 'webm',
    'application/json': 'json',
  }
  if (map[base]) return map[base]
  if (mediaType === 'image') return 'jpg'
  if (mediaType === 'release_package') return 'json'
  return 'mp4'
}

function rootForMediaType(mediaType: MediaType): string {
  if (mediaType === 'image') return 'images'
  if (mediaType === 'final_video') return 'final_videos'
  if (mediaType === 'release_package') return 'release_packages'
  return 'videos'
}

export function generateObjectKey(
  projectId: string,
  mediaType: MediaType,
  ext: string,
  keyPrefix?: string,
): string {
  const uuid = crypto.randomBytes(8).toString('hex')
  const prefix = keyPrefix ? `${keyPrefix.replace(/^\/+|\/+$/g, '')}/` : ''
  return `projects/${projectId}/${rootForMediaType(mediaType)}/${prefix}${uuid}.${ext}`
}
