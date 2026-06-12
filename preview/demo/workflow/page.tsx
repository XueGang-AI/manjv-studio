/**
 * Manjv Studio 样板页 — 项目工作流页
 *
 * 这是用户最核心的操作页面：在项目中走完整个创作流程。
 * 核心体验问题：
 * 1. 用户不知道自己在哪一步、下一步该做什么
 * 2. 每一步的状态不清晰（已完成 / 当前 / 锁定）
 * 3. 信息密度不够：该看的数据看不到
 * 4. 操作按钮不突出：用户找不到"下一步"
 *
 * 设计策略：
 * - 顶部：胶片轨道式 Step Navigator（签名元素），进度一目了然
 * - 中间：当前步骤的内容区 + 操作区
 * - 右侧：项目概览面板（始终可见的上下文）
 */

'use client'

import React, { useState } from 'react'
import {
  Film, Clock, Users, Image, Video, Clapperboard,
  ChevronRight, Check, Lock, Sparkles, RefreshCw,
  ArrowRight, ArrowLeft, Wand2, Eye, Settings, FileCode,
  LayoutDashboard, ChevronLeft, RotateCcw, XCircle,
  MoreHorizontal, Layers, Play, Download, ListTodo,
} from 'lucide-react'
import {
  Badge, Button, Card, EmptyState, ProgressBar, StepChip, FilmStrip,
} from '../components'

// ============================================
// Mock Data
// ============================================
const STEPS = [
  { key: 'story', label: '故事方案', icon: <Film size={16} />, status: 'completed' as const },
  { key: 'characters', label: '角色设定', icon: <Users size={16} />, status: 'completed' as const },
  { key: 'character-images', label: '角色图', icon: <Image size={16} />, status: 'completed' as const },
  { key: 'storyboard', label: '分镜脚本', icon: <Film size={16} />, status: 'active' as const },
  { key: 'shot-images', label: '分镜图', icon: <Image size={16} />, status: 'locked' as const },
  { key: 'shot-videos', label: '视频片段', icon: <Video size={16} />, status: 'locked' as const },
  { key: 'final', label: '成片合成', icon: <Clapperboard size={16} />, status: 'locked' as const },
]

const MOCK_STORYBOARD = {
  episodeTitle: '第 1 集：雨夜初遇',
  duration: 60,
  shotCount: 8,
  coreTask: '建立主角形象，引出核心冲突',
  emotionCurve: '平静 → 紧张 → 震惊',
  openingHook: '雨中奔跑的背影，手机屏幕上倒计时闪烁',
  shots: [
    { id: 1, name: '雨中奔跑', start: 0, end: 8, location: '城市街道', emotion: '紧张', dialogue: '快跑！他们来了！' },
    { id: 2, name: '手机倒计时', start: 8, end: 14, location: '城市街道', emotion: '紧迫', dialogue: '' },
    { id: 3, name: '巷口转弯', start: 14, end: 22, location: '暗巷', emotion: '恐惧', dialogue: '' },
    { id: 4, name: '意外相遇', start: 22, end: 32, location: '暗巷', emotion: '震惊', dialogue: '你……你怎么会在这里？' },
    { id: 5, name: '对视特写', start: 32, end: 40, location: '暗巷', emotion: '暧昧', dialogue: '' },
    { id: 6, name: '联手脱险', start: 40, end: 50, location: '暗巷→天台', emotion: '紧张→释放', dialogue: '跟我来！' },
    { id: 7, name: '天台喘息', start: 50, end: 56, location: '天台', emotion: '劫后余生', dialogue: '' },
    { id: 8, name: '城市全景', start: 56, end: 60, location: '天台远眺', emotion: '悬念', dialogue: '' },
  ]
}

