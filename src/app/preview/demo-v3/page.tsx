/**
 * Manjv Studio V3 — 项目列表 / 工作台首页
 * Aurora Studio 色彩方案
 */
'use client'

import React, { useState } from 'react'
import {
  Plus, Search, Film, Clock, Users, Image, Video,
  Clapperboard, ArrowRight, Sparkles, Grid3X3, List,
  MoreHorizontal, Copy, Trash2, Download, Eye, Play,
  FolderOpen, AlertTriangle, RotateCcw, Package,
  Upload, LayoutTemplate, Zap,
} from 'lucide-react'
import {
  Badge, Button, Card, EmptyState, ProgressBar, StatCard,
  AISuggestionCard, GenerationTaskItem, ActivityItem,
  NotificationBell, UserMenu, UsageMeter,
} from './components'

const MOCK_PROJECTS = [
  { id: '1', name: '都市雨夜', types: ['都市','悬疑'], styles: ['韩漫','电影感'], status: '视频生成中', statusV: 'info' as const, step: 7, totalSteps: 8, provider: 'agnes', duration: 60, updated: '2 小时前', assets: 18, cover: 'linear-gradient(135deg, #0E1424 0%, #141C2E 50%, #1B2540 100%)' },
  { id: '2', name: '仙途奇缘', types: ['仙侠','冒险'], styles: ['国漫','水墨'], status: '分镜待确认', statusV: 'warning' as const, step: 5, totalSteps: 8, provider: 'ark', duration: 90, updated: '昨天', assets: 24, cover: 'linear-gradient(135deg, #141C2E 0%, #1B2540 50%, #0E1424 100%)' },
  { id: '3', name: '重生之巅', types: ['都市','逆袭'], styles: ['韩漫'], status: '角色图已确认', statusV: 'success' as const, step: 4, totalSteps: 8, provider: 'agnes', duration: 30, updated: '3 天前', assets: 12, cover: 'linear-gradient(135deg, #090D18 0%, #141C2E 50%, #1B2540 100%)' },
  { id: '4', name: '星际迷途', types: ['科幻','惊悚'], styles: ['赛博朋克'], status: '成片已生成', statusV: 'cyan' as const, step: 8, totalSteps: 8, provider: 'ark', duration: 120, updated: '1 周前', assets: 35, cover: 'linear-gradient(135deg, #0E1424 0%, #1B2540 50%, #141C2E 100%)' },
  { id: '5', name: '校园心跳', types: ['校园','甜宠'], styles: ['日漫'], status: '草稿', statusV: 'default' as const, step: 0, totalSteps: 8, provider: 'agnes', duration: 15, updated: '2 周前', assets: 0, cover: 'linear-gradient(135deg, #090D18 0%, #0E1424 50%, #141C2E 100%)' },
]

const MOCK_ACTIVITIES = [
  { icon: <Video size={14} />, text: '「都市雨夜」第 3 镜头视频生成完成', time: '5 分钟前', variant: 'success' as const },
  { icon: <AlertTriangle size={14} />, text: '「仙途奇缘」第 7 镜头视频生成失败，可重试', time: '1 小时前', variant: 'error' as const },
  { icon: <Image size={14} />, text: '「重生之巅」角色参考图批量确认完成', time: '3 小时前', variant: 'success' as const },
  { icon: <Clapperboard size={14} />, text: '「星际迷途」成片合成完成，可预览下载', time: '昨天', variant: 'success' as const },
  { icon: <Film size={14} />, text: '「仙途奇缘」分镜脚本已生成，待确认', time: '昨天', variant: 'warning' as const },
]

function Header() {
  return (
    <header className="h-14 border-b border-[var(--border-dim)] bg-[var(--bg-surface)]/80 backdrop-blur-md flex items-center px-5 gap-4 sticky top-0 z-30">
      <div className="flex items-center gap-2.5 mr-4">
        <div className="w-8 h-8 rounded-[var(--radius-md)] flex items-center justify-center" style={{ background: 'var(--gradient-aurora)' }}>
          <Clapperboard size={16} className="text-white" />
        </div>
        <span className="font-bold text-[var(--text-primary)] tracking-tight text-[15px]">Manjv Studio</span>
        <Badge variant="primary">Beta</Badge>
      </div>
      <div className="flex-1 max-w-md">
        <button className="w-full h-9 flex items-center gap-2 px-3 bg-[var(--bg-elevated)] border border-[var(--border-dim)] rounded-[var(--radius-md)] text-sm text-[var(--text-muted)] hover:border-[var(--border-bright)] transition-colors cursor-pointer">
          <Search size={14} />
          <span>搜索项目、模板、素材…</span>
          <kbd className="ml-auto text-[10px] bg-[var(--bg-panel)] px-1.5 py-0.5 rounded font-mono">⌘K</kbd>
        </button>
      </div>
      <div className="ml-auto flex items-center gap-1">
        <Button variant="aurora" size="sm" icon={<Plus size={14} />}>新建项目</Button>
        <NotificationBell count={2} />
        <UserMenu />
      </div>
    </header>
  )
}

