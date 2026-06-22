/**
 * ShotVideo 候选保留与清理策略（Phase 6/7）
 * --------------------------------------------
 * 候选版本模式会累积 ShotVideo 记录。本模块提供安全的清理函数，
 * 不在 regenerate 中隐式执行（用户生成时不同步清理）。
 *
 * 保留策略：
 * 1. selected 视频永久保留
 * 2. confirmed 视频永久保留
 * 3. 当前 running/queued 视频保留
 * 4. 最近 N 个成功候选保留（KEEP_RECENT_SUCCESS）
 * 5. failed 候选保留一段时间用于审计（KEEP_FAILED_DAYS）
 * 6. 用户明确删除时才立即删除对应候选
 *
 * 孤儿文件防护（Phase 7 修正）：
 * - 存储删除成功后才删除 DB 记录
 * - 存储删除失败 → 保留 DB 记录，记录失败，等待后台重试
 * - 不让 DB 删除与存储删除失去追踪关系
 * - 不在日志输出完整签名 URL
 *
 * 清理由后台任务或手动触发，不在用户生成路径同步执行。
 */

import prisma from '@/lib/prisma'
import { mediaStorage } from './media-storage'

const KEEP_RECENT_SUCCESS = 3
const KEEP_FAILED_DAYS = 7

const TERMINAL_SUCCESS = new Set(['completed', 'succeeded', 'success', 'done'])
const TERMINAL_FAILED = new Set(['failed', 'error', 'timeout'])
const INFLIGHT = new Set(['queued', 'pending', 'waiting', 'processing', 'running', 'in_progress', 'generating'])

export interface CleanupResult {
  shotId: string
  deletedCount: number
  /** 存储删除失败：DB 记录保留待重试（对象 ID 列表） */
  storageDeleteFailures: number
  /** 待重试的 ShotVideo ID（存储删除失败） */
  pendingRetryIds: string[]
  /** 存储侧已不存在（404），视为已删，DB 已删 */
  alreadyMissingIds: string[]
  /** 失败详情 */
  failed: Array<{ id: string; reason: string }>
}

/**
 * 清理单个 shot 的可回收候选。
 * 存储删除成功 → 删 DB；存储侧 404 → 视为已删，删 DB（alreadyMissing）；
 * 存储删除失败（非 404）→ 保留 DB 记录，加入 pendingRetryIds 待后台重试。
 */
export async function cleanupShotVideoCandidates(shotId: string): Promise<CleanupResult> {
  const result: CleanupResult = {
    shotId, deletedCount: 0, storageDeleteFailures: 0,
    pendingRetryIds: [], alreadyMissingIds: [], failed: [],
  }

  const videos = await prisma.shotVideo.findMany({
    where: { shotId },
    orderBy: { createdAt: 'desc' },
  })

  const now = Date.now()
  const failedCutoff = now - KEEP_FAILED_DAYS * 24 * 60 * 60 * 1000

  let successKept = 0
  const toDelete: string[] = []

  for (const v of videos) {
    const status = (v.remoteStatus || '').toLowerCase()
    if (v.isSelected || v.isConfirmed) continue
    if (INFLIGHT.has(status)) continue
    if (TERMINAL_SUCCESS.has(status)) {
      successKept++
      if (successKept > KEEP_RECENT_SUCCESS) toDelete.push(v.id)
    } else if (TERMINAL_FAILED.has(status)) {
      if (v.createdAt.getTime() < failedCutoff) toDelete.push(v.id)
    }
  }

  for (const id of toDelete) {
    const v = videos.find(x => x.id === id)
    // 有 storageObjectKey 的：先删存储，成功或 404 才删 DB（孤儿文件防护）
    if (v?.storageObjectKey) {
      try {
        await mediaStorage.deleteObject(v.storageObjectKey)
      } catch (err: unknown) {
        const e = err as { name?: string; $metadata?: { httpStatusCode?: number }; message?: string }
        const isMissing =
          e?.$metadata?.httpStatusCode === 404 ||
          e?.name === 'NotFound' ||
          e?.name === 'NoSuchKey' ||
          (typeof e?.message === 'string' && /not found|no such/i.test(e.message))
        if (isMissing) {
          // 存储侧已不存在：删 DB，标记 alreadyMissing
          result.alreadyMissingIds.push(id)
          await prisma.shotVideo.delete({ where: { id } })
          result.deletedCount++
          continue
        }
        // 存储删除失败（非 404）：保留 DB 记录，待后台重试（不删 DB，避免孤儿）
        result.storageDeleteFailures++
        result.pendingRetryIds.push(id)
        result.failed.push({ id, reason: '存储删除失败' })
        continue
      }
    }
    // 无 storageObjectKey（历史数据）或存储删除成功 → 删 DB
    await prisma.shotVideo.delete({ where: { id } })
    result.deletedCount++
  }

  return result
}

