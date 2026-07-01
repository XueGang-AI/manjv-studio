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

export function Sidebar({ projectId: propProjectId }: SidebarProps) {
  const pathname = usePathname()
  const collapsed = false
  const [mobileOpen, setMobileOpen] = React.useState(false)
  const projectId = propProjectId || pathname.match(/\/projects\/([^/]+)/)?.[1]
  const isProjectWorkspace = Boolean(projectId && projectId !== 'new')
  const projectBase = projectId ? `/projects/${projectId}` : '/projects'
  const { finalPreviewHref, loading: episodeLoading } = usePrimaryEpisode(projectId, pathname)

  const projectNavItems: NavItem[] = [
    {
      label: '项目工作台',
      href: projectBase,
      icon: <Grid2X2 size={18} />,
      match: (path) => path === projectBase,
    },
    {
      label: '素材资产库',
      href: `${projectBase}/assets`,
      icon: <Boxes size={18} />,
      match: (path) => path.includes(`${projectBase}/assets`),
    },
    {
      label: '任务队列',
      href: `${projectBase}/tasks`,
      icon: <ListChecks size={18} />,
      match: (path) => path.includes(`${projectBase}/tasks`),
    },
    {
      label: 'QC 质检',
      href: `${projectBase}/qc`,
      icon: <ShieldCheck size={18} />,
      match: (path) => path.includes(`${projectBase}/qc`),
    },
    {
      label: '成片交付',
      href: finalPreviewHref,
      icon: <Truck size={18} />,
      match: (path) => path.includes('/final-preview'),
      disabledReason: episodeLoading ? '正在读取剧集信息' : '当前项目尚未创建剧集',
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
        aria-label="打开生产导航"
        className="fixed left-2 top-2 z-50 inline-flex h-10 w-10 items-center justify-center rounded-[var(--radius-md)] border border-[var(--color-border-default)] bg-[var(--bg-elevated)] text-[var(--color-text-primary)] shadow-[var(--shadow-panel)] md:hidden"
        title="打开生产导航"
      >
        <Menu size={20} />
      </button>

      {mobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
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
              {isProjectWorkspace ? (
                <div className="space-y-1">
                  <div className="mb-3 px-3 text-[10px] font-medium uppercase tracking-widest text-[var(--color-text-muted)]">
                    生产工作台
                  </div>
                  {projectNavItems.map((item) => renderNavItem(item, true))}
                </div>
              ) : (
                <Link
                  href="/projects"
                  onClick={() => setMobileOpen(false)}
                  className={cn(
                    'flex items-center gap-3 rounded-[var(--radius-md)] px-3 py-2.5 text-sm transition-colors',
                    pathname === '/projects'
                      ? 'bg-[var(--color-primary-muted)] text-[var(--color-primary-hover)]'
                      : 'text-[var(--color-text-secondary)] hover:bg-[var(--bg-panel)] hover:text-[var(--color-text-primary)]',
                  )}
                >
                  <Grid2X2 size={18} />
                  <span>项目列表</span>
                </Link>
              )}
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
          {isProjectWorkspace ? (
            <div className="space-y-2">
              {!collapsed && (
                <div className="mb-4 px-3 text-[10px] font-medium uppercase tracking-widest text-[var(--color-text-muted)]">
                  生产工作台
                </div>
              )}
              {projectNavItems.map((item) => renderNavItem(item))}
            </div>
          ) : (
            <div className="space-y-2">
              <Link
                href="/projects"
                className={cn(
                  'flex items-center gap-3 rounded-[var(--radius-md)] px-3 py-2.5 text-sm transition-colors',
                  pathname === '/projects'
                    ? 'bg-[var(--color-primary-muted)] text-[var(--color-primary-hover)]'
                    : 'text-[var(--color-text-secondary)] hover:bg-[var(--bg-panel)] hover:text-[var(--color-text-primary)]',
                  collapsed && 'justify-center px-2',
                )}
              >
                <Grid2X2 size={18} />
                {!collapsed && <span>项目列表</span>}
              </Link>
            </div>
          )}
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
