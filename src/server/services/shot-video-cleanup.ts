/**
 * ShotVideo 候选保留与清理策略（Phase 6）
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
 * 6. 删除前确认对象存储资源是否应删除
 * 7. 存储删除失败不阻塞 DB 清理，但记录追踪
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
  storageDeleteFailures: number
}

export async function cleanupShotVideoCandidates(shotId: string): Promise<CleanupResult> {
  const result: CleanupResult = { shotId, deletedCount: 0, storageDeleteFailures: 0 }

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
    if (v?.storageObjectKey) {
      try {
        await mediaStorage.deleteObject(v.storageObjectKey)
      } catch {
        result.storageDeleteFailures++
      }
    }
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
