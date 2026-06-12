/**
 * Manjv Studio 样板页 — 项目列表 / 工作台首页
 *
 * 这是用户进入应用后看到的第一个页面。
 * 作为工作台首页，它需要：
 * 1. 给用户全局感：多少项目、哪些在进度中、快速定位
 * 2. 快速操作入口：创建新项目、继续上次工作
 * 3. 信息密度适中，不过载
 *
 * 视觉风格：电影暗房
 * 签名元素：胶片穿孔轨道
 */

'use client'

import React, { useState } from 'react'
import {
  Plus, Search, SlidersHorizontal, Film, Clock,
  Users, Image, Video, Clapperboard, MoreHorizontal,
  ArrowRight, Sparkles, ChevronRight, Grid3X3, List,
  LayoutDashboard, Settings, FileCode, ListTodo, Package,
  FolderOpen, TrendingUp,
} from 'lucide-react'
import {
  Badge, Button, Card, EmptyState, ProgressBar, StatCard, StepChip,
} from './components'

// ============================================
// Mock Data
// ============================================
const MOCK_PROJECTS = [
  {
    id: '1',
    name: '都市雨夜',
    storyType: ['都市', '悬疑'],
    artStyle: ['韩漫', '电影感'],
    status: 'SHOT_VIDEO_GENERATING',
    episodeDuration: 60,
    modelProvider: 'agnes',
    updatedAt: '2 小时前',
    progress: 7, // step 7/8
    coverSeed: 'rain-city',
  },
  {
    id: '2',
    name: '仙途奇缘',
    storyType: ['仙侠', '冒险'],
    artStyle: ['国漫', '水墨'],
    status: 'STORYBOARD_PENDING_CONFIRM',
    episodeDuration: 90,
    modelProvider: 'ark',
    updatedAt: '昨天',
    progress: 5,
    coverSeed: 'xianxia-sword',
  },
  {
    id: '3',
    name: '重生之巅',
    storyType: ['都市', '逆袭'],
    artStyle: ['韩漫'],
    status: 'CHARACTER_IMAGE_CONFIRMED',
    episodeDuration: 30,
    modelProvider: 'agnes',
    updatedAt: '3 天前',
    progress: 4,
  },
  {
    id: '4',
    name: '星际迷途',
    storyType: ['科幻', '惊悚'],
    artStyle: ['赛博朋克'],
    status: 'RENDERED',
    episodeDuration: 120,
    modelProvider: 'ark',
    updatedAt: '1 周前',
    progress: 8,
  },
  {
    id: '5',
    name: '校园心跳',
    storyType: ['校园', '甜宠'],
    artStyle: ['日漫'],
    status: 'DRAFT',
    episodeDuration: 15,
    modelProvider: 'agnes',
    updatedAt: '2 周前',
    progress: 0,
  },
]

const STATUS_MAP: Record<string, { label: string; variant: 'default' | 'success' | 'warning' | 'danger' | 'info' | 'accent'; step: number }> = {
  DRAFT: { label: '草稿', variant: 'default', step: 0 },
  STORY_CONFIRMED: { label: '故事已确认', variant: 'success', step: 2 },
  CHARACTER_CONFIRMED: { label: '角色已确认', variant: 'success', step: 3 },
  CHARACTER_IMAGE_CONFIRMED: { label: '角色图已确认', variant: 'success', step: 4 },
  STORYBOARD_PENDING_CONFIRM: { label: '分镜待确认', variant: 'warning', step: 5 },
  STORYBOARD_CONFIRMED: { label: '分镜已确认', variant: 'success', step: 5 },
  SHOT_IMAGE_CONFIRMED: { label: '分镜图已确认', variant: 'success', step: 6 },
  SHOT_VIDEO_GENERATING: { label: '视频生成中', variant: 'info', step: 7 },
  RENDERED: { label: '成片已生成', variant: 'accent', step: 8 },
}

const STEP_NAMES = ['项目', '故事', '角色', '角色图', '分镜', '分镜图', '视频', '成片']

// ============================================
// Sub-components
// ============================================

