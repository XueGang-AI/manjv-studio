'use client'

import React from 'react'
import { Badge } from '@/components/ui/badge'

const STATUS_STYLES: Record<string, { variant: 'default' | 'success' | 'warning' | 'danger' | 'info'; label: string }> = {
  DRAFT: { variant: 'default', label: '草稿' },
  STORY_GENERATING: { variant: 'info', label: '故事生成中' },
  STORY_PENDING_CONFIRM: { variant: 'warning', label: '待确认故事' },
  STORY_CONFIRMED: { variant: 'success', label: '故事已确认' },
  CHARACTER_GENERATING: { variant: 'info', label: '角色生成中' },
  CHARACTER_PENDING_CONFIRM: { variant: 'warning', label: '待确认角色' },
  CHARACTER_CONFIRMED: { variant: 'success', label: '角色已确认' },
  CHARACTER_IMAGE_GENERATING: { variant: 'info', label: '角色图生成中' },
  CHARACTER_IMAGE_PENDING_PICK: { variant: 'warning', label: '待选角色图' },
  CHARACTER_IMAGE_CONFIRMED: { variant: 'success', label: '角色图已确认' },
  STORYBOARD_GENERATING: { variant: 'info', label: '分镜生成中' },
  STORYBOARD_PENDING_CONFIRM: { variant: 'warning', label: '待确认分镜' },
  STORYBOARD_CONFIRMED: { variant: 'success', label: '分镜已确认' },
  SHOT_IMAGE_GENERATING: { variant: 'info', label: '分镜图生成中' },
  SHOT_IMAGE_PENDING_PICK: { variant: 'warning', label: '待选分镜图' },
  SHOT_IMAGE_CONFIRMED: { variant: 'success', label: '分镜图已确认' },
  SHOT_VIDEO_GENERATING: { variant: 'info', label: '视频生成中' },
  SHOT_VIDEO_PENDING_PICK: { variant: 'warning', label: '待选视频' },
  SHOT_VIDEO_CONFIRMED: { variant: 'success', label: '视频已确认' },
  RENDERING: { variant: 'info', label: '合成中' },
  RENDERED: { variant: 'success', label: '已合成' },
  FINAL_CONFIRMED: { variant: 'success', label: '已完成' },
  FAILED: { variant: 'danger', label: '失败' },
}

interface Props {
  status: string
  className?: string
}

export function ProjectStatusBadge({ status, className }: Props) {
  const style = STATUS_STYLES[status] || { variant: 'default' as const, label: status }

  return (
    <Badge variant={style.variant} className={className}>
      {style.label}
    </Badge>
  )
}