export async function cleanupProjectShotVideoCandidates(projectId: string): Promise<CleanupResult[]> {
  const shots = await prisma.shot.findMany({ where: { projectId }, select: { id: true } })
  const results: CleanupResult[] = []
  for (const shot of shots) {
    results.push(await cleanupShotVideoCandidates(shot.id))
  }
  return results
}

export async function countReclaimableCandidates(shotId: string): Promise<number> {
  const videos = await prisma.shotVideo.findMany({
    where: { shotId },
    orderBy: { createdAt: 'desc' },
  })
  const now = Date.now()
  const failedCutoff = now - KEEP_FAILED_DAYS * 24 * 60 * 60 * 1000
  let successKept = 0
  let reclaimable = 0
  for (const v of videos) {
    const status = (v.remoteStatus || '').toLowerCase()
    if (v.isSelected || v.isConfirmed) continue
    if (INFLIGHT.has(status)) continue
    if (TERMINAL_SUCCESS.has(status)) {
      successKept++
      if (successKept > KEEP_RECENT_SUCCESS) reclaimable++
    } else if (TERMINAL_FAILED.has(status)) {
      if (v.createdAt.getTime() < failedCutoff) reclaimable++
    }
  }
  return reclaimable
}

/**
 * 用户明确删除单个候选。
 * Phase 7.1 修正：存储删除成功或存储侧已不存在（404/alreadyMissing）才删 DB，
 * 避免遗留无法追踪的孤儿对象。存储删除失败 → 保留 DB 记录，返回 failed 待重试。
 */
export interface DeleteCandidateOutcome {
  deleted: boolean
  /** alreadyMissing: 存储侧 404，视为已删，DB 已删 */
  alreadyMissing: boolean
  /** pendingRetry: 存储删除失败，DB 保留待重试 */
  pendingRetry: boolean
  reason?: string
}

export async function deleteShotVideoCandidate(shotVideoId: string): Promise<DeleteCandidateOutcome> {
  const v = await prisma.shotVideo.findUnique({ where: { id: shotVideoId } })
  if (!v) return { deleted: false, alreadyMissing: false, pendingRetry: false, reason: '记录不存在' }

  if (v.storageObjectKey) {
    try {
      await mediaStorage.deleteObject(v.storageObjectKey)
    } catch (err: unknown) {
      // 检查是否存储侧已不存在（NoSuchKey / 404）→ 视为已删，可删 DB
      const e = err as { name?: string; $metadata?: { httpStatusCode?: number }; message?: string }
      const isMissing =
        e?.$metadata?.httpStatusCode === 404 ||
        e?.name === 'NotFound' ||
        e?.name === 'NoSuchKey' ||
        (typeof e?.message === 'string' && /not found|no such/i.test(e.message))
      if (isMissing) {
        // 存储侧已不存在：删 DB，标记 alreadyMissing
        await prisma.shotVideo.delete({ where: { id: shotVideoId } })
        return { deleted: true, alreadyMissing: true, pendingRetry: false }
      }
      // 存储删除失败（非 404）：保留 DB 记录，返回 pendingRetry 待后台重试
      return { deleted: false, alreadyMissing: false, pendingRetry: true, reason: '存储删除失败，待重试' }
    }
  }
  // 无 storageObjectKey（历史数据）或存储删除成功 → 删 DB
  await prisma.shotVideo.delete({ where: { id: shotVideoId } })
  return { deleted: true, alreadyMissing: false, pendingRetry: false }
}
