'use client'

import React from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import {
  Boxes,
  Clapperboard,
  Grid2X2,
  ListChecks,
  PanelLeftClose,
  PanelLeftOpen,
  ShieldCheck,
  Sparkles,
  Truck,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'

interface NavItem {
  label: string
  href: string
  icon: React.ReactNode
  match: (pathname: string) => boolean
}

interface SidebarProps {
  projectId?: string
}

export function Sidebar({ projectId: propProjectId }: SidebarProps) {
  const pathname = usePathname()
  const [collapsed, setCollapsed] = React.useState(false)
  const projectId = propProjectId || pathname.match(/\/projects\/([^/]+)/)?.[1]
  const isProjectWorkspace = Boolean(projectId && projectId !== 'new')
  const projectBase = projectId ? `/projects/${projectId}` : '/projects'

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
      href: `${projectBase}/episodes/1/final-preview`,
      icon: <Truck size={18} />,
      match: (path) => path.includes('/final-preview'),
    },
  ]

  return (
    <aside
      className={cn(
        'flex h-screen flex-col border-r border-[var(--color-border-dim)] bg-[var(--bg-sidebar)] transition-all duration-200',
        collapsed ? 'w-16' : 'w-60',
      )}
    >
      <div className="flex h-14 items-center justify-between border-b border-[var(--color-border-dim)] px-3">
        <Link href="/projects" className={cn('flex min-w-0 items-center gap-2.5', collapsed && 'mx-auto')}>
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[var(--radius-md)]" style={{ background: 'var(--gradient-aurora)' }}>
            <Clapperboard size={16} className="text-white" />
          </div>
          {!collapsed && (
            <>
              <span className="truncate text-[15px] font-bold tracking-tight text-[var(--color-text-primary)]">Manjv Studio</span>
              <Badge variant="primary" className="px-1.5 py-0.5 text-[10px]">Beta</Badge>
            </>
          )}
        </Link>
        {!collapsed && (
          <button
            onClick={() => setCollapsed(true)}
            className="rounded-[var(--radius-sm)] p-1.5 text-[var(--color-text-muted)] transition-colors hover:bg-[var(--bg-panel)]"
            title="收起侧栏"
          >
            <PanelLeftClose size={16} />
          </button>
        )}
      </div>

      {collapsed && (
        <div className="flex justify-center border-b border-[var(--color-border-dim)] py-2">
          <button
            onClick={() => setCollapsed(false)}
            className="rounded-[var(--radius-sm)] p-1.5 text-[var(--color-text-muted)] transition-colors hover:bg-[var(--bg-panel)]"
            title="展开侧栏"
          >
            <PanelLeftOpen size={16} />
          </button>
        </div>
      )}

      <nav className="flex-1 overflow-y-auto px-3 py-4">
        {isProjectWorkspace ? (
          <div className="space-y-1">
            {!collapsed && (
              <div className="mb-3 px-3 text-[10px] font-medium uppercase tracking-widest text-[var(--color-text-muted)]">
                生产工作台
              </div>
            )}
            {projectNavItems.map((item) => {
              const active = item.match(pathname)
              return (
                <Link
                  key={item.label}
                  href={item.href}
                  title={collapsed ? item.label : undefined}
                  className={cn(
                    'flex items-center gap-3 rounded-[var(--radius-md)] px-3 py-2.5 text-sm transition-colors',
                    active
                      ? 'bg-[var(--color-primary-muted)] text-[var(--color-primary-hover)]'
                      : 'text-[var(--color-text-secondary)] hover:bg-[var(--bg-panel)] hover:text-[var(--color-text-primary)]',
                    collapsed && 'justify-center px-2',
                  )}
                >
                  {item.icon}
                  {!collapsed && <span>{item.label}</span>}
                </Link>
              )
            })}
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
        <div className="border-t border-[var(--color-border-dim)] px-4 py-3">
          <div className="flex items-center gap-2 text-[10px] text-[var(--color-text-muted)]">
            <Sparkles size={11} className="text-[var(--color-accent-cyan)]" />
            <span>真实生产链路 · Ark / Worker / FFmpeg</span>
          </div>
        </div>
      )}
    </aside>
  )
}
