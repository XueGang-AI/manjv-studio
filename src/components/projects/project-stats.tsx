'use client'

import React from 'react'
import { Card } from '@/components/ui/card'
import { FolderOpen, Clock, CheckCircle2 } from 'lucide-react'
import type { ProjectListItem } from '@/lib/types'

interface ProjectStatsProps {
  projects: ProjectListItem[]
}

function getStatusCategory(status: string): 'draft' | 'active' | 'completed' | 'failed' {
  if (status === 'DRAFT') return 'draft'
  if (status === 'FINAL_CONFIRMED' || status === 'RENDERED') return 'completed'
  if (status === 'FAILED') return 'failed'
  return 'active'
}

export function ProjectStats({ projects }: ProjectStatsProps) {
  const total = projects.length
  const active = projects.filter(p => getStatusCategory(p.status) === 'active').length
  const completed = projects.filter(p => getStatusCategory(p.status) === 'completed').length

  const stats = [
    { label: '项目总数', value: total, icon: <FolderOpen size={16} /> },
    { label: '进行中', value: active, icon: <Clock size={16} /> },
    { label: '已完成', value: completed, icon: <CheckCircle2 size={16} /> },
  ]

  return (
    <div className="grid grid-cols-1 gap-3 mb-6 sm:grid-cols-3 sm:gap-4 sm:mb-8">
      {stats.map(s => (
        <Card key={s.label} className="p-4">
          <div className="flex items-start justify-between mb-3">
            <span className="text-[11px] text-[var(--color-text-muted)] uppercase tracking-wider font-medium">{s.label}</span>
            <div className="text-[var(--color-text-muted)]">{s.icon}</div>
          </div>
          <div className="text-2xl font-bold font-mono tracking-tight text-[var(--color-text-primary)]">{s.value}</div>
        </Card>
      ))}
    </div>
  )
}