function QuickActions() {
  const items = [
    { icon: <Plus size={18} />, label: '新建漫剧', desc: '从零开始创作', primary: true },
    { icon: <LayoutTemplate size={18} />, label: '从模板创建', desc: '热门风格模板', primary: false },
    { icon: <Upload size={18} />, label: '导入脚本', desc: '小说/剧本一键导入', primary: false },
    { icon: <Package size={18} />, label: '素材库', desc: '管理图片视频', primary: false },
  ]
  return (
    <div className="grid grid-cols-4 gap-3">
      {items.map(item => (
        <Card key={item.label} hover className="p-4 cursor-pointer group">
          <div className={`w-10 h-10 rounded-[var(--radius-md)] flex items-center justify-center mb-3 transition-colors ${
            item.primary ? 'bg-[var(--primary-muted)] text-[var(--primary)] group-hover:bg-[var(--primary)] group-hover:text-white' : 'bg-[var(--bg-panel)] text-[var(--text-muted)] group-hover:text-[var(--text-secondary)]'
          }`}>{item.icon}</div>
          <h4 className="text-sm font-semibold text-[var(--text-primary)]">{item.label}</h4>
          <p className="text-xs text-[var(--text-muted)] mt-0.5">{item.desc}</p>
        </Card>
      ))}
    </div>
  )
}

function AIRecommendations() {
  return (
    <div className="space-y-3">
      <AISuggestionCard title="继续创作「都市雨夜」" desc="上次停在视频生成阶段，3 个镜头仍在生成中。" action={<Button variant="cyan" size="sm" icon={<Play size={12} />}>继续创作</Button>} variant="cyan" />
      <AISuggestionCard title="「仙途奇缘」有 1 个失败任务" desc="第 7 镜头视频生成失败，建议重试或切换模型。" action={<Button variant="secondary" size="sm" icon={<RotateCcw size={12} />}>一键重试</Button>} variant="warning" />
      <AISuggestionCard title="推荐尝试豆包模型" desc="角色一致性和视频质量优于 Agnes，首月赠送 500 积分。" action={<Button variant="secondary" size="sm">了解详情</Button>} />
    </div>
  )
}

