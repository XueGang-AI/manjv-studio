import fs from 'fs'
import path from 'path'
import type { MediaType } from '@/server/services/media-storage/types'
import { validateSourceUrl } from '@/server/services/media-storage/security'

export const DEFAULT_SEED_USER_ID = '00000000-0000-0000-0000-000000000001'
export const DEFAULT_SEED_PROJECT_NAME = '雨夜重生（测试项目）'

export type ProjectContentCountKey =
  | 'storyPackages'
  | 'characters'
  | 'characterImages'
  | 'scenes'
  | 'sceneImages'
  | 'episodes'
  | 'shots'
  | 'imagePrompts'
  | 'shotImages'
  | 'videoPrompts'
  | 'shotVideos'
  | 'voiceScripts'
  | 'finalVideos'
  | 'generationTasks'
  | 'projectVersions'
  | 'qcReports'
  | 'assetFiles'

export type ProjectContentCounts = Record<ProjectContentCountKey, number>

export type SeedProjectAuditRecord = {
  id: string
  createdAt: Date | string
  counts: ProjectContentCounts
}

export type SeedProjectDuplicateAudit = {
  total: number
  keeperId: string | null
  duplicateIds: string[]
  emptyDuplicateIds: string[]
  nonEmptyDuplicates: Array<{ id: string; totalContentCount: number }>
}

const PROJECT_CONTENT_COUNT_KEYS: ProjectContentCountKey[] = [
  'storyPackages',
  'characters',
  'characterImages',
  'scenes',
  'sceneImages',
  'episodes',
  'shots',
  'imagePrompts',
  'shotImages',
  'videoPrompts',
  'shotVideos',
  'voiceScripts',
  'finalVideos',
  'generationTasks',
  'projectVersions',
  'qcReports',
  'assetFiles',
]

export function totalProjectContentCount(counts: ProjectContentCounts): number {
  return PROJECT_CONTENT_COUNT_KEYS.reduce((sum, key) => sum + (counts[key] || 0), 0)
}

export function classifySeedProjectDuplicates(projects: SeedProjectAuditRecord[]): SeedProjectDuplicateAudit {
  const sorted = [...projects].sort((a, b) => {
    const aTime = new Date(a.createdAt).getTime()
    const bTime = new Date(b.createdAt).getTime()
    if (aTime !== bTime) return aTime - bTime
    return a.id.localeCompare(b.id)
  })

  const keeper = sorted[0] || null
  const duplicates = keeper ? sorted.slice(1) : []

  return {
    total: sorted.length,
    keeperId: keeper?.id || null,
    duplicateIds: duplicates.map(project => project.id),
    emptyDuplicateIds: duplicates
      .filter(project => totalProjectContentCount(project.counts) === 0)
      .map(project => project.id),
    nonEmptyDuplicates: duplicates
      .map(project => ({ id: project.id, totalContentCount: totalProjectContentCount(project.counts) }))
      .filter(project => project.totalContentCount > 0),
  }
}

export type LocalMediaAudit =
  | { state: 'present'; path: string }
  | { state: 'missing'; path: string }
  | { state: 'invalid-key'; path: null }

export function inspectLocalMediaObject(
  uploadDir: string,
  objectKey: string,
  existsSync: (path: string) => boolean = fs.existsSync,
): LocalMediaAudit {
  const localPath = resolveLocalMediaPath(uploadDir, objectKey)
  if (!localPath) return { state: 'invalid-key', path: null }

  return existsSync(localPath)
    ? { state: 'present', path: localPath }
    : { state: 'missing', path: localPath }
}

export type MediaRecordSource = {
  table: string
  field: string
  storageObjectKey: string
}

export function inferMediaTypeForRecord(record: MediaRecordSource): MediaType {
  if (record.field === 'assetPackageObjectKey' || record.storageObjectKey.toLowerCase().endsWith('.json')) {
    return 'release_package'
  }
  if (record.table === 'final_videos') return 'final_video'
  if (record.table === 'shot_videos') return 'video'
  return 'image'
}

export function chooseRestoreSourceUrl(...urls: Array<string | null | undefined>): string | null {
  for (const url of urls) {
    if (isSafeRemoteRestoreUrl(url)) return url
  }
  return null
}

export function resolveSafeRestoreRedirectUrl(currentUrl: string, location: string | null): string {
  if (!location || /[\x00-\x1f\x7f\r\n]/.test(location)) {
    throw new Error('重定向地址无效')
  }

  let nextUrl: URL
  try {
    nextUrl = new URL(location, currentUrl)
  } catch {
    throw new Error('重定向地址格式无效')
  }

  validateSourceUrl(nextUrl.href)
  return nextUrl.href
}

export function isSafeRemoteRestoreUrl(url: string | null | undefined): url is string {
  if (!url || /[\x00-\x1f\x7f\r\n]/.test(url)) return false

  try {
    validateSourceUrl(url)
    return true
  } catch {
    return false
  }
}

export type SignedUrlExpiryStatus = 'not-signed-url' | 'active' | 'expiring-soon' | 'expired' | 'invalid-date'

export function getSignedUrlExpiryStatus(
  rawUrl: string | null | undefined,
  now: Date = new Date(),
  expiringSoonMs = 6 * 60 * 60 * 1000,
): SignedUrlExpiryStatus {
  if (!rawUrl) return 'not-signed-url'

  let parsed: URL
  try {
    parsed = new URL(rawUrl)
  } catch {
    return 'not-signed-url'
  }

  const date = parsed.searchParams.get('x-oss-date') || parsed.searchParams.get('X-Amz-Date')
  const expires = parsed.searchParams.get('x-oss-expires') || parsed.searchParams.get('X-Amz-Expires')
  if (!date || !expires) return 'not-signed-url'

  const signedAt = parseSignedUrlDate(date)
  const expiresSeconds = Number.parseInt(expires, 10)
  if (!signedAt || !Number.isFinite(expiresSeconds)) return 'invalid-date'

  const expiresAtMs = signedAt.getTime() + expiresSeconds * 1000
  const remainingMs = expiresAtMs - now.getTime()
  if (remainingMs <= 0) return 'expired'
  if (remainingMs <= expiringSoonMs) return 'expiring-soon'
  return 'active'
}

function parseSignedUrlDate(value: string): Date | null {
  const match = value.match(/^(\d{8})T(\d{6})Z$/)
  if (!match) return null

  const [, datePart, timePart] = match
  const year = Number.parseInt(datePart.slice(0, 4), 10)
  const month = Number.parseInt(datePart.slice(4, 6), 10) - 1
  const day = Number.parseInt(datePart.slice(6, 8), 10)
  const hour = Number.parseInt(timePart.slice(0, 2), 10)
  const minute = Number.parseInt(timePart.slice(2, 4), 10)
  const second = Number.parseInt(timePart.slice(4, 6), 10)

  const parsed = new Date(Date.UTC(year, month, day, hour, minute, second))
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

export function resolveLocalMediaPath(uploadDir: string, objectKey: string): string | null {
  const mediaRoot = path.resolve(uploadDir, 'media')
  const normalizedKey = objectKey.replace(/^\/+/, '')
  const filePath = path.resolve(mediaRoot, normalizedKey)

  if (!isPathInside(mediaRoot, filePath)) return null
  return filePath
}

function isPathInside(root: string, target: string): boolean {
  const relative = path.relative(root, target)
  return relative === '' || (!!relative && !relative.startsWith('..') && !path.isAbsolute(relative))
}
