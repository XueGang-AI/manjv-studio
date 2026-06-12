'use client'

import React from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { Check, Lock, Zap } from 'lucide-react'
import { Badge } from '@/components/ui/badge'

interface Step {
  label: string
  href: string
  completed: boolean
  current: boolean
  locked: boolean
  generating?: boolean
}

interface StepNavigatorProps {
  projectId: string
  currentStatus: string
}

/**
 * ModelSelector — static display only, no real data
 */
function ModelSelector({ active = 'agnes' }: { active?: 'agnes' | 'ark' }) {
  return (
    <div className="flex items-center gap-1 bg-[var(--bg-panel)] border border-[var(--color-border-dim)] rounded-[var(--radius-md)] p-1">
      {(['agnes', 'ark'] as const).map(m => (
        <span key={m} className={cn(
          'px-2.5 py-1 rounded-[var(--radius-sm)] text-[11px] font-medium',
          active === m ? 'bg-[var(--color-primary)] text-white' : 'text-[var(--color-text-muted)]'
        )}>{m === 'agnes' ? 'Agnes' : '豆包'}</span>
      ))}
    </div>
  )
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
      generating: currentStatus === 'CHARACTER_IMAGE_GENERATING',
    },
    {
      label: '分镜脚本',
      href: `/projects/${projectId}/episodes/1/storyboard`,
      completed: isStatusAfter(currentStatus, 'STORYBOARD_CONFIRMED'),
      current: pathname.includes('storyboard'),
      locked: !isStatusAfter(currentStatus, 'CHARACTER_IMAGE_CONFIRMED'),
      generating: currentStatus === 'STORYBOARD_GENERATING',
    },
    {
      label: '分镜图',
      href: `/projects/${projectId}/episodes/1/shot-images`,
      completed: isStatusAfter(currentStatus, 'SHOT_IMAGE_CONFIRMED'),
      current: pathname.includes('shot-images'),
      locked: !isStatusAfter(currentStatus, 'STORYBOARD_CONFIRMED'),
      generating: currentStatus === 'SHOT_IMAGE_GENERATING',
    },
    {
      label: '视频片段',
      href: `/projects/${projectId}/episodes/1/shot-videos`,
      completed: isStatusAfter(currentStatus, 'SHOT_VIDEO_CONFIRMED'),
      current: pathname.includes('shot-videos'),
      locked: !isStatusAfter(currentStatus, 'SHOT_IMAGE_CONFIRMED'),
      generating: currentStatus === 'SHOT_VIDEO_GENERATING',
    },
    {
      label: '成片预览',
      href: `/projects/${projectId}/episodes/1/final-preview`,
      completed: isStatusAfter(currentStatus, 'RENDERED'),
      current: pathname.includes('final-preview'),
      locked: !isStatusAfter(currentStatus, 'SHOT_VIDEO_CONFIRMED'),
      generating: currentStatus === 'RENDERING',
    },
  ]

  return (
    <div className="flex items-center gap-0 overflow-x-auto py-2.5 px-6 bg-[var(--bg-surface)]/80 backdrop-blur-md border-b border-[var(--color-border-dim)]">
      <div className="flex items-center gap-0">
        {steps.map((step, index) => {
          const isGenerating = step.generating && !step.completed

          return (
            <React.Fragment key={step.label}>
              {/* Connector line between steps */}
              {index > 0 && (
                <div className={cn(
                  'w-6 h-0.5 mx-1.5 rounded-full transition-colors',
                  step.completed ? 'bg-[var(--color-success)]/40' :
                  step.current ? 'aurora-line h-[2px]' :
                  'bg-[var(--color-border-dim)]'
                )} />
              )}
              <Link
                href={step.locked ? '#' : step.href}
                className={cn(
                  'flex items-center gap-2 px-3 py-1.5 rounded-[var(--radius-md)] text-xs font-medium whitespace-nowrap transition-all',
                  step.current && !step.completed && !isGenerating && 'text-[var(--color-primary)]',
                  step.completed && !step.current && 'text-[var(--color-success)] hover:bg-[var(--color-success-muted)]',
                  !step.current && !step.completed && !step.locked && 'text-[var(--color-text-secondary)] hover:bg-[var(--bg-panel)] hover:text-[var(--color-text-primary)]',
                  step.locked && 'text-[var(--color-text-muted)] cursor-not-allowed opacity-50',
                  isGenerating && 'text-[var(--color-accent-cyan)]'
                )}
                onClick={(e) => step.locked && e.preventDefault()}
              >
                {/* Step dot */}
                <span className={cn(
                  'w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold transition-all shrink-0',
                  step.current && !step.completed && !isGenerating && 'aurora-dot text-white',
                  isGenerating && 'bg-[var(--color-accent-cyan)] text-[var(--bg-base)] animate-pulse-glow shadow-[var(--glow-cyan)]',
                  step.completed && 'bg-[var(--color-success)] text-white',
                  !step.current && !step.completed && !step.locked && !isGenerating && 'bg-[var(--bg-panel)] text-[var(--color-text-muted)]',
                  step.locked && 'bg-[var(--bg-panel)] text-[var(--color-text-muted)]'
                )}>
                  {step.completed ? <Check size={12} /> : step.locked ? <Lock size={10} /> : (index + 1)}
                </span>
                {/* Step label */}
                <span className={cn(
                  step.current && !step.completed && !isGenerating && 'aurora-text font-semibold',
                  isGenerating && 'text-[var(--color-accent-cyan)] font-semibold'
                )} style={step.current && !step.completed && !isGenerating ? { background: 'var(--gradient-aurora)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' } : {}}>
                  {step.label}
                </span>
                {/* Generating indicator */}
                {isGenerating && (
                  <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-accent-cyan)] animate-pulse-glow" />
                )}
              </Link>
            </React.Fragment>
          )
        })}
      </div>

      {/* Right side: Model selector + queue badge (static, read-only) */}
      <div className="ml-auto flex items-center gap-2 shrink-0">
        <ModelSelector active="agnes" />
        <Badge variant="info" dot>
          <span className="flex items-center gap-1">
            <Zap size={10} className="text-[var(--color-info)]" />
            队列中
          </span>
        </Badge>
      </div>
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
