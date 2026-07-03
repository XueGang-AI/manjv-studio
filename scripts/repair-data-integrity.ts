/**
 * 本地数据完整性维护脚本
 * --------------------------------------------
 * 默认 dry-run，只读取数据库与本地 UPLOAD_DIR/media，不访问远端 OSS/S3，不输出签名 URL。
 * 只有显式传入 --apply --restore-missing-local-media 才会从数据库里的 legacy URL 下载缺失对象。
 *
 * 用法：
 *   npm run data:integrity
 *   npx tsx scripts/repair-data-integrity.ts --apply --delete-empty-duplicate-test-projects
 *   npx tsx scripts/repair-data-integrity.ts --apply --restore-missing-local-media --restore-limit=10
 */

import 'dotenv/config'

import fs from 'fs'
import path from 'path'
import { prisma } from '../src/lib/prisma'
import { UPLOAD_DIR } from '../src/server/services/ffmpeg-utils'
import { validateSourceUrl } from '../src/server/services/media-storage/security'
import { allowedTypesFor, maxBytesFor, type MediaType } from '../src/server/services/media-storage/types'
import {
  DEFAULT_SEED_PROJECT_NAME,
  DEFAULT_SEED_USER_ID,
  chooseRestoreSourceUrl,
  classifySeedProjectDuplicates,
  getSignedUrlExpiryStatus,
  inferMediaTypeForRecord,
  inspectLocalMediaObject,
  resolveSafeRestoreRedirectUrl,
  resolveLocalMediaPath,
  type ProjectContentCounts,
} from '../src/server/maintenance/data-integrity'

type Args = {
  apply: boolean
  dryRun: boolean
  deleteEmptyDuplicateTestProjects: boolean
  limit: number
  restoreMissingLocalMedia: boolean
  restoreLimit: number
}

type MediaRecord = {
  table: string
  field: string
  id: string
  projectId: string
  storageObjectKey: string
  storageProvider: string | null
  sourceUrl: string | null
  mediaType: MediaType
}

function parseArgs(): Args {
  const args = process.argv.slice(2)
  const apply = args.includes('--apply')
  const dryRun = args.includes('--dry-run')
  const deleteEmptyDuplicateTestProjects = args.includes('--delete-empty-duplicate-test-projects')
  const restoreMissingLocalMedia = args.includes('--restore-missing-local-media')
  const limitArg = args.find(arg => arg.startsWith('--limit='))
  const restoreLimitArg = args.find(arg => arg.startsWith('--restore-limit='))
  const parsedLimit = limitArg ? Number.parseInt(limitArg.slice('--limit='.length), 10) : 20
  const parsedRestoreLimit = restoreLimitArg ? Number.parseInt(restoreLimitArg.slice('--restore-limit='.length), 10) : 10
  if (apply && dryRun) {
    throw new Error('参数冲突：--apply 不能与 --dry-run 同时使用。写入操作请直接使用 npx tsx scripts/repair-data-integrity.ts --apply ...')
  }
  if (apply && !deleteEmptyDuplicateTestProjects && !restoreMissingLocalMedia) {
    throw new Error('参数不足：--apply 必须搭配明确动作，如 --delete-empty-duplicate-test-projects 或 --restore-missing-local-media')
  }

  return {
    apply,
    dryRun,
    deleteEmptyDuplicateTestProjects,
    limit: Number.isFinite(parsedLimit) && parsedLimit >= 0 ? parsedLimit : 20,
    restoreMissingLocalMedia,
    restoreLimit: Number.isFinite(parsedRestoreLimit) && parsedRestoreLimit > 0 ? parsedRestoreLimit : 10,
  }
}

async function auditSeedProjectDuplicates() {
  const projects = await prisma.project.findMany({
    where: { userId: DEFAULT_SEED_USER_ID, projectName: DEFAULT_SEED_PROJECT_NAME },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    select: {
      id: true,
      createdAt: true,
      _count: {
        select: {
          storyPackages: true,
          characters: true,
          characterImages: true,
          scenes: true,
          sceneImages: true,
          episodes: true,
          shots: true,
          imagePrompts: true,
          shotImages: true,
          videoPrompts: true,
          shotVideos: true,
          voiceScripts: true,
          finalVideos: true,
          generationTasks: true,
          projectVersions: true,
          qcReports: true,
          assetFiles: true,
        },
      },
    },
  })

  return classifySeedProjectDuplicates(projects.map(project => ({
    id: project.id,
    createdAt: project.createdAt,
    counts: project._count as ProjectContentCounts,
  })))
}

