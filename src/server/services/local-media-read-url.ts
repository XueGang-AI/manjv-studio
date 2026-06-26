import path from 'path'
import { UPLOAD_DIR, isPathInside } from './ffmpeg-utils'

const URL_SAFE_PROTOCOLS = /^(https?:|data:|blob:)/i

export function contentTypeForLocalMedia(filePath: string): string {
  const ext = path.extname(filePath).slice(1).toLowerCase()
  const map: Record<string, string> = {
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    webp: 'image/webp',
    gif: 'image/gif',
    mp4: 'video/mp4',
    mov: 'video/quicktime',
    webm: 'video/webm',
  }
  return map[ext] || 'application/octet-stream'
}

export function resolveUploadRelativePath(rawUrl: string | null | undefined): string | null {
  if (!rawUrl || URL_SAFE_PROTOCOLS.test(rawUrl) || rawUrl.startsWith('/api/')) return null

  const uploadsRoot = path.resolve(UPLOAD_DIR)
  const normalized = rawUrl.replace(/\\/g, '/')
  const uploadPrefixMatch = normalized.match(/^\/?\.?\/?uploads\/(.+)$/)
  if (uploadPrefixMatch?.[1]) {
    const relativePath = uploadPrefixMatch[1]
    const resolved = path.resolve(uploadsRoot, relativePath)
    if (isPathInside(uploadsRoot, resolved)) {
      return path.relative(uploadsRoot, resolved).split(path.sep).join('/')
    }
    return null
  }

  const resolved = path.resolve(rawUrl)
  if (!isPathInside(uploadsRoot, resolved)) return null

  return path.relative(uploadsRoot, resolved).split(path.sep).join('/')
}

export function toLocalMediaReadUrl(rawUrl: string | null | undefined): string | null {
  if (!rawUrl) return null
  if (URL_SAFE_PROTOCOLS.test(rawUrl) || rawUrl.startsWith('/api/')) return rawUrl

  const relativePath = resolveUploadRelativePath(rawUrl)
  if (!relativePath) return rawUrl

  return `/api/local-media/${relativePath.split('/').map(encodeURIComponent).join('/')}`
}

export function resolveLocalMediaPath(segments: string[]): string | null {
  if (!segments.length || segments.some(segment => segment.includes('\0'))) return null

  const uploadsRoot = path.resolve(UPLOAD_DIR)
  const filePath = path.resolve(uploadsRoot, ...segments)
  if (!isPathInside(uploadsRoot, filePath)) return null

  return filePath
}