// ============================================
// Step Navigator — 胶片轨道
// ============================================
function FilmStepNavigator({ steps, activeIndex }: { steps: typeof STEPS; activeIndex: number }) {
  return (
    <div className="flex items-center gap-0 px-2 overflow-x-auto">
      {steps.map((step, i) => {
        const isActive = i === activeIndex
        const isCompleted = step.status === 'completed'
        const isLocked = step.status === 'locked'
        return (
          <React.Fragment key={step.key}>
            {/* 连接线 */}
            {i > 0 && (
              <div className={`w-8 h-0.5 mx-1 rounded-full transition-colors ${
                isCompleted || isActive ? 'bg-[var(--color-accent)]' : 'bg-[var(--color-surface)]'
              }`} />
            )}
            {/* 步骤节点 */}
            <button
              className={`
                flex items-center gap-2 px-3 py-2 rounded-[var(--radius-md)] text-sm font-medium
                transition-all duration-200 whitespace-nowrap cursor-pointer
                ${isActive ? 'bg-[var(--color-accent-muted)] text-[var(--color-accent)] shadow-[var(--shadow-glow)]'
                  : isCompleted ? 'text-[var(--color-success)] hover:bg-[var(--color-success-muted)]'
                  : 'text-[var(--color-text-muted)] cursor-default'
                }
              `}
              disabled={isLocked}
            >
              {/* 状态图标 */}
              <span className={`
                w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold
                ${isActive ? 'bg-[var(--color-accent)] text-white'
                  : isCompleted ? 'bg-[var(--color-success)] text-white'
                  : 'bg-[var(--color-surface)] text-[var(--color-text-muted)]'
                }
              `}>
                {isCompleted ? <Check size={12} /> : isLocked ? <Lock size={10} /> : step.icon}
              </span>
              <span>{step.label}</span>
            </button>
          </React.Fragment>
        )
      })}
    </div>
  )
}

/** 侧边栏（项目内） */
function ProjectSidebar() {
  const [collapsed, setCollapsed] = useState(false)

  return (
    <aside className={`
      h-screen flex flex-col border-r border-[var(--color-border)]
      bg-[var(--color-abyss)] transition-all duration-200
      ${collapsed ? 'w-16' : 'w-60'}
    `}>
      {/* Logo + 返回 */}
      <div className="flex items-center justify-between h-14 px-4 border-b border-[var(--color-border)]">
        {!collapsed && (
          <a href="/projects" className="flex items-center gap-2 text-sm text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-colors">
            <ChevronLeft size={14} />
            <span>返回项目列表</span>
          </a>
        )}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="p-1.5 rounded-[var(--radius-sm)] hover:bg-[var(--color-surface)] transition-colors text-[var(--color-text-muted)]"
        >
          <ChevronLeft size={16} className={`transition-transform duration-200 ${collapsed ? 'rotate-180' : ''}`} />
        </button>
      </div>

      {/* 项目名 */}
      {!collapsed && (
        <div className="px-4 py-3 border-b border-[var(--color-border)]">
          <h2 className="font-bold text-[var(--color-text-primary)]">都市雨夜</h2>
          <p className="text-xs text-[var(--color-text-muted)] mt-0.5">60s/集 · Agnes · 更新于 2 小时前</p>
        </div>
      )}

      {/* 创作步骤 */}
      <nav className="flex-1 overflow-y-auto py-4">
        <div className="px-3 space-y-0.5">
          {!collapsed && <div className="text-[10px] text-[var(--color-text-muted)] uppercase tracking-widest px-3 mb-2">创作流程</div>}
          {STEPS.map((step, i) => (
            <a
              key={step.key}
              href="#"
              className={`
                flex items-center gap-3 px-3 py-2 rounded-[var(--radius-md)] text-sm transition-colors
                ${step.status === 'active'
                  ? 'bg-[var(--color-accent-muted)] text-[var(--color-accent)]'
                  : step.status === 'completed'
                    ? 'text-[var(--color-success)] hover:bg-[var(--color-success-muted)]'
                    : 'text-[var(--color-text-muted)]'
                }
              `}
            >
              <span className={`
                w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold
                ${step.status === 'active' ? 'bg-[var(--color-accent)] text-white'
                  : step.status === 'completed' ? 'bg-[var(--color-success)] text-white'
                  : 'bg-[var(--color-surface)] text-[var(--color-text-muted)]'
                }
              `}>
                {step.status === 'completed' ? <Check size={10} /> : i + 1}
              </span>
              {!collapsed && <span>{step.label}</span>}
            </a>
          ))}
        </div>
      </nav>

      {/* 系统入口 */}
      {!collapsed && (
        <div className="px-4 py-3 border-t border-[var(--color-border)] space-y-1">
          <a href="#" className="flex items-center gap-2 text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)] transition-colors">
            <ListTodo size={12} /> 任务队列
          </a>
          <a href="#" className="flex items-center gap-2 text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)] transition-colors">
            <Layers size={12} /> 版本管理
          </a>
        </div>
      )}
    </aside>
  )
}

