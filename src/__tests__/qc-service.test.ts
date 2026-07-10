import { describe, expect, it } from 'vitest'

import { QCService, sortShotsForTimeline } from '@/server/services/qc.service'
import type { VisualQualityResult } from '@/server/services/media-visual-qc.service'

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

  it('标准化 QC issue 时附加可执行的重生参数', () => {
    const qc = new QCService() as unknown as {
      normalizeIssue: (issue: {
        level: 'high' | 'medium' | 'low'
        field: string
        problem: string
        suggestion: string
        issueType?: string
        recommendedAction?: string
      }) => {
        regenerationIssueTypes?: string[]
        fixNote?: string
        repairTarget?: {
          kind?: string
          shotId?: string
          shotNo?: number
          issueTypes?: string[]
        }
      }
    }

    const issue = qc.normalizeIssue({
      level: 'high',
      field: 'shot_2.image.visual_quality',
      problem: '镜头 2 确认分镜图存在视觉质量问题：top 区域大面积近黑',
      suggestion: '跳过该候选并重生成分镜图',
      shotId: 'shot-2',
      shotNo: 2,
      issueType: 'shot_image_partial_black',
      recommendedAction: 'rerun_shot_image',
    })

    expect(issue.regenerationIssueTypes).toEqual(['invalid_composition'])
    expect(issue.fixNote).toContain('镜头 2')
    expect(issue.repairTarget).toMatchObject({
      kind: 'shot_image',
      shotId: 'shot-2',
      shotNo: 2,
      issueTypes: ['invalid_composition'],
    })
  })

  it('把成片视觉异常采样时间定位到对应镜头', () => {
    const qc = new QCService() as unknown as {
      visualQualityIssueTime: (result: VisualQualityResult) => number | undefined
      findShotForFinalTime: (
        shots: Array<{ id: string; shotNo: number; startTime?: number | null; endTime?: number | null }>,
        timeSeconds?: number,
      ) => { id: string; shotNo: number } | null
    }
    const visualQuality: VisualQualityResult = {
      passed: false,
      issues: [],
      frameMetrics: [{
        timeSeconds: 8,
        width: 90,
        height: 160,
        wholeMean: 72,
        topMean: 3,
        middleMean: 85,
        bottomMean: 120,
        leftMean: 72,
        centerMean: 80,
        rightMean: 76,
        topDarkRatio: 0.96,
        bottomDarkRatio: 0,
        leftDarkRatio: 0,
        rightDarkRatio: 0,
      }],
    }

    const issueTime = qc.visualQualityIssueTime(visualQuality)
    const shot = qc.findShotForFinalTime([
      { id: 'shot-1', shotNo: 1, startTime: 0, endTime: 7 },
      { id: 'shot-2', shotNo: 2, startTime: 7, endTime: 15 },
      { id: 'shot-3', shotNo: 3, startTime: 15, endTime: 23 },
    ], issueTime)

    expect(issueTime).toBe(8)
    expect(shot).toMatchObject({ id: 'shot-2', shotNo: 2 })
  })

  it('同镜头首帧无效时，视频和成片 issue 优先指向分镜图返工', () => {
    type TestIssue = {
      level: 'high' | 'medium' | 'low'
      field: string
      problem: string
      suggestion: string
      issueType?: string
      recommendedAction?: string
      regenerationIssueTypes?: string[]
      shotId?: string
      shotNo?: number
      repairTarget?: {
        kind?: string
        shotId?: string
        shotNo?: number
        issueTypes?: string[]
        fixNote?: string
      }
      repairSequence?: Array<{ kind?: string; shotId?: string; shotNo?: number }>
    }
    const qc = new QCService() as unknown as {
      applyCrossStageRepairPriority: (results: Array<{
        score: number
        passed: boolean
        level: 'excellent' | 'good' | 'warning' | 'failed'
        issues: TestIssue[]
        summary: string
        rewrite_required: boolean
        rewrite_instruction: string
      }>) => Array<{ issues: TestIssue[] }>
    }

    const imageIssue: TestIssue = {
      level: 'high',
      field: 'shot_2.image.visual_quality',
      problem: '镜头 2 分镜图上方大面积近黑',
      suggestion: '重生成分镜图',
      shotId: 'shot-2',
      shotNo: 2,
      issueType: 'shot_image_partial_black',
      recommendedAction: 'rerun_shot_image',
      regenerationIssueTypes: ['invalid_composition'],
      repairTarget: {
        kind: 'shot_image',
        shotId: 'shot-2',
        shotNo: 2,
        issueTypes: ['invalid_composition'],
        fixNote: '先修首帧',
      },
    }
    const finalIssue: TestIssue = {
      level: 'high',
      field: 'final_video.visual_quality',
      problem: '成片第 2 镜上方大面积近黑',
      suggestion: '重跑视频',
      shotId: 'shot-2',
      shotNo: 2,
      issueType: 'final_visual_partial_black',
      recommendedAction: 'rerun_shot_video',
      regenerationIssueTypes: ['invalid_composition'],
      repairTarget: {
        kind: 'shot_video',
        shotId: 'shot-2',
        shotNo: 2,
        issueTypes: ['invalid_composition'],
        fixNote: '再修视频',
      },
    }

    const [imageResult, finalResult] = qc.applyCrossStageRepairPriority([
      {
        score: 85,
        passed: true,
        level: 'good',
        issues: [imageIssue],
        summary: '图片 QC',
        rewrite_required: false,
        rewrite_instruction: '',
      },
      {
        score: 80,
        passed: true,
        level: 'good',
        issues: [finalIssue],
        summary: '成片 QC',
        rewrite_required: false,
        rewrite_instruction: '',
      },
    ])

    expect(imageResult.issues[0].repairTarget).toMatchObject({ kind: 'shot_image', shotId: 'shot-2' })
    expect(finalResult.issues[0]).toMatchObject({
      recommendedAction: 'rerun_shot_image',
      repairTarget: { kind: 'shot_image', shotId: 'shot-2', fixNote: '先修首帧' },
    })
    expect(finalResult.issues[0].repairSequence).toEqual([
      expect.objectContaining({ kind: 'shot_image', shotId: 'shot-2' }),
      expect.objectContaining({ kind: 'shot_video', shotId: 'shot-2' }),
    ])
  })
})