async function deleteEmptySeedProjectDuplicates(ids: string[]): Promise<number> {
  let deleted = 0

  for (const id of ids) {
    const result = await prisma.project.deleteMany({
      where: {
        id,
        userId: DEFAULT_SEED_USER_ID,
        projectName: DEFAULT_SEED_PROJECT_NAME,
        storyPackages: { none: {} },
        characters: { none: {} },
        characterImages: { none: {} },
        scenes: { none: {} },
        sceneImages: { none: {} },
        episodes: { none: {} },
        shots: { none: {} },
        imagePrompts: { none: {} },
        shotImages: { none: {} },
        videoPrompts: { none: {} },
        shotVideos: { none: {} },
        voiceScripts: { none: {} },
        finalVideos: { none: {} },
        generationTasks: { none: {} },
        projectVersions: { none: {} },
        qcReports: { none: {} },
        assetFiles: { none: {} },
      },
    })
    deleted += result.count
  }

  return deleted
}

async function collectMediaRecords(): Promise<MediaRecord[]> {
  const records: MediaRecord[] = []

  const characterImages = await prisma.characterImage.findMany({
    where: { storageObjectKey: { not: null } },
    select: { id: true, projectId: true, storageObjectKey: true, storageProvider: true, sourceUrl: true, imageUrl: true },
  })
  for (const record of characterImages) {
    if (record.storageObjectKey) records.push(toMediaRecord('character_images', 'storageObjectKey', record, record.sourceUrl, record.imageUrl))
  }

  const sceneImages = await prisma.sceneImage.findMany({
    where: { storageObjectKey: { not: null } },
    select: { id: true, projectId: true, storageObjectKey: true, storageProvider: true, sourceUrl: true, imageUrl: true },
  })
  for (const record of sceneImages) {
    if (record.storageObjectKey) records.push(toMediaRecord('scene_images', 'storageObjectKey', record, record.sourceUrl, record.imageUrl))
  }

  const shotImages = await prisma.shotImage.findMany({
    where: { storageObjectKey: { not: null } },
    select: { id: true, projectId: true, storageObjectKey: true, storageProvider: true, sourceUrl: true, imageUrl: true },
  })
  for (const record of shotImages) {
    if (record.storageObjectKey) records.push(toMediaRecord('shot_images', 'storageObjectKey', record, record.sourceUrl, record.imageUrl))
  }

  const shotVideos = await prisma.shotVideo.findMany({
    where: { storageObjectKey: { not: null } },
    select: { id: true, projectId: true, storageObjectKey: true, storageProvider: true, sourceVideoUrl: true, videoUrl: true },
  })
  for (const record of shotVideos) {
    if (record.storageObjectKey) records.push(toMediaRecord('shot_videos', 'storageObjectKey', record, record.sourceVideoUrl, record.videoUrl))
  }

  const finalVideos = await prisma.finalVideo.findMany({
    where: {
      OR: [
        { storageObjectKey: { not: null } },
        { assetPackageObjectKey: { not: null } },
      ],
    },
    select: {
      id: true,
      projectId: true,
      storageObjectKey: true,
      storageProvider: true,
      sourceVideoUrl: true,
      videoUrl: true,
      assetPackageObjectKey: true,
      assetPackageStorageProvider: true,
      assetPackageUrl: true,
    },
  })
  for (const record of finalVideos) {
    if (record.storageObjectKey) {
      records.push(toMediaRecord('final_videos', 'storageObjectKey', {
        id: record.id,
        projectId: record.projectId,
        storageObjectKey: record.storageObjectKey,
        storageProvider: record.storageProvider,
      }, record.sourceVideoUrl, record.videoUrl))
    }
    if (record.assetPackageObjectKey) {
      records.push(toMediaRecord('final_videos', 'assetPackageObjectKey', {
        id: record.id,
        projectId: record.projectId,
        storageObjectKey: record.assetPackageObjectKey,
        storageProvider: record.assetPackageStorageProvider,
      }, record.assetPackageUrl))
    }
  }

  return records
}

