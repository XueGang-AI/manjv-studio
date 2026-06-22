/**
 * ShotVideo 候选清理测试（Phase 8）
 * --------------------------------------------
 * Mock prisma + mediaStorage，验证孤儿文件防护：
 * - 存储删除成功 → 删 DB
 * - 存储侧 404 → alreadyMissing，删 DB
 * - 存储删除失败 → 保留 DB，pendingRetry
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

vi.mock('@/lib/prisma', () => {
  const mockDelete = vi.fn()
  const mockFindMany = vi.fn()
  return {
    default: {
      shotVideo: {
        findMany: mockFindMany,
        delete: mockDelete,
      },
      shot: {
        findMany: vi.fn().mockResolvedValue([]),
      },
    },
  }
})

vi.mock('@/server/services/media-storage', () => ({
  mediaStorage: {
    deleteObject: vi.fn(),
    name: 'test',
  },
}))

import { cleanupShotVideoCandidates } from '../server/services/shot-video-cleanup'
import { mediaStorage } from '../server/services/media-storage'

const mockFindMany = (await import('@/lib/prisma')).default.shotVideo.findMany as ReturnType<typeof vi.fn>
const mockDelete = (await import('@/lib/prisma')).default.shotVideo.delete as ReturnType<typeof vi.fn>
const mockStorageDelete = mediaStorage.deleteObject as ReturnType<typeof vi.fn>

const oldNow = Date.now
beforeEach(() => {
  vi.clearAllMocks()
  // 固定时间，避免 failedCutoff 漂移
  Date.now = () => new Date('2026-06-22T00:00:00Z').getTime()
})
afterEach(() => {
  Date.now = oldNow
})

describe('cleanupShotVideoCandidates 孤儿防护', () => {
  it('存储删除成功 → 删 DB，deletedCount+1', async () => {
    const video = {
      id: 'v1', shotId: 's1', remoteStatus: 'failed',
      isSelected: false, isConfirmed: false,
      storageObjectKey: 'projects/p1/videos/v1.mp4',
      createdAt: new Date('2026-06-01'),
    }
    mockFindMany.mockResolvedValue([video])
    mockStorageDelete.mockResolvedValue(undefined)
    mockDelete.mockResolvedValue(undefined)

    const result = await cleanupShotVideoCandidates('s1')
    expect(mockStorageDelete).toHaveBeenCalledWith('projects/p1/videos/v1.mp4')
    expect(mockDelete).toHaveBeenCalledWith({ where: { id: 'v1' } })
    expect(result.deletedCount).toBe(1)
    expect(result.pendingRetryIds).toHaveLength(0)
    expect(result.alreadyMissingIds).toHaveLength(0)
  })

  it('存储侧 404 → alreadyMissing，仍删 DB', async () => {
    const video = {
      id: 'v2', shotId: 's1', remoteStatus: 'failed',
      isSelected: false, isConfirmed: false,
      storageObjectKey: 'projects/p1/videos/v2.mp4',
      createdAt: new Date('2026-06-01'),
    }
    mockFindMany.mockResolvedValue([video])
    mockStorageDelete.mockRejectedValue({ name: 'NoSuchKey' })
    mockDelete.mockResolvedValue(undefined)

    const result = await cleanupShotVideoCandidates('s1')
    expect(result.alreadyMissingIds).toContain('v2')
    expect(result.deletedCount).toBe(1)
    expect(result.pendingRetryIds).toHaveLength(0)
  })

  it('存储删除失败（非 404）→ 保留 DB，pendingRetry', async () => {
    const video = {
      id: 'v3', shotId: 's1', remoteStatus: 'failed',
      isSelected: false, isConfirmed: false,
      storageObjectKey: 'projects/p1/videos/v3.mp4',
      createdAt: new Date('2026-06-01'),
    }
    mockFindMany.mockResolvedValue([video])
    mockStorageDelete.mockRejectedValue(new Error('network error'))

    const result = await cleanupShotVideoCandidates('s1')
    expect(result.pendingRetryIds).toContain('v3')
    expect(result.storageDeleteFailures).toBe(1)
    expect(result.failed).toContainEqual({ id: 'v3', reason: '存储删除失败' })
    expect(mockDelete).not.toHaveBeenCalled() // 不删 DB
  })

  it('selected/confirmed 不删除', async () => {
    const videos = [
      { id: 'sel', shotId: 's1', remoteStatus: 'completed', isSelected: true, isConfirmed: false, storageObjectKey: null, createdAt: new Date('2026-05-01') },
      { id: 'conf', shotId: 's1', remoteStatus: 'completed', isSelected: false, isConfirmed: true, storageObjectKey: null, createdAt: new Date('2026-05-01') },
    ]
    mockFindMany.mockResolvedValue(videos)
    const result = await cleanupShotVideoCandidates('s1')
    expect(result.deletedCount).toBe(0)
    expect(mockDelete).not.toHaveBeenCalled()
  })
})
