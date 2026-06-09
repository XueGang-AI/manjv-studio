'use client'

import React from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { Check, Lock } from 'lucide-react'

interface Step {
  label: string
  href: string
  completed: boolean
  current: boolean
  locked: boolean
}

interface StepNavigatorProps {
  projectId: string
  currentStatus: string
}

export function StepNavigator({ projectId, currentStatus }: StepNavigatorProps) {
  const pathname = usePathname()

  const steps: Step[] = [
    {
      label: '项目信息',
      href: `/projects/${projectId}`,
      completed: isStatusAfter(currentStatus, 'DRAFT'),
      current: pathname === `/projects/${projectId}`,
      locked: false,
    },
    {
      label: '故事方案',
      href: `/projects/${projectId}/story`,
      completed: isStatusAfter(currentStatus, 'STORY_CONFIRMED'),
      current: pathname.includes('/story'),
      locked: !isStatusAfter(currentStatus, 'DRAFT'),
    },
    {
      label: '角色设定',
      href: `/projects/${projectId}/characters`,
      completed: isStatusAfter(currentStatus, 'CHARACTER_CONFIRMED'),
      current: pathname.includes('/characters') && !pathname.includes('character-images'),
      locked: !isStatusAfter(currentStatus, 'STORY_CONFIRMED'),
    },
    {
      label: '角色图',
      href: `/projects/${projectId}/character-images`,
      completed: isStatusAfter(currentStatus, 'CHARACTER_IMAGE_CONFIRMED'),
      current: pathname.includes('character-images'),
      locked: !isStatusAfter(currentStatus, 'CHARACTER_CONFIRMED'),
    },
    {
      label: '分镜脚本',
      href: `/projects/${projectId}/episodes/1/storyboard`,
      completed: isStatusAfter(currentStatus, 'STORYBOARD_CONFIRMED'),
      current: pathname.includes('storyboard'),
      locked: !isStatusAfter(currentStatus, 'CHARACTER_IMAGE_CONFIRMED'),
    },
    {
      label: '分镜图',
      href: `/projects/${projectId}/episodes/1/shot-images`,
      completed: isStatusAfter(currentStatus, 'SHOT_IMAGE_CONFIRMED'),
      current: pathname.includes('shot-images'),
      locked: !isStatusAfter(currentStatus, 'STORYBOARD_CONFIRMED'),
    },
    {
      label: '视频片段',
      href: `/projects/${projectId}/episodes/1/shot-videos`,
      completed: isStatusAfter(currentStatus, 'SHOT_VIDEO_CONFIRMED'),
      current: pathname.includes('shot-videos'),
      locked: !isStatusAfter(currentStatus, 'SHOT_IMAGE_CONFIRMED'),
    },
    {
      label: '成片预览',
      href: `/projects/${projectId}/episodes/1/final-preview`,
      completed: isStatusAfter(currentStatus, 'RENDERED'),
      current: pathname.includes('final-preview'),
      locked: !isStatusAfter(currentStatus, 'SHOT_VIDEO_CONFIRMED'),
    },
  ]

  return (
    <div className="flex items-center gap-1 overflow-x-auto py-2 px-4 bg-gray-50 border-b border-gray-200">
      {steps.map((step, index) => (
        <React.Fragment key={step.label}>
          {index > 0 && (
            <div className={cn('w-8 h-px', step.completed ? 'bg-indigo-400' : 'bg-gray-300')} />
          )}
          <Link
            href={step.locked ? '#' : step.href}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors',
              step.current && 'bg-indigo-600 text-white',
              step.completed && !step.current && 'bg-indigo-50 text-indigo-600',
              !step.current && !step.completed && !step.locked && 'text-gray-600 hover:bg-gray-100',
              step.locked && 'text-gray-400 cursor-not-allowed'
            )}
            onClick={(e) => step.locked && e.preventDefault()}
          >
            {step.completed ? (
              <Check size={14} />
            ) : step.locked ? (
              <Lock size={14} />
            ) : (
              <span className="w-3.5 h-3.5 rounded-full border border-current flex items-center justify-center text-[10px]">
                {index + 1}
              </span>
            )}
            {step.label}
          </Link>
        </React.Fragment>
      ))}
    </div>
  )
}

/**
 * 判断状态是否在指定状态之后
 */
function isStatusAfter(current: string, target: string): boolean {
  const statusOrder = [
    'DRAFT',
    'STORY_GENERATING', 'STORY_PENDING_CONFIRM', 'STORY_CONFIRMED',
    'CHARACTER_GENERATING', 'CHARACTER_PENDING_CONFIRM', 'CHARACTER_CONFIRMED',
    'CHARACTER_IMAGE_GENERATING', 'CHARACTER_IMAGE_PENDING_PICK', 'CHARACTER_IMAGE_CONFIRMED',
    'STORYBOARD_GENERATING', 'STORYBOARD_PENDING_CONFIRM', 'STORYBOARD_CONFIRMED',
    'SHOT_IMAGE_GENERATING', 'SHOT_IMAGE_PENDING_PICK', 'SHOT_IMAGE_CONFIRMED',
    'SHOT_VIDEO_GENERATING', 'SHOT_VIDEO_PENDING_PICK', 'SHOT_VIDEO_CONFIRMED',
    'RENDERING', 'RENDERED', 'FINAL_CONFIRMED',
  ]
  const currentIndex = statusOrder.indexOf(current)
  const targetIndex = statusOrder.indexOf(target)
  if (currentIndex === -1) return false
  return currentIndex >= targetIndex && current !== 'DRAFT'
}