/** 项目卡片 — 网格视图 */
function ProjectCardGrid({ project }: { project: typeof MOCK_PROJECTS[0] }) {
  const statusInfo = STATUS_MAP[project.status] || { label: project.status, variant: 'default' as const, step: 0 }
  return (
    <Card hover className="group cursor-pointer overflow-hidden">
      {/* 封面区域 — 用渐变模拟封面 */}
      <div className="h-32 relative overflow-hidden" style={{
        background: `linear-gradient(135deg, var(--color-deep) 0%, var(--color-surface) 50%, var(--color-elevated) 100%)`,
      }}>
        {/* 胶片穿孔装饰 */}
        <div className="absolute left-2 top-2 bottom-2 flex flex-col gap-1.5">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="w-1.5 h-2 rounded-[1px] bg-white/10" />
          ))}
        </div>
        {/* Provider 标签 */}
        <div className="absolute top-3 right-3">
          <Badge variant={project.modelProvider === 'ark' ? 'accent' : 'info'}>
            {project.modelProvider === 'ark' ? '豆包' : 'Agnes'}
          </Badge>
        </div>
        {/* 项目名 */}
        <div className="absolute bottom-3 left-3 right-3">
          <h3 className="text-lg font-bold text-white drop-shadow-lg">{project.name}</h3>
        </div>
      </div>

      <div className="p-4 space-y-3">
        {/* 类型标签 */}
        <div className="flex flex-wrap gap-1.5">
          {project.storyType.map(t => (
            <Badge key={t} variant="default">{t}</Badge>
          ))}
          {project.artStyle.map(t => (
            <Badge key={t} variant="default">{t}</Badge>
          ))}
        </div>

        {/* 进度条 */}
        <div>
          <div className="flex items-center justify-between text-xs mb-1.5">
            <span className="text-[var(--color-text-muted)]">进度</span>
            <span className="font-mono text-[var(--color-text-secondary)]">
              {statusInfo.step}/{STEP_NAMES.length}
            </span>
          </div>
          <ProgressBar value={(statusInfo.step / STEP_NAMES.length) * 100} />
        </div>

        {/* 底部信息行 */}
        <div className="flex items-center justify-between pt-1">
          <div className="flex items-center gap-2">
            <Badge variant={statusInfo.variant}>{statusInfo.label}</Badge>
            <span className="text-xs text-[var(--color-text-muted)]">{project.episodeDuration}s/集</span>
          </div>
          <span className="text-xs text-[var(--color-text-muted)]">{project.updatedAt}</span>
        </div>
      </div>
    </Card>
  )
}

