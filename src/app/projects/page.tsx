'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useToast } from '@/components/ui/toast'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { ProjectsHeader } from '@/components/projects/projects-header'
import { ProjectStats } from '@/components/projects/project-stats'
import { ProjectFilters, type FilterStatus, type SortBy } from '@/components/projects/project-filters'
import { ProjectCardV3 } from '@/components/projects/project-card'
import { ProjectsEmptyState } from '@/components/projects/projects-empty-state'
import type { ProjectListItem } from '@/lib/types'

function getStatusCategory(status: string): 'draft' | 'active' | 'completed' | 'failed' {
  if (status === 'DRAFT') return 'draft'
  if (status === 'FINAL_CONFIRMED' || status === 'RENDERED') return 'completed'
  if (status === 'FAILED') return 'failed'
  return 'active'
}

export default function ProjectsPage() {
  const [projects, setProjects] = useState<ProjectListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Filters
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<FilterStatus>('all')
  const [sortBy, setSortBy] = useState<SortBy>('updatedAt')

  // Delete
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null)
  const [deleting, setDeleting] = useState(false)

  const { addToast } = useToast()

  const fetchProjects = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/projects')
      const data = await res.json()
      if (data.success) {
        setProjects(data.data || [])
      } else {
        setError(data.error || '获取项目列表失败')
      }
    } catch {
      setError('网络错误，请检查网络连接后重试')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      setError(null)
      try {
        const res = await fetch('/api/projects')
        const data = await res.json()
        if (cancelled) return
        if (data.success) {
          setProjects(data.data || [])
        } else {
          setError(data.error || '获取项目列表失败')
        }
      } catch {
        if (!cancelled) setError('网络错误，请检查网络连接后重试')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [])

  // Delete handler
  const handleDelete = useCallback(async () => {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      const res = await fetch(`/api/projects/${deleteTarget.id}`, { method: 'DELETE' })
      const data = await res.json()
      if (data.success) {
        setProjects(prev => prev.filter(p => p.id !== deleteTarget.id))
        setDeleteTarget(null)
        addToast({ type: 'success', title: `项目「${deleteTarget.name}」已删除` })
      } else {
        addToast({ type: 'error', title: '删除失败', description: data.error || '请稍后重试' })
      }
    } catch {
      addToast({ type: 'error', title: '删除失败', description: '网络错误，请检查连接后重试' })
    } finally {
      setDeleting(false)
    }
  }, [deleteTarget, addToast])

  // Filter & sort
  const filtered = useMemo(() => {
    let result = [...projects]

    // Search
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      result = result.filter(p =>
        p.projectName.toLowerCase().includes(q) ||
        (p.storyType?.toLowerCase().includes(q)) ||
        (p.artStyle?.toLowerCase().includes(q))
      )
    }

    // Status filter
    if (filter !== 'all') {
      result = result.filter(p => getStatusCategory(p.status) === filter)
    }

    // Sort
    result.sort((a, b) => {
      switch (sortBy) {
        case 'updatedAt':
          return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
        case 'createdAt':
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        case 'projectName':
          return a.projectName.localeCompare(b.projectName, 'zh-CN')
        default:
          return 0
      }
    })

    return result
  }, [projects, search, filter, sortBy])

  const clearFilters = useCallback(() => {
    setSearch('')
    setFilter('all')
    setSortBy('updatedAt')
  }, [])

  // Handle retry from error state
  if (error && !loading && projects.length === 0) {
    return (
      <div className="p-6 max-w-[1400px] mx-auto">
        <ProjectsHeader projectCount={0} />
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="w-16 h-16 rounded-[var(--radius-xl)] bg-[var(--color-danger-muted)] flex items-center justify-center mb-5 text-[var(--color-danger)]">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
          </div>
          <h3 className="text-lg font-semibold text-[var(--color-text-primary)] mb-2">加载失败</h3>
          <p className="text-sm text-[var(--color-text-muted)] max-w-sm mb-6">{error}</p>
          <button
            onClick={fetchProjects}
            className="px-4 py-2 bg-[var(--color-primary)] text-white rounded-[var(--radius-md)] text-sm font-medium hover:bg-[var(--color-primary-hover)] transition-colors cursor-pointer"
          >
            重试
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 max-w-[1400px] mx-auto">
      <ProjectsHeader projectCount={projects.length} />

      {projects.length > 0 && (
        <>
          <ProjectStats projects={projects} />

          <ProjectFilters
            search={search}
            onSearchChange={setSearch}
            filter={filter}
            onFilterChange={setFilter}
            sortBy={sortBy}
            onSortByChange={setSortBy}
            resultCount={filtered.length}
          />
        </>
      )}

      {loading ? (
        // Skeleton handled by loading.tsx for initial load,
        // but also show inline for refresh
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5, 6].map(i => (
            <div key={i} className="bg-[var(--bg-elevated)] border border-[var(--color-border-dim)] rounded-[var(--radius-lg)] overflow-hidden animate-pulse">
              <div className="h-32 bg-[var(--bg-panel)]" />
              <div className="p-4 space-y-3">
                <div className="flex gap-1.5">
                  <div className="h-5 w-12 bg-[var(--bg-panel)] rounded" />
                  <div className="h-5 w-16 bg-[var(--bg-panel)] rounded" />
                </div>
                <div className="h-4 w-full bg-[var(--bg-panel)] rounded" />
                <div className="h-1.5 w-full bg-[var(--bg-panel)] rounded-full" />
                <div className="h-4 w-24 bg-[var(--bg-panel)] rounded" />
              </div>
            </div>
          ))}
        </div>
      ) : projects.length === 0 ? (
        <ProjectsEmptyState type="no-projects" />
      ) : filtered.length === 0 ? (
        <ProjectsEmptyState type="no-results" onClearFilters={clearFilters} />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(project => (
            <ProjectCardV3
              key={project.id}
              project={project}
              onDelete={(id, name) => setDeleteTarget({ id, name })}
            />
          ))}
        </div>
      )}

      {/* Delete confirmation */}
      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => { if (!open) setDeleteTarget(null) }}
        variant="danger"
        title="确认删除项目"
        description={deleteTarget ? `此操作将永久删除项目「${deleteTarget.name}」及其所有关联数据（故事方案、角色、分镜、图片、视频等），无法恢复。` : ''}
        confirmLabel={deleting ? '删除中…' : '确认删除'}
        loading={deleting}
        onConfirm={handleDelete}
      />
    </div>
  )
}