function toMediaRecord(
  table: string,
  field: string,
  record: { id: string; projectId: string; storageObjectKey: string; storageProvider: string | null },
  ...sourceUrls: Array<string | null | undefined>
): MediaRecord {
  const base = {
    table,
    field,
    storageObjectKey: record.storageObjectKey,
  }

  return {
    ...base,
    id: record.id,
    projectId: record.projectId,
    storageProvider: record.storageProvider,
    sourceUrl: chooseRestoreSourceUrl(...sourceUrls),
    mediaType: inferMediaTypeForRecord(base),
  }
}

function getMediaAudit(records: MediaRecord[]) {
  const missing: MediaRecord[] = []
  const invalid: MediaRecord[] = []
  let present = 0

  for (const record of records) {
    const state = inspectLocalMediaObject(UPLOAD_DIR, record.storageObjectKey).state
    if (state === 'present') present++
    if (state === 'missing') missing.push(record)
    if (state === 'invalid-key') invalid.push(record)
  }

  return { present, missing, invalid }
}

function printMediaAudit(records: MediaRecord[], limit: number) {
  const { present, missing, invalid } = getMediaAudit(records)
  const restorable = missing.filter(record => record.sourceUrl)
  const expirySummary = restorable.reduce<Record<string, number>>((summary, record) => {
    const status = getSignedUrlExpiryStatus(record.sourceUrl)
    summary[status] = (summary[status] || 0) + 1
    return summary
  }, {})

  console.log('[data-integrity] media object keys:', {
    total: records.length,
    presentLocalFiles: present,
    missingLocalFiles: missing.length,
    invalidObjectKeys: invalid.length,
    remoteProviderMissingLocalFiles: missing.filter(record => record.storageProvider && record.storageProvider !== 'local-fs').length,
    restorableFromLegacyUrl: restorable.length,
    legacyUrlExpiry: expirySummary,
  })

  for (const record of missing.slice(0, limit)) {
    console.log(`[data-integrity] missing local file: ${record.table}.${record.field} id=${shortId(record.id)} project=${shortId(record.projectId)} provider=${record.storageProvider || '-'} objectKey=${record.storageObjectKey}`)
  }
  for (const record of invalid.slice(0, limit)) {
    console.log(`[data-integrity] invalid object key: ${record.table}.${record.field} id=${shortId(record.id)} project=${shortId(record.projectId)} provider=${record.storageProvider || '-'} objectKey=${record.storageObjectKey}`)
  }
}

async function restoreMissingLocalMedia(records: MediaRecord[], restoreLimit: number): Promise<void> {
  const { missing } = getMediaAudit(records)
  const candidates = missing.filter(record => record.sourceUrl).slice(0, restoreLimit)
  let restored = 0
  let failed = 0

  console.log(`[data-integrity] restore candidates selected: ${candidates.length}`)
  for (const record of candidates) {
    try {
      await restoreOneMediaRecord(record)
      restored++
      console.log(`[data-integrity] restored: ${record.table}.${record.field} id=${shortId(record.id)} objectKey=${record.storageObjectKey}`)
    } catch (error) {
      failed++
      const reason = error instanceof Error ? error.message.slice(0, 120) : 'unknown'
      console.log(`[data-integrity] restore failed: ${record.table}.${record.field} id=${shortId(record.id)} objectKey=${record.storageObjectKey} reason=${reason}`)
    }
  }
  console.log('[data-integrity] restore result:', { selected: candidates.length, restored, failed })
}

