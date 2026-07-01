'use client'

import React, { useState, useRef, useEffect } from 'react'
import Link from 'next/link'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ProjectStatusBadge } from '@/components/project/ProjectStatusBadge'
import { ProgressBar } from '@/components/ui/progress-bar'
import {
  Clock, Play, MoreHorizontal, Trash2, ArrowRight,
} from 'lucide-react'
import type { ProjectListItem } from '@/lib/types'

/**
 * 将项目状态映射到 9 步工作流进度。
 */
function getStepInfo(status: string): { step: number; total: number } {
  const stepOrder = [
    'DRAFT',
    'STORY_CONFIRMED',
    'CHARACTER_CONFIRMED',
    'CHARACTER_IMAGE_CONFIRMED',
    'STORYBOARD_CONFIRMED',
    'SHOT_IMAGE_GENERATING',
    'SHOT_IMAGE_CONFIRMED',
    'SHOT_VIDEO_CONFIRMED',
    'FINAL_CONFIRMED',
  ]
  let step = 0
  for (let i = 0; i < stepOrder.length; i++) {
    if (status === stepOrder[i] || status.startsWith(stepOrder[i].replace('_CONFIRMED', '').replace('_FINAL_CONFIRMED', ''))) {
      step = i
    }
  }
  // If status contains GENERATING or PENDING after a confirmed step, advance
  if (status.includes('GENERATING') || status.includes('PENDING') || status.includes('PICK')) {
    for (let i = stepOrder.length - 1; i >= 0; i--) {
      const prefix = stepOrder[i].replace('_CONFIRMED', '')
      if (status.startsWith(prefix)) {
        step = i + 0.5 // mid-step
        break
      }
    }
  }
  if (status === 'FINAL_CONFIRMED' || status === 'RENDERED') step = 9
  return { step: Math.min(step, 9), total: 9 }
}

/**
 * Generate a stable cover gradient from project name
 */
function getCoverGradient(name: string): string {
  // 暖炭黑色阶 + 极弱琥珀点缀，避免蓝紫装饰色
  const colors = [
    ['#1a1917', '#211f1c', '#292623'],
    ['#211f1c', '#292623', '#1a1917'],
    ['#151412', '#211f1c', '#292623'],
    ['#1a1917', '#292623', '#211f1c'],
  ]
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash)
  const idx = Math.abs(hash) % colors.length
  const c = colors[idx]
  return `linear-gradient(135deg, ${c[0]} 0%, ${c[1]} 50%, ${c[2]} 100%)`
}

function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMin = Math.floor(diffMs / 60000)
  const diffHour = Math.floor(diffMs / 3600000)
  const diffDay = Math.floor(diffMs / 86400000)

  if (diffMin < 1) return '刚刚'
  if (diffMin < 60) return `${diffMin} 分钟前`
  if (diffHour < 24) return `${diffHour} 小时前`
  if (diffDay < 7) return `${diffDay} 天前`
  if (diffDay < 30) return `${Math.floor(diffDay / 7)} 周前`
  return date.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })
}

interface ProjectCardProps {
  project: ProjectListItem
  onDelete: (id: string, name: string) => void
}

export function ProjectCardV3({ project, onDelete }: ProjectCardProps) {
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const { step, total } = getStepInfo(project.status)
  const progressPct = (step / total) * 100

  // Close menu on outside click
  useEffect(() => {
    if (!menuOpen) return
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [menuOpen])

  // Close menu on Escape
  useEffect(() => {
    if (!menuOpen) return
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setMenuOpen(false)
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [menuOpen])

  const providerLabel = '豆包'
  const providerVariant = 'violet' as const

  return (
    <Card hover className="overflow-hidden group">
      {/* Cover area */}
      <div className="h-32 relative overflow-hidden" style={{ background: getCoverGradient(project.projectName) }}>
        {/* Decorative grid dots */}
        <div className="absolute left-3 top-3 bottom-3 flex flex-col gap-1.5 opacity-20" aria-hidden="true">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="w-1 h-1.5 rounded-[1px] bg-white/60" />
          ))}
        </div>

        {/* Provider badge */}
        <div className="absolute top-3 right-3">
          <Badge variant={providerVariant} dot>{providerLabel}</Badge>
        </div>

        {/* Hover overlay with CTA */}
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
          <Link href={`/projects/${project.id}`}>
            <Button variant="aurora" size="sm" icon={<Play size={12} />}>继续创作</Button>
          </Link>
        </div>

        {/* Project name at bottom */}
        <div className="absolute bottom-3 left-3 right-3">
          <h3 className="text-lg font-bold text-white drop-shadow-lg truncate">{project.projectName}</h3>
        </div>
      </div>

      {/* Content */}
      <div className="p-4 space-y-3">
        {/* Tags */}
        <div className="flex flex-wrap gap-1.5">
          {project.storyType && <Badge>{project.storyType}</Badge>}
          {project.artStyle && <Badge>{project.artStyle}</Badge>}
          {project.targetPlatform && <Badge variant="default">{project.targetPlatform}</Badge>}
        </div>

        {/* Progress */}
        <div>
          <div className="flex items-center justify-between text-[11px] mb-1.5">
            <ProjectStatusBadge status={project.status} />
            <span className="font-mono text-[var(--color-text-muted)]">{Math.round(step)}/{total}</span>
          </div>
          <ProgressBar
            value={progressPct}
            variant={step >= total ? 'success' : 'aurora'}
          />
        </div>

        {/* Footer: time + menu */}
        <div className="flex items-center justify-between pt-1 text-xs text-[var(--color-text-muted)]">
          <span className="flex items-center gap-1">
            <Clock size={11} />
            {formatRelativeTime(project.updatedAt)}
          </span>
          <div className="relative" ref={menuRef}>
            <button
              onClick={() => setMenuOpen(!menuOpen)}
              className="p-1 rounded hover:bg-[var(--bg-panel)] transition-colors cursor-pointer text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]"
              aria-label="更多操作"
              aria-expanded={menuOpen}
            >
              <MoreHorizontal size={14} />
            </button>
            {menuOpen && (
              <div className="absolute right-0 top-7 w-36 bg-[var(--bg-panel)] border border-[var(--color-border-default)] rounded-[var(--radius-md)] shadow-[var(--shadow-elevated)] py-1 z-10" role="menu">
                <Link
                  href={`/projects/${project.id}`}
                  className="w-full flex items-center gap-2 px-3 py-2 text-xs text-[var(--color-text-secondary)] hover:bg-[var(--bg-elevated)] transition-colors"
                  role="menuitem"
                  onClick={() => setMenuOpen(false)}
                >
                  <ArrowRight size={12} />
                  继续创作
                </Link>
                <button
                  className="w-full flex items-center gap-2 px-3 py-2 text-xs text-[var(--color-danger)] hover:bg-[var(--color-danger-muted)] transition-colors cursor-pointer"
                  role="menuitem"
                  onClick={() => {
                    setMenuOpen(false)
                    onDelete(project.id, project.projectName)
                  }}
                >
                  <Trash2 size={12} />
                  删除项目
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </Card>
  )
}
