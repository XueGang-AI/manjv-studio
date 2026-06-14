'use client'

import React from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Plus, FolderOpen, SearchX } from 'lucide-react'

interface ProjectsEmptyStateProps {
  type: 'no-projects' | 'no-results'
  onClearFilters?: () => void
}

export function ProjectsEmptyState({ type, onClearFilters }: ProjectsEmptyStateProps) {
  if (type === 'no-projects') {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <div className="w-16 h-16 rounded-[var(--radius-xl)] bg-[var(--color-primary-muted)] flex items-center justify-center mb-5 text-[var(--color-primary)]">
          <FolderOpen size={28} />
        </div>
        <h3 className="text-lg font-semibold text-[var(--color-text-primary)] mb-2">还没有项目</h3>
        <p className="text-sm text-[var(--color-text-muted)] max-w-sm mb-6">
          创建你的第一个 AI 漫剧项目，开始创作之旅
        </p>
        <Link href="/projects/new">
          <Button variant="aurora" size="sm" icon={<Plus size={14} />}>新建项目</Button>
        </Link>
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="w-16 h-16 rounded-[var(--radius-xl)] bg-[var(--bg-panel)] flex items-center justify-center mb-5 text-[var(--color-text-muted)]">
        <SearchX size={28} />
      </div>
      <h3 className="text-lg font-semibold text-[var(--color-text-primary)] mb-2">没有匹配的项目</h3>
      <p className="text-sm text-[var(--color-text-muted)] max-w-sm mb-6">
        调整筛选条件，或清除筛选查看所有项目
      </p>
      {onClearFilters && (
        <Button variant="outline" size="sm" onClick={onClearFilters}>
          清除筛选
        </Button>
      )}
    </div>
  )
}
