'use client'

import React from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import {
  Boxes,
  Grid2X2,
  ListChecks,
  Menu,
  ShieldCheck,
  Sparkles,
  Truck,
  X,
} from 'lucide-react'
import { usePrimaryEpisode } from '@/components/layout/use-primary-episode'

interface NavItem {
  label: string
  href?: string
  icon: React.ReactNode
  match: (pathname: string) => boolean
  disabledReason?: string
}

interface SidebarProps {
  projectId?: string
}

interface ProjectListResponse {
  success?: boolean
  data?: Array<{ id: string }>
}

function useLatestProjectId(enabled: boolean) {
  const [state, setState] = React.useState<{ projectId?: string; resolved: boolean }>({ resolved: false })

  React.useEffect(() => {
    if (!enabled) return

    const controller = new AbortController()

    fetch('/api/projects', { signal: controller.signal })
      .then((res) => res.json() as Promise<ProjectListResponse>)
      .then((payload) => {
        if (controller.signal.aborted) return
        const latestProjectId = payload.success ? payload.data?.[0]?.id : undefined
        setState({ projectId: latestProjectId, resolved: true })
      })
      .catch((err) => {
        if (err instanceof DOMException && err.name === 'AbortError') return
        setState({ resolved: true })
      })

    return () => controller.abort()
  }, [enabled])

  return {
    projectId: enabled ? state.projectId : undefined,
    loading: enabled && !state.resolved,
  }
}

