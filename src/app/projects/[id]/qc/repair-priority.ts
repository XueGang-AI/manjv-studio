export interface RepairableQCIssue {
  shotNo?: number
  issueType?: string
  regenerationIssueTypes?: string[]
  repairTarget?: {
    kind?: string
    shotId?: string
    shotNo?: number
  }
}

export function preferredRepairIssue<TIssue extends RepairableQCIssue>(
  issue: TIssue,
  issues: TIssue[],
): TIssue {
  const target = issue.repairTarget
  if (target?.kind === 'shot_video' && target.shotNo) {
    const imageIssue = issues.find(candidate =>
      candidate.shotNo === target.shotNo &&
      candidate.repairTarget?.kind === 'shot_image' &&
      candidate.repairTarget?.shotId &&
      (candidate.issueType === 'shot_image_partial_black' || candidate.regenerationIssueTypes?.includes('invalid_composition'))
    )
    if (imageIssue) return imageIssue
  }
  return issue
}

export function repairButtonLabel(issue: RepairableQCIssue | null) {
  const target = issue?.repairTarget
  if (target?.kind === 'shot_image') return '优先重生分镜图'
  if (target?.kind === 'shot_video') return '重生视频片段'
  if (target?.kind === 'final_render') return '重新合成成片'
  return '按 QC 建议返工'
}