/** 项目行 — 列表视图 */
function ProjectCardList({ project }: { project: typeof MOCK_PROJECTS[0] }) {
  const statusInfo = STATUS_MAP[project.status] || { label: project.status, variant: 'default' as const, step: 0 }
  return (
    <Card hover className="group cursor-pointer">
      <div className="flex items-center gap-4 px-5 py-4">
        {/* 左侧缩略图 */}
        <div className="w-12 h-16 rounded-[var(--radius-sm)] bg-[var(--color-surface)] flex-shrink-0 overflow-hidden flex items-center justify-center">
          <Film size={20} className="text-[var(--color-text-muted)]" />
        </div>
        {/* 中间信息 */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h3 className="font-semibold text-[var(--color-text-primary)] truncate">{project.name}</h3>
            <Badge variant={project.modelProvider === 'ark' ? 'accent' : 'info'} className="shrink-0">
              {project.modelProvider === 'ark' ? '豆包' : 'Agnes'}
            </Badge>
            <Badge variant={statusInfo.variant} className="shrink-0">{statusInfo.label}</Badge>
          </div>
          <div className="flex items-center gap-3 text-xs text-[var(--color-text-muted)]">
            <span>{project.episodeDuration}s/集</span>
            <span>·</span>
            <span>{project.storyType.join(' / ')}</span>
            <span>·</span>
            <span>{project.updatedAt}</span>
          </div>
        </div>
        {/* 右侧进度 + 操作 */}
        <div className="flex items-center gap-4 shrink-0">
          <div className="w-32">
            <ProgressBar value={(statusInfo.step / STEP_NAMES.length) * 100} />
            <div className="text-xs text-[var(--color-text-muted)] mt-1 font-mono text-right">
              {statusInfo.step}/{STEP_NAMES.length}
            </div>
          </div>
          <ArrowRight size={16} className="text-[var(--color-text-muted)] group-hover:text-[var(--color-accent)] transition-colors" />
        </div>
      </div>
    </Card>
  )
}

/** 侧边栏 */
function Sidebar({ activePath = '/projects' }: { activePath?: string }) {
  const [collapsed, setCollapsed] = useState(false)

  const navItems = [
    { label: '项目列表', href: '/projects', icon: <LayoutDashboard size={20} /> },
  ]
  const systemItems = [
    { label: 'Prompt 模板', href: '/prompts', icon: <FileCode size={20} /> },
    { label: '模型设置', href: '/settings/models', icon: <Settings size={20} /> },
  ]

  return (
    <aside className={`
      h-screen flex flex-col border-r border-[var(--color-border)]
      bg-[var(--color-abyss)] transition-all duration-200
      ${collapsed ? 'w-16' : 'w-60'}
    `}>
      {/* Logo */}
      <div className="flex items-center justify-between h-14 px-4 border-b border-[var(--color-border)]">
        {!collapsed && (
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-[var(--radius-sm)] bg-[var(--color-accent)] flex items-center justify-center">
              <Clapperboard size={14} className="text-white" />
            </div>
            <span className="font-bold text-[var(--color-text-primary)] tracking-tight">Manjv Studio</span>
          </div>
        )}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="p-1.5 rounded-[var(--radius-sm)] hover:bg-[var(--color-surface)] transition-colors text-[var(--color-text-muted)]"
        >
          <ChevronRight size={16} className={`transition-transform duration-200 ${collapsed ? '' : 'rotate-180'}`} />
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-4">
        <div className="px-3 space-y-0.5">
          {!collapsed && <div className="text-[10px] text-[var(--color-text-muted)] uppercase tracking-widest px-3 mb-2">导航</div>}
          {navItems.map(item => (
            <a
              key={item.href}
              href={item.href}
              className={`
                flex items-center gap-3 px-3 py-2 rounded-[var(--radius-md)] text-sm transition-colors
                ${activePath === item.href
                  ? 'bg-[var(--color-accent-muted)] text-[var(--color-accent)]'
                  : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-surface)] hover:text-[var(--color-text-primary)]'
                }
              `}
            >
              {item.icon}
              {!collapsed && <span>{item.label}</span>}
            </a>
          ))}
        </div>

        <div className="px-3 mt-6 space-y-0.5">
          {!collapsed && <div className="text-[10px] text-[var(--color-text-muted)] uppercase tracking-widest px-3 mb-2">系统</div>}
          {systemItems.map(item => (
            <a
              key={item.href}
              href={item.href}
              className="flex items-center gap-3 px-3 py-2 rounded-[var(--radius-md)] text-sm text-[var(--color-text-secondary)] hover:bg-[var(--color-surface)] hover:text-[var(--color-text-primary)] transition-colors"
            >
              {item.icon}
              {!collapsed && <span>{item.label}</span>}
            </a>
          ))}
        </div>
      </nav>

      {/* Footer */}
      {!collapsed && (
        <div className="px-4 py-3 border-t border-[var(--color-border)] text-[10px] text-[var(--color-text-muted)]">
          Manjv Studio v0.1.0
        </div>
      )}
    </aside>
  )
}

/** 顶部栏 */
function TopBar() {
  return (
    <header className="h-14 border-b border-[var(--color-border)] bg-[var(--color-abyss)] flex items-center px-6 gap-4">
      <nav className="flex items-center gap-2 text-sm">
        <a href="/projects" className="text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-colors">项目</a>
        <ChevronRight size={14} className="text-[var(--color-text-muted)]" />
        <span className="text-[var(--color-text-primary)] font-medium">项目列表</span>
      </nav>
      <div className="ml-auto flex items-center gap-4">
        <button className="text-sm text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-colors flex items-center gap-1.5">
          <Settings size={14} /> 设置
        </button>
      </div>
    </header>
  )
}

// ============================================
// Main Page
// ============================================
export default function DemoPage() {
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')
  const [searchQuery, setSearchQuery] = useState('')
  const [filterStatus, setFilterStatus] = useState<string>('all')

  const filteredProjects = MOCK_PROJECTS.filter(p => {
    if (searchQuery && !p.name.includes(searchQuery) && !p.storyType.some(t => t.includes(searchQuery))) return false
    if (filterStatus !== 'all') {
      if (filterStatus === 'active' && p.progress === 0) return false
      if (filterStatus === 'completed' && p.status !== 'RENDERED') return false
      if (filterStatus === 'draft' && p.status !== 'DRAFT') return false
    }
    return true
  })

  const activeProjects = MOCK_PROJECTS.filter(p => p.progress > 0 && p.status !== 'RENDERED').length
  const completedProjects = MOCK_PROJECTS.filter(p => p.status === 'RENDERED').length
  const totalProjects = MOCK_PROJECTS.length

  return (
    <div className="flex h-screen bg-[var(--color-void)]">
      <Sidebar />

      <div className="flex-1 flex flex-col overflow-hidden">
        <TopBar />

        <main className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* ---- 统计概览 ---- */}
          <div className="grid grid-cols-4 gap-4">
            <StatCard label="项目总数" value={totalProjects} icon={<FolderOpen size={16} />} />
            <StatCard label="进行中" value={activeProjects} sub="需要关注" icon={<Clock size={16} />} trend="up" />
            <StatCard label="已完成" value={completedProjects} icon={<Clapperboard size={16} />} />
            <StatCard label="本周生成" value="23" sub="↑ 12%" icon={<Sparkles size={16} />} trend="up" />
          </div>

          {/* ---- 操作栏：搜索 + 筛选 + 视图 + 创建 ---- */}
          <div className="flex items-center gap-3">
            {/* 搜索 */}
            <div className="relative flex-1 max-w-xs">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)]" />
              <input
                type="text"
                placeholder="搜索项目名称或类型…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full h-10 pl-9 pr-4 bg-[var(--color-deep)] border border-[var(--color-border)] rounded-[var(--radius-md)] text-sm text-[var(--color-text-primary)] placeholder-[var(--color-text-muted)] focus:outline-none focus:border-[var(--color-accent)]/50 focus:shadow-[var(--shadow-glow)] transition-all"
              />
            </div>

            {/* 状态筛选 */}
            <div className="flex items-center gap-1 bg-[var(--color-deep)] border border-[var(--color-border)] rounded-[var(--radius-md)] p-1">
              {[
                { key: 'all', label: '全部' },
                { key: 'active', label: '进行中' },
                { key: 'completed', label: '已完成' },
                { key: 'draft', label: '草稿' },
              ].map(f => (
                <button
                  key={f.key}
                  onClick={() => setFilterStatus(f.key)}
                  className={`
                    px-3 py-1.5 rounded-[var(--radius-sm)] text-xs font-medium transition-colors cursor-pointer
                    ${filterStatus === f.key
                      ? 'bg-[var(--color-accent)] text-white'
                      : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]'
                    }
                  `}
                >
                  {f.label}
                </button>
              ))}
            </div>

            {/* 视图切换 */}
            <div className="flex items-center gap-1 bg-[var(--color-deep)] border border-[var(--color-border)] rounded-[var(--radius-md)] p-1">
              <button
                onClick={() => setViewMode('grid')}
                className={`p-1.5 rounded-[var(--radius-sm)] transition-colors cursor-pointer ${viewMode === 'grid' ? 'bg-[var(--color-surface)] text-[var(--color-accent)]' : 'text-[var(--color-text-muted)]'}`}
              >
                <Grid3X3 size={14} />
              </button>
              <button
                onClick={() => setViewMode('list')}
                className={`p-1.5 rounded-[var(--radius-sm)] transition-colors cursor-pointer ${viewMode === 'list' ? 'bg-[var(--color-surface)] text-[var(--color-accent)]' : 'text-[var(--color-text-muted)]'}`}
              >
                <List size={14} />
              </button>
            </div>

            {/* 创建新项目 */}
            <div className="ml-auto">
              <Button variant="primary" icon={<Plus size={16} />}>
                新建项目
              </Button>
            </div>
          </div>

          {/* ---- 项目列表 ---- */}
          {filteredProjects.length === 0 ? (
            <EmptyState
              icon={<FolderOpen size={28} />}
              title="没有匹配的项目"
              description="试试调整筛选条件，或者创建一个新项目开始创作"
              action={<Button variant="primary" icon={<Plus size={16} />}>新建项目</Button>}
            />
          ) : viewMode === 'grid' ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredProjects.map(project => (
                <ProjectCardGrid key={project.id} project={project} />
              ))}
            </div>
          ) : (
            <div className="space-y-2">
              {filteredProjects.map(project => (
                <ProjectCardList key={project.id} project={project} />
              ))}
            </div>
          )}
        </main>
      </div>
    </div>
  )
}