async function restoreOneMediaRecord(record: MediaRecord): Promise<void> {
  if (!record.sourceUrl) throw new Error('缺少可恢复的远端 URL')
  validateSourceUrl(record.sourceUrl)

  const localPath = resolveLocalMediaPath(UPLOAD_DIR, record.storageObjectKey)
  if (!localPath) throw new Error('objectKey 非法')
  if (fs.existsSync(localPath)) return

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 30_000)
  let response: Response
  try {
    response = await fetchRestoreSource(record.sourceUrl, controller.signal)
  } catch (error) {
    clearTimeout(timeoutId)
    if (error instanceof Error && error.name === 'AbortError') throw new Error('下载超时')
    if (error instanceof Error) throw error
    throw new Error('下载失败')
  }
  clearTimeout(timeoutId)

  if (!response.ok) throw new Error(`远端返回 HTTP ${response.status}`)
  const contentType = (response.headers.get('content-type') || '').split(';')[0].trim().toLowerCase()
  if (!isAllowedRestoreContentType(record.mediaType, contentType)) {
    throw new Error(`资源类型不匹配: ${contentType || 'unknown'}`)
  }

  const maxBytes = maxBytesFor(record.mediaType)
  const contentLength = response.headers.get('content-length')
  if (contentLength && Number.parseInt(contentLength, 10) > maxBytes) {
    throw new Error(`资源超过大小限制: ${maxBytes}`)
  }
  if (!response.body) throw new Error('远端响应体为空')

  fs.mkdirSync(path.dirname(localPath), { recursive: true })
  const tempPath = `${localPath}.tmp-${process.pid}-${Date.now()}`
  const writer = fs.createWriteStream(tempPath, { flags: 'wx' })
  const reader = response.body.getReader()
  let totalBytes = 0

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      if (!value) continue

      totalBytes += value.byteLength
      if (totalBytes > maxBytes) throw new Error(`资源超过大小限制: ${maxBytes}`)
      await writeChunk(writer, value)
    }
    await new Promise<void>((resolve, reject) => {
      writer.end(() => resolve())
      writer.on('error', reject)
    })
    fs.renameSync(tempPath, localPath)
  } catch (error) {
    writer.destroy()
    try { fs.rmSync(tempPath, { force: true }) } catch { /* noop */ }
    throw error
  } finally {
    try { await reader.cancel() } catch { /* noop */ }
  }
}

async function fetchRestoreSource(sourceUrl: string, signal: AbortSignal, maxRedirects = 5): Promise<Response> {
  let currentUrl = sourceUrl

  for (let redirects = 0; redirects <= maxRedirects; redirects++) {
    validateSourceUrl(currentUrl)
    const response = await fetch(currentUrl, {
      method: 'GET',
      redirect: 'manual',
      signal,
    })

    if (![301, 302, 303, 307, 308].includes(response.status)) {
      return response
    }

    if (redirects === maxRedirects) throw new Error('重定向次数过多')
    currentUrl = resolveSafeRestoreRedirectUrl(currentUrl, response.headers.get('location'))
  }

  throw new Error('重定向次数过多')
}

async function writeChunk(writer: fs.WriteStream, value: Uint8Array): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    writer.write(value, error => {
      if (error) reject(error)
      else resolve()
    })
  })
}

function isAllowedRestoreContentType(mediaType: MediaType, contentType: string): boolean {
  if (contentType === 'application/octet-stream') return true
  return allowedTypesFor(mediaType).has(contentType)
}

function shortId(id: string): string {
  return id.length <= 8 ? id : id.slice(0, 8)
}

async function main() {
  const args = parseArgs()
  console.log(`[data-integrity] mode=${args.apply ? 'apply' : 'dry-run'} uploadDir=${UPLOAD_DIR}`)
  if (args.apply && args.restoreMissingLocalMedia) {
    console.log(`[data-integrity] remote restore enabled; at most ${args.restoreLimit} missing files will be downloaded`)
  } else {
    console.log('[data-integrity] no remote storage requests are made in this mode')
  }

  const duplicateAudit = await auditSeedProjectDuplicates()
  console.log('[data-integrity] seed test project duplicates:', duplicateAudit)

  if (args.apply && args.deleteEmptyDuplicateTestProjects) {
    const deleted = await deleteEmptySeedProjectDuplicates(duplicateAudit.emptyDuplicateIds)
    console.log(`[data-integrity] deleted empty duplicate seed projects: ${deleted}`)
  } else if (duplicateAudit.emptyDuplicateIds.length > 0) {
    console.log('[data-integrity] dry-run only; to delete empty duplicate seed projects run:')
    console.log('  npx tsx scripts/repair-data-integrity.ts --apply --delete-empty-duplicate-test-projects')
  }

  const mediaRecords = await collectMediaRecords()
  printMediaAudit(mediaRecords, args.limit)
  if (args.apply && args.restoreMissingLocalMedia) {
    await restoreMissingLocalMedia(mediaRecords, args.restoreLimit)
  } else if (getMediaAudit(mediaRecords).missing.some(record => record.sourceUrl)) {
    console.log('[data-integrity] dry-run only; to restore missing local files from legacy URLs run:')
    console.log('  npx tsx scripts/repair-data-integrity.ts --apply --restore-missing-local-media --restore-limit=10')
  }

  await prisma.$disconnect()
}

main().catch(async error => {
  console.error('[data-integrity] failed:', error instanceof Error ? error.message : error)
  await prisma.$disconnect()
  process.exit(1)
})