export function Sidebar({ projectId: propProjectId }: SidebarProps) {
  const pathname = usePathname()
  const collapsed = false
  const [mobileOpen, setMobileOpen] = React.useState(false)
  const routeProjectId = propProjectId || pathname.match(/\/projects\/([^/]+)/)?.[1]
  const shouldUseLatestProject = !routeProjectId && pathname === '/projects'
  const { projectId: latestProjectId, loading: latestProjectLoading } = useLatestProjectId(shouldUseLatestProject)
  const projectId = routeProjectId || latestProjectId
  const hasProjectContext = Boolean(projectId && projectId !== 'new')
  const projectBase = hasProjectContext ? `/projects/${projectId}` : '/projects'
  const { finalPreviewHref, loading: episodeLoading } = usePrimaryEpisode(hasProjectContext ? projectId : undefined, pathname)
  const missingProjectReason = latestProjectLoading ? '正在读取最近项目' : '当前没有可用项目'

  const projectNavItems: NavItem[] = [
    {
      label: '项目列表',
      href: '/projects',
      icon: <Grid2X2 size={18} />,
      match: (path) => path === '/projects',
    },
    {
      label: '项目工作台',
      href: hasProjectContext ? projectBase : undefined,
      icon: <Grid2X2 size={18} />,
      match: (path) => path === projectBase,
      disabledReason: missingProjectReason,
    },
    {
      label: '素材资产库',
      href: hasProjectContext ? `${projectBase}/assets` : undefined,
      icon: <Boxes size={18} />,
      match: (path) => path.includes(`${projectBase}/assets`),
      disabledReason: missingProjectReason,
    },
    {
      label: '任务队列',
      href: hasProjectContext ? `${projectBase}/tasks` : undefined,
      icon: <ListChecks size={18} />,
      match: (path) => path.includes(`${projectBase}/tasks`),
      disabledReason: missingProjectReason,
    },
    {
      label: 'QC 质检',
      href: hasProjectContext ? `${projectBase}/qc` : undefined,
      icon: <ShieldCheck size={18} />,
      match: (path) => path.includes(`${projectBase}/qc`),
      disabledReason: missingProjectReason,
    },
    {
      label: '成片交付',
      href: finalPreviewHref,
      icon: <Truck size={18} />,
      match: (path) => path.includes('/final-preview'),
      disabledReason: hasProjectContext
        ? (episodeLoading ? '正在读取剧集信息' : '当前项目尚未创建剧集')
        : missingProjectReason,
    },
  ]

  const renderNavItem = (item: NavItem, mobile = false) => {
    const active = item.match(pathname)
    const className = cn(
      'flex w-full items-center gap-3 rounded-[var(--radius-md)] px-3 py-3 text-sm transition-all duration-200',
      active
        ? 'bg-[var(--gradient-aurora)] text-white shadow-[var(--glow-primary)]'
        : 'text-[var(--color-text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--color-text-primary)]',
      collapsed && !mobile && 'justify-center px-2',
      !item.href && 'cursor-not-allowed opacity-45 hover:bg-transparent hover:text-[var(--color-text-secondary)]',
    )

    if (!item.href) {
      return (
        <button key={item.label} type="button" disabled title={item.disabledReason} className={className}>
          {item.icon}
          {(!collapsed || mobile) && <span>{item.label}</span>}
        </button>
      )
    }

    return (
      <Link
        key={item.label}
        href={item.href}
        title={collapsed && !mobile ? item.label : undefined}
        onClick={mobile ? () => setMobileOpen(false) : undefined}
        className={className}
      >
        {item.icon}
        {(!collapsed || mobile) && <span>{item.label}</span>}
      </Link>
    )
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setMobileOpen(true)}
        onPointerUp={() => setMobileOpen(true)}
        aria-label="打开生产导航"
        aria-expanded={mobileOpen}
        className="fixed left-2 top-2 z-50 inline-flex h-10 w-10 items-center justify-center rounded-[var(--radius-md)] border border-[var(--color-border-default)] bg-[var(--bg-elevated)] text-[var(--color-text-primary)] shadow-[var(--shadow-panel)] md:hidden"
        title="打开生产导航"
      >
        <Menu size={20} />
      </button>

      {mobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden" role="dialog" aria-modal="true" aria-label="生产导航">
          <button
            type="button"
            aria-label="关闭生产导航"
            className="absolute inset-0 bg-black/55"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="relative flex h-full w-[min(320px,calc(100vw-32px))] flex-col border-r border-[var(--color-border-dim)] bg-[var(--bg-sidebar)] shadow-[var(--shadow-panel)]">
            <div className="flex h-14 items-center justify-between border-b border-[var(--color-border-dim)] px-4">
              <Link href="/projects" onClick={() => setMobileOpen(false)} className="flex min-w-0 items-center gap-2.5">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[var(--radius-md)] bg-[var(--gradient-aurora)] shadow-[var(--glow-primary)]">
                  <Sparkles size={16} className="text-white" />
                </div>
                <span className="truncate text-[15px] font-bold tracking-tight text-[var(--color-text-primary)]">Manjv Studio</span>
              </Link>
              <button
                onClick={() => setMobileOpen(false)}
                className="rounded-[var(--radius-sm)] p-1.5 text-[var(--color-text-muted)] transition-colors hover:bg-[var(--bg-panel)]"
                title="关闭导航"
              >
                <X size={17} />
              </button>
            </div>
            <nav className="flex-1 overflow-y-auto px-3 py-4">
              <div className="space-y-1">
                <div className="mb-3 px-3 text-[10px] font-medium uppercase tracking-widest text-[var(--color-text-muted)]">
                  生产工作台
                </div>
                {projectNavItems.map((item) => renderNavItem(item, true))}
              </div>
            </nav>
          </aside>
        </div>
      )}

      <aside
        className={cn(
          'hidden h-screen flex-col border-r border-[var(--color-border-dim)] bg-[var(--bg-sidebar)] transition-all duration-200 md:flex',
          collapsed ? 'w-16' : 'w-[180px]',
        )}
      >
        <div className="flex h-14 items-center justify-between border-b border-[var(--color-border-dim)] px-3">
          <Link href="/projects" className={cn('flex min-w-0 items-center gap-2.5', collapsed && 'mx-auto')}>
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[var(--radius-md)] bg-[var(--gradient-aurora)] shadow-[var(--glow-primary)]">
              <Sparkles size={16} className="text-white" />
            </div>
            {!collapsed && (
              <span className="truncate text-[15px] font-bold tracking-tight text-[var(--color-text-primary)]">Manjv Studio</span>
            )}
          </Link>
          {!collapsed && <div className="h-6 w-1" />}
        </div>

        <nav className="flex-1 overflow-y-auto px-2 py-7">
          <div className="space-y-2">
            {!collapsed && (
              <div className="mb-4 px-3 text-[10px] font-medium uppercase tracking-widest text-[var(--color-text-muted)]">
                生产工作台
              </div>
            )}
            {projectNavItems.map((item) => renderNavItem(item))}
          </div>
        </nav>

        {!collapsed && (
          <div className="border-t border-[var(--color-border-dim)] p-3">
            <div className="rounded-[var(--radius-md)] border border-[var(--color-border-dim)] bg-[var(--bg-panel)] p-3">
              <div className="flex items-center gap-2 text-xs font-medium text-[var(--color-text-secondary)]">
                <Sparkles size={13} className="text-[var(--color-primary-hover)]" />
                <span>生产链路</span>
              </div>
              <div className="mt-2 text-[10px] leading-4 text-[var(--color-text-muted)]">Ark / Worker / FFmpeg</div>
            </div>
          </div>
        )}
      </aside>
    </>
  )
}
