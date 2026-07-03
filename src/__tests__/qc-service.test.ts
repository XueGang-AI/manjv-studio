import { describe, expect, it } from 'vitest'

import { QCService, sortShotsForTimeline } from '@/server/services/qc.service'

describe('QCService storyboard checks', () => {
  it('按镜头号排序后检查时间线，避免数据库乱序导致重叠误报', async () => {
    const qc = new QCService()
    const result = await qc.qcStoryboard('project-1', 'episode-1', {
      title: '第 1 集',
      coreTask: '完成 30 秒短剧',
      openingHook: '雨夜急单闯入',
      endingHook: '修好的伞撑开',
      shots: [
        { shotNo: 2, startTime: 7, endTime: 15, imagePrompts: [{}], videoPrompts: [{}] },
        { shotNo: 1, startTime: 0, endTime: 7, imagePrompts: [{}], videoPrompts: [{}] },
        { shotNo: 4, startTime: 23, endTime: 30, imagePrompts: [{}], videoPrompts: [{}] },
        { shotNo: 3, startTime: 15, endTime: 23, imagePrompts: [{}], videoPrompts: [{}] },
      ],
    })

    expect(result.issues).not.toContainEqual(expect.objectContaining({ problem: '镜头时间重叠' }))
    expect(result.score).toBe(100)
  })

  it('sortShotsForTimeline 优先按 shotNo 排序', () => {
    const sorted = sortShotsForTimeline([
      { shotNo: 3, startTime: 15 },
      { shotNo: 1, startTime: 0 },
      { shotNo: 2, startTime: 7 },
    ]) as Array<{ shotNo: number }>

    expect(sorted.map(shot => shot.shotNo)).toEqual([1, 2, 3])
  })
})
