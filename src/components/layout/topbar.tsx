'use client'

import React from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { ChevronRight, Search, Bell, Settings } from 'lucide-react'
import { useToast } from '@/components/ui/toast'

interface BreadcrumbItem {
  label: string
  href?: string
}

const BREADCRUMB_LABELS: Record<string, string> = {
  projects: '项目',
  story: '故事方案',
  characters: '角色设定',
  'character-images': '角色图',
  episodes: '剧集',
  storyboard: '分镜脚本',
  'shot-images': '分镜图',
  'shot-videos': '视频片段',
  'final-preview': '成片预览',
  assets: '素材管理',
  tasks: '任务队列',
  versions: '版本管理',
  qc: '质量检查',
  settings: '设置',
  models: '模型配置',
  prompts: 'Prompt 模板',
  new: '新建',
}

export function TopBar() {
  const pathname = usePathname()
  const breadcrumbs = generateBreadcrumbs(pathname)
  const { addToast } = useToast()

  const handleNotReady = (feature: string) => {
    addToast({ type: 'info', title: `${feature}功能开发中`, description: '即将上线，敬请期待' })
  }

  return (
    <header className="h-14 border-b border-[var(--color-border-dim)] bg-[var(--bg-surface)]/80 backdrop-blur-md flex items-center px-6 gap-4 shrink-0">
      {/* Breadcrumbs */}
      <nav className="flex items-center gap-2 text-sm">
        {breadcrumbs.map((item, index) => (
          <React.Fragment key={index}>
            {index > 0 && <ChevronRight size={14} className="text-[var(--color-text-muted)]" />}
            {item.href ? (
              <Link href={item.href} className="text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-colors">
                {item.label}
              </Link>
            ) : (
              <span className={cn(
                index === breadcrumbs.length - 1
                  ? 'text-[var(--color-text-primary)] font-medium'
                  : 'text-[var(--color-text-muted)]'
              )}>
                {item.label}
              </span>
            )}
          </React.Fragment>
        ))}
      </nav>

      {/* Right actions */}
      <div className="ml-auto flex items-center gap-1">
        {/* Search */}
        <button
          onClick={() => handleNotReady('全局搜索')}
          className="flex items-center gap-2 px-3 py-1.5 rounded-[var(--radius-md)] text-sm text-[var(--color-text-muted)] hover:bg-[var(--bg-panel)] hover:text-[var(--color-text-secondary)] transition-colors cursor-pointer"
          title="搜索 (⌘K)"
        >
          <Search size={15} />
          <span className="hidden lg:inline">搜索</span>
          <kbd className="hidden lg:inline text-[10px] bg-[var(--bg-panel)] px-1.5 py-0.5 rounded font-mono">⌘K</kbd>
        </button>

        {/* Notifications */}
        <button
          onClick={() => handleNotReady('通知中心')}
          className="relative p-2 rounded-[var(--radius-md)] hover:bg-[var(--bg-panel)] transition-colors text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)] cursor-pointer"
          title="通知"
        >
          <Bell size={16} />
        </button>

        {/* Settings shortcut */}
        <Link
          href="/settings/models"
          className="p-2 rounded-[var(--radius-md)] hover:bg-[var(--bg-panel)] transition-colors text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]"
          title="模型设置"
        >
          <Settings size={16} />
        </Link>

        {/* User */}
        <button
          onClick={() => handleNotReady('用户菜单')}
          className="flex items-center gap-2 px-2 py-1.5 rounded-[var(--radius-md)] hover:bg-[var(--bg-panel)] transition-colors cursor-pointer"
        >
          <div className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold" style={{ background: 'var(--gradient-aurora)' }}>
            U
          </div>
          <span className="text-sm text-[var(--color-text-secondary)] hidden lg:block">管理员</span>
        </button>
      </div>
    </header>
  )
}

function generateBreadcrumbs(pathname: string): BreadcrumbItem[] {
  const segments = pathname.split('/').filter(Boolean)
  if (segments.length === 0) return [{ label: '首页', href: '/' }]

  const crumbs: BreadcrumbItem[] = []
  let currentPath = ''

  for (const segment of segments) {
    currentPath += `/${segment}`
    // Skip UUIDs in breadcrumbs
    if (isUUID(segment)) {
      // Show project name placeholder for project IDs
      if (crumbs.length > 0 && crumbs[crumbs.length - 1]?.label === '项目') {
        crumbs[crumbs.length - 1].href = currentPath
      }
      continue
    }
    const label = BREADCRUMB_LABELS[segment] || segment
    crumbs.push({
      label: label.length > 16 ? label.slice(0, 16) + '…' : label,
      href: currentPath,
    })
  }

  return crumbs
}

function isUUID(str: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str)
}