// ============================================
// 分镜脚本样板内容
// ============================================
function StoryboardContent() {
  const [expandedShot, setExpandedShot] = useState<number | null>(1)

  return (
    <div className="space-y-6">
      {/* Episode 概览 */}
      <Card className="overflow-hidden">
        <div className="p-5">
          <div className="flex items-start justify-between mb-4">
            <div>
              <h2 className="text-xl font-bold text-[var(--color-text-primary)]">{MOCK_STORYBOARD.episodeTitle}</h2>
              <div className="flex items-center gap-3 mt-2 text-sm text-[var(--color-text-muted)]">
                <span className="flex items-center gap-1"><Clock size={14} />{MOCK_STORYBOARD.duration}s</span>
                <span>·</span>
                <span className="flex items-center gap-1"><Film size={14} />{MOCK_STORYBOARD.shotCount} 镜头</span>
              </div>
            </div>
            <Badge variant="warning">待确认</Badge>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <span className="text-[var(--color-text-muted)] text-xs">核心任务</span>
              <p className="text-[var(--color-text-secondary)] mt-0.5">{MOCK_STORYBOARD.coreTask}</p>
            </div>
            <div>
              <span className="text-[var(--color-text-muted)] text-xs">情绪曲线</span>
              <p className="text-[var(--color-text-secondary)] mt-0.5">{MOCK_STORYBOARD.emotionCurve}</p>
            </div>
            <div>
              <span className="text-[var(--color-text-muted)] text-xs">开场钩子</span>
              <p className="text-[var(--color-accent)] mt-0.5 text-xs">{MOCK_STORYBOARD.openingHook}</p>
            </div>
            <div>
              <span className="text-[var(--color-text-muted)] text-xs">时长分布</span>
              <div className="mt-1">
                <ProgressBar value={100} variant="success" />
                <p className="text-[10px] text-[var(--color-text-muted)] mt-0.5 font-mono">0s — 60s</p>
              </div>
            </div>
          </div>
        </div>
      </Card>

      {/* 镜头时间线 — 胶片轨道 */}
      <div>
        <h3 className="text-sm font-semibold text-[var(--color-text-primary)] mb-3 flex items-center gap-2">
          <Film size={16} className="text-[var(--color-accent)]" /> 镜头时间线
        </h3>

        {/* 时间刻度条 */}
        <div className="flex items-end gap-0 mb-3 px-8">
          {[0, 10, 20, 30, 40, 50, 60].map(t => (
            <div key={t} className="flex-1 text-center">
              <div className="h-1 bg-[var(--color-surface)] mb-1" />
              <span className="text-[10px] text-[var(--color-text-muted)] font-mono">{t}s</span>
            </div>
          ))}
        </div>

        {/* 镜头条 */}
        <div className="relative px-8">
          <div className="flex gap-0.5">
            {MOCK_STORYBOARD.shots.map(shot => {
              const widthPercent = ((shot.end - shot.start) / MOCK_STORYBOARD.duration) * 100
              return (
                <button
                  key={shot.id}
                  onClick={() => setExpandedShot(expandedShot === shot.id ? null : shot.id)}
                  className={`
                    h-10 rounded-[var(--radius-sm)] flex items-center justify-center text-xs font-bold
                    transition-all duration-200 cursor-pointer relative group
                    ${expandedShot === shot.id
                      ? 'bg-[var(--color-accent)] text-white shadow-[var(--shadow-glow)]'
                      : 'bg-[var(--color-surface)] text-[var(--color-text-secondary)] hover:bg-[var(--color-elevated)]'
                    }
                  `}
                  style={{ width: `${widthPercent}%` }}
                  title={`${shot.name} (${shot.start}-${shot.end}s)`}
                >
                  <span className="truncate px-1">{shot.id}</span>
                  {/* 悬浮提示 */}
                  <div className="absolute -top-10 left-1/2 -translate-x-1/2 px-2 py-1 bg-[var(--color-deep)] border border-[var(--color-border)] rounded-[var(--radius-sm)] text-[10px] whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
                    {shot.name} ({shot.end - shot.start}s)
                  </div>
                </button>
              )
            })}
          </div>
        </div>

        {/* 展开的镜头详情 */}
        {expandedShot && (() => {
          const shot = MOCK_STORYBOARD.shots.find(s => s.id === expandedShot)
          if (!shot) return null
          return (
            <Card className="mt-4 overflow-hidden">
              <div className="p-5">
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="w-7 h-7 rounded-full bg-[var(--color-accent)] text-white flex items-center justify-center text-xs font-bold">{shot.id}</span>
                      <h4 className="text-base font-semibold text-[var(--color-text-primary)]">{shot.name}</h4>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-[var(--color-text-muted)] ml-9">
                      <Badge variant="info"><Clock size={10} className="mr-1" />{shot.start}-{shot.end}s ({shot.end - shot.start}s)</Badge>
                      <span>{shot.location}</span>
                      <span>情绪：{shot.emotion}</span>
                    </div>
                  </div>
                  <Button variant="secondary" size="sm" icon={<RotateCcw size={12} />}>重新生成</Button>
                </div>

                <div className="grid grid-cols-2 gap-4 ml-9">
                  {/* 图片 Prompt */}
                  <div className="bg-[var(--color-abyss)] rounded-[var(--radius-md)] p-3">
                    <div className="text-[10px] font-medium text-[var(--color-accent)] uppercase tracking-wider mb-2">图片 Prompt</div>
                    <p className="text-xs text-[var(--color-text-secondary)] leading-relaxed">
                      A young woman running through rain-soaked city streets at night, neon reflections on wet asphalt, cinematic lighting, medium shot, tense atmosphere, Korean manhwa style
                    </p>
                  </div>
                  {/* 视频 Prompt */}
                  <div className="bg-[var(--color-abyss)] rounded-[var(--radius-md)] p-3">
                    <div className="text-[10px] font-medium text-[var(--color-info)] uppercase tracking-wider mb-2">视频 Prompt</div>
                    <p className="text-xs text-[var(--color-text-secondary)] leading-relaxed">
                      Camera tracks alongside running figure, rain splashing, quick pace, urban night scene, handheld feel
                    </p>
                    {shot.dialogue && (
                      <div className="mt-2 pt-2 border-t border-[var(--color-border)]">
                        <div className="text-[10px] font-medium text-[var(--color-warning)] uppercase tracking-wider mb-1">台词</div>
                        <p className="text-xs text-[var(--color-text-primary)] italic">「{shot.dialogue}」</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </Card>
          )
        })()}
      </div>

      {/* 配音时间轴 */}
      <Card className="p-5">
        <h3 className="text-sm font-semibold text-[var(--color-text-primary)] mb-3 flex items-center gap-2">
          <Play size={16} className="text-[var(--color-accent)]" /> 配音时间轴
        </h3>
        <div className="space-y-1.5">
          {MOCK_STORYBOARD.shots.filter(s => s.dialogue).map(shot => (
            <div key={shot.id} className="flex items-center gap-3 text-xs py-1.5 px-3 bg-[var(--color-abyss)] rounded-[var(--radius-sm)]">
              <Badge variant="default" className="font-mono shrink-0">{shot.start}-{shot.end}s</Badge>
              <span className="text-[var(--color-text-primary)] italic">「{shot.dialogue}」</span>
              <span className="text-[var(--color-text-muted)] ml-auto shrink-0">{shot.emotion}</span>
            </div>
          ))}
        </div>
      </Card>

      {/* 操作栏 */}
      <div className="flex items-center justify-between pt-4 border-t border-[var(--color-border)]">
        <Button variant="ghost" icon={<ArrowLeft size={16} />}>返回角色图</Button>
        <div className="flex items-center gap-3">
          <Button variant="secondary" icon={<RefreshCw size={16} />}>重新生成</Button>
          <Button variant="primary" icon={<Check size={16} />}>确认分镜</Button>
        </div>
      </div>
    </div>
  )
}

// ============================================
// 右侧面板 — 项目概览
// ============================================
function ProjectOverviewPanel() {
  return (
    <div className="w-72 border-l border-[var(--color-border)] bg-[var(--color-abyss)] p-4 space-y-4 overflow-y-auto h-full">
      <h3 className="text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wider">项目概览</h3>

      <Card className="p-3 space-y-2">
        <div className="text-xs text-[var(--color-text-muted)]">项目名</div>
        <div className="text-sm font-semibold text-[var(--color-text-primary)]">都市雨夜</div>
      </Card>

      <Card className="p-3 space-y-2">
        <div className="text-xs text-[var(--color-text-muted)]">创作进度</div>
        <ProgressBar value={50} />
        <div className="flex justify-between text-[10px] text-[var(--color-text-muted)]">
          <span>分镜脚本</span>
          <span>4/8 步</span>
        </div>
      </Card>

      <Card className="p-3 space-y-2">
        <div className="text-xs text-[var(--color-text-muted)] mb-2">项目配置</div>
        {[
          { label: '故事类型', value: '都市 / 悬疑' },
          { label: '画风', value: '韩漫 / 电影感' },
          { label: '单集时长', value: '60 秒' },
          { label: 'AI 模型', value: 'Agnes（免费）' },
          { label: '画面比例', value: '9:16' },
        ].map(item => (
          <div key={item.label} className="flex justify-between text-xs py-1 border-b border-[var(--color-border)] last:border-0">
            <span className="text-[var(--color-text-muted)]">{item.label}</span>
            <span className="text-[var(--color-text-secondary)]">{item.value}</span>
          </div>
        ))}
      </Card>

      <Card className="p-3 space-y-2">
        <div className="text-xs text-[var(--color-text-muted)] mb-2">数据统计</div>
        {[
          { label: '角色数', value: '3' },
          { label: '角色图', value: '12 张' },
          { label: '镜头数', value: '8' },
          { label: '任务数', value: '15' },
        ].map(item => (
          <div key={item.label} className="flex justify-between text-xs py-1 border-b border-[var(--color-border)] last:border-0">
            <span className="text-[var(--color-text-muted)]">{item.label}</span>
            <span className="text-[var(--color-text-primary)] font-mono">{item.value}</span>
          </div>
        ))}
      </Card>

      {/* 快捷入口 */}
      <div className="space-y-1.5">
        <a href="#" className="flex items-center gap-2 px-3 py-2 rounded-[var(--radius-md)] text-xs text-[var(--color-text-muted)] hover:bg-[var(--color-surface)] hover:text-[var(--color-text-secondary)] transition-colors">
          <ListTodo size={14} /> 任务队列 <Badge variant="info" className="ml-auto">3</Badge>
        </a>
        <a href="#" className="flex items-center gap-2 px-3 py-2 rounded-[var(--radius-md)] text-xs text-[var(--color-text-muted)] hover:bg-[var(--color-surface)] hover:text-[var(--color-text-secondary)] transition-colors">
          <Layers size={14} /> 版本历史 <Badge variant="default" className="ml-auto">5</Badge>
        </a>
      </div>
    </div>
  )
}

// ============================================
// Main Page
// ============================================
export default function WorkflowDemoPage() {
  return (
    <div className="flex h-screen bg-[var(--color-void)]">
      <ProjectSidebar />

      <div className="flex-1 flex flex-col overflow-hidden">
        {/* 顶部 Step Navigator */}
        <div className="h-16 border-b border-[var(--color-border)] bg-[var(--color-abyss)] flex items-center px-4">
          <FilmStepNavigator steps={STEPS} activeIndex={3} />
        </div>

        {/* 主内容区 + 右侧面板 */}
        <div className="flex-1 flex overflow-hidden">
          {/* 内容 */}
          <main className="flex-1 overflow-y-auto p-6">
            {/* 页面标题 */}
            <div className="mb-6">
              <h1 className="text-2xl font-bold text-[var(--color-text-primary)]">分镜脚本</h1>
              <p className="text-sm text-[var(--color-text-muted)] mt-1">
                第 1 集完整分镜 — 8 个镜头，总时长 60s — 确认后将进入分镜图生成
              </p>
            </div>

            <StoryboardContent />
          </main>

          {/* 右侧面板 */}
          <ProjectOverviewPanel />
        </div>
      </div>
    </div>
  )
}
