'use client'

import React, { useState, useCallback } from 'react'
import { Search, X } from 'lucide-react'
import { cn } from '@/lib/utils'

export type FilterStatus = 'all' | 'active' | 'completed' | 'draft'
export type SortBy = 'updatedAt' | 'createdAt' | 'projectName'

interface ProjectFiltersProps {
  search: string
  onSearchChange: (value: string) => void
  filter: FilterStatus
  onFilterChange: (value: FilterStatus) => void
  sortBy: SortBy
  onSortByChange: (value: SortBy) => void
  resultCount: number
}

const FILTER_OPTIONS: { key: FilterStatus; label: string }[] = [
  { key: 'all', label: '全部' },
  { key: 'active', label: '进行中' },
  { key: 'completed', label: '已完成' },
  { key: 'draft', label: '草稿' },
]

const SORT_OPTIONS: { key: SortBy; label: string }[] = [
  { key: 'updatedAt', label: '最近更新' },
  { key: 'createdAt', label: '创建时间' },
  { key: 'projectName', label: '名称' },
]

export function ProjectFilters({
  search,
  onSearchChange,
  filter,
  onFilterChange,
  sortBy,
  onSortByChange,
  resultCount,
}: ProjectFiltersProps) {
  const [searchFocused, setSearchFocused] = useState(false)

  const hasActiveFilters = search || filter !== 'all' || sortBy !== 'updatedAt'

  const clearFilters = useCallback(() => {
    onSearchChange('')
    onFilterChange('all')
    onSortByChange('updatedAt')
  }, [onSearchChange, onFilterChange, onSortByChange])

  return (
    <div className="mb-6 space-y-3">
      <div className="flex flex-col sm:flex-row gap-3">
        {/* Search */}
        <div className={cn(
          'flex items-center gap-2 flex-1 h-10 px-3 bg-[var(--bg-elevated)] border rounded-[var(--radius-md)] transition-colors',
          searchFocused ? 'border-[var(--color-border-bright)]' : 'border-[var(--color-border-dim)]'
        )}>
          <Search size={14} className="text-[var(--color-text-muted)] shrink-0" />
          <input
            type="text"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            onFocus={() => setSearchFocused(true)}
            onBlur={() => setSearchFocused(false)}
            placeholder="搜索项目名称…"
            aria-label="搜索项目"
            className="flex-1 bg-transparent text-sm text-[var(--color-text-primary)] placeholder-[var(--color-text-muted)] outline-none"
          />
          {search && (
            <button
              onClick={() => onSearchChange('')}
              className="text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] cursor-pointer"
              aria-label="清除搜索"
            >
              <X size={14} />
            </button>
          )}
        </div>

        {/* Sort */}
        <div className="flex items-center gap-1 bg-[var(--bg-elevated)] border border-[var(--color-border-dim)] rounded-[var(--radius-md)] p-1 shrink-0">
          {SORT_OPTIONS.map(opt => (
            <button
              key={opt.key}
              onClick={() => onSortByChange(opt.key)}
              className={cn(
                'px-3 py-1.5 rounded-[var(--radius-sm)] text-xs font-medium transition-all cursor-pointer',
                sortBy === opt.key
                  ? 'bg-[var(--color-primary)] text-white'
                  : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]'
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-between">
        {/* Status filter */}
        <div className="flex items-center gap-1 bg-[var(--bg-elevated)] border border-[var(--color-border-dim)] rounded-[var(--radius-md)] p-1">
          {FILTER_OPTIONS.map(opt => (
            <button
              key={opt.key}
              onClick={() => onFilterChange(opt.key)}
              className={cn(
                'px-3 py-1.5 rounded-[var(--radius-sm)] text-xs font-medium transition-all cursor-pointer',
                filter === opt.key
                  ? 'bg-[var(--color-primary)] text-white'
                  : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]'
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-3">
          <span className="text-xs text-[var(--color-text-muted)]">{resultCount} 个结果</span>
          {hasActiveFilters && (
            <button
              onClick={clearFilters}
              className="text-xs text-[var(--color-primary)] hover:text-[var(--color-primary-hover)] cursor-pointer transition-colors"
            >
              清除筛选
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