function ProjectCard({ p }: { p: typeof MOCK_PROJECTS[0] }) {
  const [menuOpen, setMenuOpen] = useState(false)
  return (
    <Card hover className="overflow-hidden group">
      <div className="h-36 relative overflow-hidden" style={{ background: p.cover }}>
        <div className="absolute left-3 top-3 bottom-3 flex flex-col gap-1.5 opacity-20">
          {Array.from({ length: 8 }).map((_, i) => <div key={i} className="w-1 h-1.5 rounded-[1px] bg-white/60" />)}
        </div>
        <div className="absolute top-3 right-3">
          <Badge variant={p.provider === 'ark' ? 'violet' : 'info'} dot>{p.provider === 'ark' ? '豆包' : 'Agnes'}</Badge>
        </div>
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
          <div className="flex gap-2">
            <Button variant="aurora" size="sm" icon={<Play size={12} />}>继续创作</Button>
            <Button variant="secondary" size="sm" icon={<Eye size={12} />} className="!bg-black/40 !border-white/20 !text-white hover:!bg-black/60">预览</Button>
          </div>
        </div>
        <div className="absolute bottom-3 left-3 right-3">
          <h3 className="text-lg font-bold text-white drop-shadow-lg">{p.name}</h3>
        </div>
      </div>
      <div className="p-4 space-y-3">
        <div className="flex flex-wrap gap-1.5">
          {p.types.map(t => <Badge key={t}>{t}</Badge>)}
          {p.styles.map(t => <Badge key={t} variant="default">{t}</Badge>)}
        </div>
        <div>
          <div className="flex items-center justify-between text-[11px] mb-1.5">
            <Badge variant={p.statusV} dot>{p.status}</Badge>
            <span className="font-mono text-[var(--text-muted)]">{p.step}/{p.totalSteps}</span>
          </div>
          <ProgressBar value={(p.step / p.totalSteps) * 100} variant={p.step === p.totalSteps ? 'success' : 'aurora'} />
        </div>
        <div className="flex items-center justify-between pt-1 text-xs text-[var(--text-muted)]">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1"><Clock size={11} />{p.updated}</span>
            <span className="flex items-center gap-1"><Package size={11} />{p.assets} 资源</span>
          </div>
          <div className="relative">
            <button onClick={() => setMenuOpen(!menuOpen)} className="p-1 rounded hover:bg-[var(--bg-panel)] transition-colors cursor-pointer text-[var(--text-muted)] hover:text-[var(--text-secondary)]">
              <MoreHorizontal size={14} />
            </button>
            {menuOpen && (
              <div className="absolute right-0 top-7 w-36 bg-[var(--bg-panel)] border border-[var(--border-default)] rounded-[var(--radius-md)] shadow-[var(--shadow-elevated)] py-1 z-10">
                {[{ icon: <Copy size={12} />, label: '复制项目' }, { icon: <Download size={12} />, label: '导出' }, { icon: <Trash2 size={12} />, label: '删除', danger: true }].map(item => (
                  <button key={item.label} className={`w-full flex items-center gap-2 px-3 py-2 text-xs cursor-pointer transition-colors ${item.danger ? 'text-[var(--error)] hover:bg-[var(--error-muted)]' : 'text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)]'}`}>{item.icon}{item.label}</button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </Card>
  )
}

function GenerationQueue() {
  const tasks = [
    { name: '第 3 镜头视频', model: 'Agnes-Video-V2.0', status: 'generating' as const, progress: 65 },
    { name: '第 4 镜头视频', model: 'Agnes-Video-V2.0', status: 'queued' as const },
    { name: '第 5 镜头视频', model: 'Agnes-Video-V2.0', status: 'queued' as const },
    { name: '「仙途奇缘」第 7 镜头', model: 'Agnes-Video-V2.0', status: 'failed' as const },
  ]
  return (
    <Card className="overflow-hidden">
      <div className="px-4 py-3 border-b border-[var(--border-dim)] flex items-center justify-between">
        <h3 className="text-sm font-semibold text-[var(--text-primary)] flex items-center gap-2">
          <Zap size={14} className="text-[var(--accent-cyan)]" /> 生成队列
        </h3>
        <Badge variant="info" dot>{tasks.filter(t => t.status === 'generating' || t.status === 'queued').length} 进行中</Badge>
      </div>
      <div className="divide-y divide-[var(--border-dim)]">
        {tasks.map((t, i) => <GenerationTaskItem key={i} {...t} />)}
      </div>
    </Card>
  )
}

export default function DemoV3Page() {
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')
  const [filter, setFilter] = useState('all')
  const filtered = MOCK_PROJECTS.filter(p => {
    if (filter === 'active') return p.step > 0 && p.step < p.totalSteps
    if (filter === 'completed') return p.step === p.totalSteps
    if (filter === 'draft') return p.step === 0
    return true
  })

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-[var(--bg-base)]">
      <Header />
      <main className="flex-1 overflow-y-auto">
        <div className="max-w-[1400px] mx-auto px-6 py-6 space-y-8">
          {/* Stats + Usage */}
          <div className="grid grid-cols-5 gap-4">
            <div className="col-span-3 grid grid-cols-4 gap-4">
              <StatCard label="项目总数" value={5} icon={<FolderOpen size={16} />} />
              <StatCard label="进行中" value={2} sub="需要关注" icon={<Clock size={16} />} trend="up" />
              <StatCard label="本月视频" value="23 段" sub="↑ 12%" icon={<Video size={16} />} trend="up" />
              <StatCard label="失败任务" value={1} sub="需重试" icon={<AlertTriangle size={16} />} trend="down" />
            </div>
            <div className="col-span-2">
              <Card className="p-4 h-full">
                <h4 className="text-xs text-[var(--text-muted)] uppercase tracking-wider font-medium mb-3">资源用量</h4>
                <div className="space-y-3">
                  <UsageMeter label="Agnes 积分" used={420} total={1000} unit="pt" />
                  <UsageMeter label="豆包积分" used={150} total={500} unit="pt" />
                  <UsageMeter label="存储空间" used={2.4} total={10} unit="GB" />
                </div>
              </Card>
            </div>
          </div>

          {/* AI + Quick */}
          <div className="grid grid-cols-5 gap-6">
            <div className="col-span-3 space-y-4">
              <h2 className="text-sm font-semibold text-[var(--text-primary)] flex items-center gap-2">
                <Sparkles size={14} className="aurora-text" style={{ background: 'var(--gradient-aurora)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }} /> AI 建议
              </h2>
              <AIRecommendations />
            </div>
            <div className="col-span-2 space-y-4">
              <h2 className="text-sm font-semibold text-[var(--text-primary)]">快捷入口</h2>
              <QuickActions />
            </div>
          </div>

          {/* Projects */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-semibold text-[var(--text-primary)]">我的项目</h2>
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1 bg-[var(--bg-elevated)] border border-[var(--border-dim)] rounded-[var(--radius-md)] p-1">
                  {[{ k: 'all', l: '全部' }, { k: 'active', l: '进行中' }, { k: 'completed', l: '已完成' }, { k: 'draft', l: '草稿' }].map(f => (
                    <button key={f.k} onClick={() => setFilter(f.k)} className={`px-3 py-1.5 rounded-[var(--radius-sm)] text-xs font-medium transition-all cursor-pointer ${filter === f.k ? 'bg-[var(--primary)] text-white' : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'}`}>{f.l}</button>
                  ))}
                </div>
                <div className="flex items-center gap-1 bg-[var(--bg-elevated)] border border-[var(--border-dim)] rounded-[var(--radius-md)] p-1">
                  <button onClick={() => setViewMode('grid')} className={`p-1.5 rounded-[var(--radius-sm)] cursor-pointer transition-colors ${viewMode === 'grid' ? 'bg-[var(--bg-panel)] text-[var(--primary)]' : 'text-[var(--text-muted)]'}`}><Grid3X3 size={14} /></button>
                  <button onClick={() => setViewMode('list')} className={`p-1.5 rounded-[var(--radius-sm)] cursor-pointer transition-colors ${viewMode === 'list' ? 'bg-[var(--bg-panel)] text-[var(--primary)]' : 'text-[var(--text-muted)]'}`}><List size={14} /></button>
                </div>
              </div>
            </div>
            {filtered.length === 0 ? (
              <EmptyState icon={<FolderOpen size={28} />} title="没有匹配的项目" desc="调整筛选条件，或创建新项目开始创作" action={<Button variant="aurora" size="sm" icon={<Plus size={14} />}>新建项目</Button>} />
            ) : viewMode === 'grid' ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filtered.map(p => <ProjectCard key={p.id} p={p} />)}
              </div>
            ) : (
              <div className="space-y-2">
                {filtered.map(p => (
                  <Card key={p.id} hover className="cursor-pointer">
                    <div className="flex items-center gap-4 px-5 py-4">
                      <div className="w-12 h-16 rounded-[var(--radius-sm)] shrink-0" style={{ background: p.cover }} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="font-semibold text-[var(--text-primary)] truncate">{p.name}</h3>
                          <Badge variant={p.provider === 'ark' ? 'violet' : 'info'} dot>{p.provider === 'ark' ? '豆包' : 'Agnes'}</Badge>
                          <Badge variant={p.statusV}>{p.status}</Badge>
                        </div>
                        <div className="text-xs text-[var(--text-muted)]">{p.types.join(' / ')} · {p.duration}s/集 · {p.updated}</div>
                      </div>
                      <div className="w-32 shrink-0">
                        <ProgressBar value={(p.step / p.totalSteps) * 100} variant="aurora" />
                        <div className="text-[11px] text-[var(--text-muted)] mt-1 font-mono text-right">{p.step}/{p.totalSteps}</div>
                      </div>
                      <ArrowRight size={16} className="text-[var(--text-muted)] group-hover:text-[var(--primary)] transition-colors shrink-0" />
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </div>

          {/* Activity + Queue */}
          <div className="grid grid-cols-5 gap-6">
            <div className="col-span-3">
              <Card className="overflow-hidden">
                <div className="px-4 py-3 border-b border-[var(--border-dim)]"><h3 className="text-sm font-semibold text-[var(--text-primary)]">最近活动</h3></div>
                <div className="p-4 space-y-0 divide-y divide-[var(--border-dim)]">
                  {MOCK_ACTIVITIES.map((a, i) => <ActivityItem key={i} {...a} />)}
                </div>
              </Card>
            </div>
            <div className="col-span-2"><GenerationQueue /></div>
          </div>
        </div>
      </main>
    </div>
  )
}
