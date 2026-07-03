import path from 'path'
import { describe, expect, it } from 'vitest'

import {
  classifySeedProjectDuplicates,
  chooseRestoreSourceUrl,
  getSignedUrlExpiryStatus,
  inferMediaTypeForRecord,
  inspectLocalMediaObject,
  isSafeRemoteRestoreUrl,
  resolveSafeRestoreRedirectUrl,
  resolveLocalMediaPath,
  totalProjectContentCount,
  type ProjectContentCounts,
} from '@/server/maintenance/data-integrity'

const emptyCounts: ProjectContentCounts = {
  storyPackages: 0,
  characters: 0,
  characterImages: 0,
  scenes: 0,
  sceneImages: 0,
  episodes: 0,
  shots: 0,
  imagePrompts: 0,
  shotImages: 0,
  videoPrompts: 0,
  shotVideos: 0,
  voiceScripts: 0,
  finalVideos: 0,
  generationTasks: 0,
  projectVersions: 0,
  qcReports: 0,
  assetFiles: 0,
}

describe('data integrity helpers', () => {
  it('只把最早 seed 项目之后的空壳重复项归为可清理', () => {
    const audit = classifySeedProjectDuplicates([
      { id: 'later-empty', createdAt: '2026-01-03T00:00:00.000Z', counts: emptyCounts },
      { id: 'keeper', createdAt: '2026-01-01T00:00:00.000Z', counts: emptyCounts },
      {
        id: 'later-non-empty',
        createdAt: '2026-01-02T00:00:00.000Z',
        counts: { ...emptyCounts, episodes: 1 },
      },
    ])

    expect(audit.keeperId).toBe('keeper')
    expect(audit.duplicateIds).toEqual(['later-non-empty', 'later-empty'])
    expect(audit.emptyDuplicateIds).toEqual(['later-empty'])
    expect(audit.nonEmptyDuplicates).toEqual([{ id: 'later-non-empty', totalContentCount: 1 }])
  })

  it('汇总项目关联内容数量', () => {
    expect(totalProjectContentCount({ ...emptyCounts, shotImages: 2, finalVideos: 1 })).toBe(3)
  })

  it('解析本地媒体路径并拒绝路径穿越', () => {
    const uploadDir = '/tmp/manjv/uploads'

    expect(resolveLocalMediaPath(uploadDir, 'projects/p1/images/a.jpg')).toBe(
      path.resolve('/tmp/manjv/uploads/media/projects/p1/images/a.jpg'),
    )
    expect(resolveLocalMediaPath(uploadDir, '../secret.txt')).toBeNull()
  })

  it('返回 present/missing/invalid-key 三种本地媒体状态', () => {
    const uploadDir = '/tmp/manjv/uploads'
    const existing = path.resolve('/tmp/manjv/uploads/media/projects/p1/videos/a.mp4')
    const exists = (filePath: string) => filePath === existing

    expect(inspectLocalMediaObject(uploadDir, 'projects/p1/videos/a.mp4', exists)).toEqual({
      state: 'present',
      path: existing,
    })
    expect(inspectLocalMediaObject(uploadDir, 'projects/p1/videos/missing.mp4', exists).state).toBe('missing')
    expect(inspectLocalMediaObject(uploadDir, '../../secret.mp4', exists)).toEqual({
      state: 'invalid-key',
      path: null,
    })
  })

  it('为恢复脚本选择安全远端 URL，不接受本地路径或非法 URL', () => {
    expect(chooseRestoreSourceUrl('/api/media/x.jpg', 'https://example.test/x.jpg')).toBe('https://example.test/x.jpg')
    expect(chooseRestoreSourceUrl('uploads/a.jpg', null)).toBeNull()
    expect(isSafeRemoteRestoreUrl('https://example.test/a.jpg')).toBe(true)
    expect(isSafeRemoteRestoreUrl('javascript:alert(1)')).toBe(false)
    expect(isSafeRemoteRestoreUrl('http://127.0.0.1/a.jpg')).toBe(false)
    expect(isSafeRemoteRestoreUrl('https://example.test/a.jpg\nx')).toBe(false)
  })

  it('恢复脚本重定向地址必须逐跳通过安全校验', () => {
    expect(resolveSafeRestoreRedirectUrl('https://example.test/a.jpg', '/next.jpg')).toBe('https://example.test/next.jpg')
    expect(resolveSafeRestoreRedirectUrl('https://example.test/a.jpg', 'https://cdn.example.test/next.jpg')).toBe(
      'https://cdn.example.test/next.jpg',
    )

    expect(() => resolveSafeRestoreRedirectUrl('https://example.test/a.jpg', 'http://127.0.0.1/private')).toThrow(
      '来源地址被禁止访问',
    )
    expect(() => resolveSafeRestoreRedirectUrl('https://example.test/a.jpg', 'https://cdn.example.test/a.jpg\nx')).toThrow(
      '重定向地址无效',
    )
  })

  it('按表和字段推断媒体恢复类型', () => {
    expect(inferMediaTypeForRecord({ table: 'character_images', field: 'storageObjectKey', storageObjectKey: 'a.jpg' })).toBe('image')
    expect(inferMediaTypeForRecord({ table: 'shot_videos', field: 'storageObjectKey', storageObjectKey: 'a.mp4' })).toBe('video')
    expect(inferMediaTypeForRecord({ table: 'final_videos', field: 'storageObjectKey', storageObjectKey: 'a.mp4' })).toBe('final_video')
    expect(inferMediaTypeForRecord({ table: 'final_videos', field: 'assetPackageObjectKey', storageObjectKey: 'a.json' })).toBe('release_package')
  })

  it('本地解析 OSS/S3 签名 URL 过期状态，不需要发起网络请求', () => {
    const now = new Date('2026-07-02T08:00:00.000Z')
    const active = 'https://example.test/a.jpg?x-oss-date=20260702T040000Z&x-oss-expires=86400'
    const expiringSoon = 'https://example.test/a.jpg?x-oss-date=20260702T040000Z&x-oss-expires=18000'
    const expired = 'https://example.test/a.jpg?x-oss-date=20260701T040000Z&x-oss-expires=3600'

    expect(getSignedUrlExpiryStatus(active, now)).toBe('active')
    expect(getSignedUrlExpiryStatus(expiringSoon, now)).toBe('expiring-soon')
    expect(getSignedUrlExpiryStatus(expired, now)).toBe('expired')
    expect(getSignedUrlExpiryStatus('https://example.test/a.jpg', now)).toBe('not-signed-url')
    expect(getSignedUrlExpiryStatus('https://example.test/a.jpg?x-oss-date=bad&x-oss-expires=3600', now)).toBe('invalid-date')
  })
})
