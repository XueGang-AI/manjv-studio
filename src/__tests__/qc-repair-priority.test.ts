import { describe, expect, it } from 'vitest'

import { preferredRepairIssue, repairButtonLabel, type RepairableQCIssue } from '@/app/projects/[id]/qc/repair-priority'

describe('QC repair priority', () => {
  it('同镜头视频/成片黑边优先回到分镜图返工', () => {
    const imageIssue: RepairableQCIssue = {
      shotNo: 2,
      issueType: 'shot_image_partial_black',
      repairTarget: { kind: 'shot_image', shotId: 'shot-2', shotNo: 2 },
      regenerationIssueTypes: ['invalid_composition'],
    }
    const finalIssue: RepairableQCIssue = {
      shotNo: 2,
      issueType: 'final_visual_partial_black',
      repairTarget: { kind: 'shot_video', shotId: 'shot-2', shotNo: 2 },
      regenerationIssueTypes: ['invalid_composition'],
    }

    const preferred = preferredRepairIssue(finalIssue, [imageIssue, finalIssue])

    expect(preferred).toBe(imageIssue)
    expect(repairButtonLabel(preferred)).toBe('优先重生分镜图')
  })

  it('没有同镜头分镜问题时保留原视频返工目标', () => {
    const videoIssue: RepairableQCIssue = {
      shotNo: 3,
      issueType: 'shot_video_partial_black',
      repairTarget: { kind: 'shot_video', shotId: 'shot-3', shotNo: 3 },
      regenerationIssueTypes: ['invalid_composition'],
    }

    const preferred = preferredRepairIssue(videoIssue, [videoIssue])

    expect(preferred).toBe(videoIssue)
    expect(repairButtonLabel(preferred)).toBe('重生视频片段')
  })
})
