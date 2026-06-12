'use client'

import React from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import {
  LayoutDashboard, FileText, Users, Image as ImageIcon, Film, Video,
  Clapperboard, Package, ListTodo, Settings, FileCode,
  ChevronLeft, Check, Lock, Sparkles,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'

interface NavItem {
  label: string
  href: string
  icon: React.ReactNode
  step?: number
}

const mainNavItems: NavItem[] = [
  { label: '项目列表', href: '/projects', icon: <LayoutDashboard size={18} /> },
]

const projectSteps: NavItem[] = [
  { label: '项目信息', href: '', icon: <FileText size={18} />, step: 1 },
  { label: '故事方案', href: '/story', icon: <FileText size={18} />, step: 2 },
  { label: '角色设定', href: '/characters', icon: <Users size={18} />, step: 3 },
  { label: '角色图', href: '/character-images', icon: <ImageIcon size={18} />, step: 4 },
  { label: '分镜脚本', href: '/episodes/1/storyboard', icon: <Film size={18} />, step: 5 },
  { label: '分镜图', href: '/episodes/1/shot-images', icon: <ImageIcon size={18} />, step: 6 },
  { label: '视频片段', href: '/episodes/1/shot-videos', icon: <Video size={18} />, step: 7 },
  { label: '成片预览', href: '/episodes/1/final-preview', icon: <Clapperboard size={18} />, step: 8 },
  { label: '素材管理', href: '/assets', icon: <Package size={18} />, step: 9 },
  { label: '任务队列', href: '/tasks', icon: <ListTodo size={18} />, step: 10 },
]

const systemNavItems: NavItem[] = [
  { label: 'Prompt 模板', href: '/prompts', icon: <FileCode size={18} /> },
  { label: '模型设置', href: '/settings/models', icon: <Settings size={18} /> },
]

interface SidebarProps {
  projectId?: string
}

export function Sidebar({ projectId }: SidebarProps) {
  const pathname = usePathname()
  const [collapsed, setCollapsed] = React.useState(false)

  const isProjectPage = projectId && pathname.includes('/projects/')

  // Determine step states for visual treatment
  const getStepState = (stepIndex: number): 'completed' | 'active' | 'upcoming' => {
    // Simple heuristic: steps before current route are completed
    const currentStepIndex = projectSteps.findIndex((item) => {
      const href = projectId ? `/projects/${projectId}${item.href}` : ''
      return pathname === href
    })
    if (currentStepIndex === -1) return 'upcoming'
    if (stepIndex < currentStepIndex) return 'completed'
    if (stepIndex === currentStepIndex) return 'active'
    return 'upcoming'
  }

  return (
    <aside
      className={cn(
        'h-screen flex flex-col border-r border-[var(--color-border-dim)] transition-all duration-200',
        'bg-[var(--bg-surface)]',
        collapsed ? 'w-16' : 'w-60'
      )}
    >
      {/* Logo */}
      <div className="flex items-center justify-between h-14 px-4 border-b border-[var(--color-border-dim)]">
        {!collapsed && (
          <Link href="/projects" className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-[var(--radius-md)] flex items-center justify-center" style={{ background: 'var(--gradient-aurora)' }}>
              <Clapperboard size={16} className="text-white" />
            </div>
            <span className="font-bold text-[var(--color-text-primary)] tracking-tight text-[15px]">Manjv Studio</span>
            <Badge variant="primary">Beta</Badge>
          </Link>
        )}
        {collapsed && (
          <Link href="/projects" className="mx-auto">
            <div className="w-8 h-8 rounded-[var(--radius-md)] flex items-center justify-center" style={{ background: 'var(--gradient-aurora)' }}>
              <Clapperboard size={16} className="text-white" />
            </div>
          </Link>
        )}
        {!collapsed && (
          <button
            onClick={() => setCollapsed(true)}
            className="p-1.5 rounded-[var(--radius-sm)] hover:bg-[var(--bg-panel)] transition-colors text-[var(--color-text-muted)] cursor-pointer"
          >
            <ChevronLeft size={16} className="transition-transform duration-200" />
          </button>
        )}
      </div>

      {/* Expand button (collapsed state) */}
      {collapsed && (
        <div className="flex justify-center py-2 border-b border-[var(--color-border-dim)]">
          <button
            onClick={() => setCollapsed(false)}
            className="p-1.5 rounded-[var(--radius-sm)] hover:bg-[var(--bg-panel)] transition-colors text-[var(--color-text-muted)] cursor-pointer"
            title="展开侧栏"
          >
            <ChevronLeft size={16} className="rotate-180 transition-transform duration-200" />
          </button>
        </div>
      )}

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-3">
        {/* Main menu */}
        <div className="px-3 mb-4">
          {!collapsed && <div className="text-[10px] text-[var(--color-text-muted)] uppercase tracking-widest px-3 mb-2 font-medium">导航</div>}
          {mainNavItems.map((item) => {
            const isActive = pathname === item.href
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'flex items-center gap-3 px-3 py-2 rounded-[var(--radius-md)] text-sm transition-colors mb-0.5',
                  isActive
                    ? 'bg-[var(--color-primary-muted)] text-[var(--color-primary)]'
                    : 'text-[var(--color-text-secondary)] hover:bg-[var(--bg-panel)] hover:text-[var(--color-text-primary)]'
                )}
                title={collapsed ? item.label : undefined}
              >
                {item.icon}
                {!collapsed && <span>{item.label}</span>}
              </Link>
            )
          })}
        </div>

        {/* Project steps (only when inside a project) */}
        {isProjectPage && projectId && (
          <div className="px-3 mb-4">
            {!collapsed && (
              <div className="text-[10px] text-[var(--color-text-muted)] uppercase tracking-widest px-3 mb-2 font-medium">创作流程</div>
            )}
            {projectSteps.map((item, index) => {
              const href = `/projects/${projectId}${item.href}`
              const isActive = pathname === href
              const stepState = getStepState(index)
              const isCompleted = stepState === 'completed'
              const isLocked = stepState === 'upcoming' && !isActive

              return (
                <Link
                  key={item.label}
                  href={href}
                  className={cn(
                    'flex items-center gap-3 px-3 py-2 rounded-[var(--radius-md)] text-sm transition-colors mb-0.5',
                    isActive && !isCompleted && 'bg-[var(--color-primary-muted)] text-[var(--color-primary)]',
                    isCompleted && !isActive && 'text-[var(--color-success)]',
                    !isActive && !isCompleted && !isLocked && 'text-[var(--color-text-secondary)] hover:bg-[var(--bg-panel)] hover:text-[var(--color-text-primary)]',
                    isLocked && 'text-[var(--color-text-muted)] opacity-50'
                  )}
                  title={collapsed ? item.label : undefined}
                >
                  <span className={cn(
                    'flex items-center justify-center w-6 h-6 rounded-full text-[10px] font-bold transition-all shrink-0',
                    isActive && !isCompleted && 'aurora-dot text-white',
                    isCompleted && 'bg-[var(--color-success)] text-white',
                    !isActive && !isCompleted && !isLocked && 'bg-[var(--bg-panel)] text-[var(--color-text-muted)]',
                    isLocked && 'bg-[var(--bg-panel)] text-[var(--color-text-muted)]'
                  )}>
                    {isCompleted ? <Check size={12} /> : isLocked ? <Lock size={10} /> : item.step}
                  </span>
                  {!collapsed && (
                    <span className={cn(
                      isActive && !isCompleted && 'aurora-text',
                      isActive && !isCompleted && 'font-semibold'
                    )} style={isActive && !isCompleted ? { background: 'var(--gradient-aurora)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' } : {}}>
                      {item.label}
                    </span>
                  )}
                </Link>
              )
            })}
          </div>
        )}

        {/* System menu */}
        <div className="px-3 mt-auto">
          {!collapsed && <div className="text-[10px] text-[var(--color-text-muted)] uppercase tracking-widest px-3 mb-2 mt-4 font-medium">系统</div>}
          {systemNavItems.map((item) => {
            const isActive = pathname === item.href
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'flex items-center gap-3 px-3 py-2 rounded-[var(--radius-md)] text-sm transition-colors mb-0.5',
                  isActive
                    ? 'bg-[var(--color-primary-muted)] text-[var(--color-primary)]'
                    : 'text-[var(--color-text-secondary)] hover:bg-[var(--bg-panel)] hover:text-[var(--color-text-primary)]'
                )}
                title={collapsed ? item.label : undefined}
              >
                {item.icon}
                {!collapsed && <span>{item.label}</span>}
              </Link>
            )
          })}
        </div>
      </nav>

      {/* Footer */}
      {!collapsed && (
        <div className="px-4 py-3 border-t border-[var(--color-border-dim)]">
          <div className="flex items-center gap-2">
            <Sparkles size={10} className="text-[var(--color-accent-cyan)]" />
            <span className="text-[10px] text-[var(--color-text-muted)]">Manjv Studio v0.1.0</span>
          </div>
        </div>
      )}
    </aside>
  )
}
