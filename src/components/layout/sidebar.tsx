'use client'

import React from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import {
  LayoutDashboard,
  FileText,
  Users,
  Image,
  Film,
  Video,
  Clapperboard,
  Package,
  ListTodo,
  FileCode,
  Settings,
  ChevronLeft,
} from 'lucide-react'

interface NavItem {
  label: string
  href: string
  icon: React.ReactNode
  step?: number
}

const mainNavItems: NavItem[] = [
  { label: '项目列表', href: '/projects', icon: <LayoutDashboard size={20} /> },
]

const projectSteps: NavItem[] = [
  { label: '项目信息', href: '', icon: <FileText size={20} />, step: 1 },
  { label: '故事方案', href: '/story', icon: <FileText size={20} />, step: 2 },
  { label: '角色设定', href: '/characters', icon: <Users size={20} />, step: 3 },
  { label: '角色图', href: '/character-images', icon: <Image size={20} />, step: 4 },
  { label: '分镜脚本', href: '/episodes/1/storyboard', icon: <Film size={20} />, step: 5 },
  { label: '分镜图', href: '/episodes/1/shot-images', icon: <Image size={20} />, step: 6 },
  { label: '视频片段', href: '/episodes/1/shot-videos', icon: <Video size={20} />, step: 7 },
  { label: '成片预览', href: '/episodes/1/final-preview', icon: <Clapperboard size={20} />, step: 8 },
  { label: '素材管理', href: '/assets', icon: <Package size={20} />, step: 9 },
  { label: '任务队列', href: '/tasks', icon: <ListTodo size={20} />, step: 10 },
]

const systemNavItems: NavItem[] = [
  { label: 'Prompt 模板', href: '/prompts', icon: <FileCode size={20} /> },
  { label: '模型设置', href: '/settings/models', icon: <Settings size={20} /> },
]

interface SidebarProps {
  projectId?: string
}

export function Sidebar({ projectId }: SidebarProps) {
  const pathname = usePathname()
  const [collapsed, setCollapsed] = React.useState(false)

  const isProjectPage = projectId && pathname.includes('/projects/')

  return (
    <aside
      className={cn(
        'h-screen bg-gray-900 text-white flex flex-col border-r border-gray-800 transition-all duration-200',
        collapsed ? 'w-16' : 'w-64'
      )}
    >
      {/* Logo */}
      <div className="flex items-center justify-between h-14 px-4 border-b border-gray-800">
        {!collapsed && (
          <Link href="/projects" className="text-lg font-bold tracking-tight">
            🎬 漫剧工作台
          </Link>
        )}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="p-1.5 rounded-md hover:bg-gray-800 transition-colors"
        >
          <ChevronLeft size={18} className={cn('transition-transform', collapsed && 'rotate-180')} />
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-2">
        {/* 主菜单 */}
        <div className="px-3 mb-4">
          {!collapsed && <div className="text-xs text-gray-500 uppercase tracking-wider px-2 mb-1">主菜单</div>}
          {mainNavItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors mb-0.5',
                pathname === item.href ? 'bg-indigo-600 text-white' : 'text-gray-300 hover:bg-gray-800'
              )}
            >
              {item.icon}
              {!collapsed && <span>{item.label}</span>}
            </Link>
          ))}
        </div>

        {/* 项目步骤（仅在项目页面显示） */}
        {isProjectPage && projectId && (
          <div className="px-3 mb-4">
            {!collapsed && (
              <div className="text-xs text-gray-500 uppercase tracking-wider px-2 mb-1">创作流程</div>
            )}
            {projectSteps.map((item) => {
              const href = `/projects/${projectId}${item.href}`
              const isActive = pathname === href
              return (
                <Link
                  key={item.label}
                  href={href}
                  className={cn(
                    'flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors mb-0.5',
                    isActive ? 'bg-indigo-600 text-white' : 'text-gray-300 hover:bg-gray-800'
                  )}
                >
                  <span className="flex items-center justify-center w-5 h-5 rounded-full bg-gray-700 text-xs font-bold">
                    {item.step}
                  </span>
                  {!collapsed && <span>{item.label}</span>}
                </Link>
              )
            })}
          </div>
        )}

        {/* 系统菜单 */}
        <div className="px-3 mt-auto">
          {!collapsed && <div className="text-xs text-gray-500 uppercase tracking-wider px-2 mb-1 mt-4">系统</div>}
          {systemNavItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors mb-0.5',
                pathname === item.href ? 'bg-indigo-600 text-white' : 'text-gray-300 hover:bg-gray-800'
              )}
            >
              {item.icon}
              {!collapsed && <span>{item.label}</span>}
            </Link>
          ))}
        </div>
      </nav>

      {/* Footer */}
      {!collapsed && (
        <div className="px-4 py-3 border-t border-gray-800 text-xs text-gray-500">
          AI 漫剧生产工作台 v0.1.0
        </div>
      )}
    </aside>
  )
}
