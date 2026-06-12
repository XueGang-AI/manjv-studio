/**
 * Manjv Studio V2 — 项目工作流页（分镜脚本步骤）
 *
 * 核心创作体验页面：
 * - 顶部胶片轨道 Step Navigator（5 种状态）
 * - 左侧：分镜列表
 * - 中间：当前镜头详情
 * - 右侧：AI 助手面板 + 项目概览 + 质量检查
 * - 底部：生成队列 + 版本历史
 */
'use client'

import React, { useState } from 'react'
import {
  Film, Clock, Users, Image, Video, Clapperboard,
  ChevronRight, Check, Lock, Sparkles, RefreshCw,
  ArrowRight, ArrowLeft, RotateCcw, ListTodo,
  Layers, Play, ChevronDown, ChevronUp, Zap,
  AlertTriangle, MoreHorizontal, Settings, FileCode,
  LayoutDashboard, MessageSquare, Shield, History,
  Wrench, Eye, X, Plus,
} from 'lucide-react'
import {
  Badge, Button, Card, ProgressBar, QualityCheckItem,
  GenerationTaskItem, ActivityItem, AISuggestionCard,
  ModelSelector, UsageMeter,
} from '../components'

// ===== Mock Data =====
const STEPS = [
  { key: 'project', label: '项目设定', icon: <Settings size={14} />, status: 'completed' as const },
  { key: 'story', label: '故事脚本', icon: <Film size={14} />, status: 'completed' as const },
  { key: 'characters', label: '角色设定', icon: <Users size={14} />, status: 'completed' as const },
  { key: 'char-img', label: '角色图', icon: <Image size={14} />, status: 'completed' as const },
  { key: 'storyboard', label: '分镜脚本', icon: <Film size={14} />, status: 'active' as const },
  { key: 'shot-img', label: '分镜图', icon: <Image size={14} />, status: 'locked' as const },
  { key: 'shot-vid', label: '视频生成', icon: <Video size={14} />, status: 'generating' as const },
  { key: 'final', label: '成片合成', icon: <Clapperboard size={14} />, status: 'locked' as const },
]

const SHOTS = [
  { id: 1, name: '雨中奔跑', start: 0, end: 8, loc: '城市街道', emotion: '紧张', dialogue: '快跑！', status: 'confirmed' as const },
  { id: 2, name: '手机倒计时', start: 8, end: 14, loc: '城市街道', emotion: '紧迫', dialogue: '', status: 'confirmed' as const },
  { id: 3, name: '巷口转弯', start: 14, end: 22, loc: '暗巷', emotion: '恐惧', dialogue: '', status: 'confirmed' as const },
  { id: 4, name: '意外相遇', start: 22, end: 32, loc: '暗巷', emotion: '震惊', dialogue: '你……你怎么会在这里？', status: 'pending' as const },
  { id: 5, name: '对视特写', start: 32, end: 40, loc: '暗巷', emotion: '暧昧', dialogue: '', status: 'pending' as const },
  { id: 6, name: '联手脱险', start: 40, end: 50, loc: '暗巷→天台', emotion: '紧张', dialogue: '跟我来！', status: 'pending' as const },
  { id: 7, name: '天台喘息', start: 50, end: 56, loc: '天台', emotion: '释放', dialogue: '', status: 'pending' as const },
  { id: 8, name: '城市全景', start: 56, end: 60, loc: '天台远眺', emotion: '悬念', dialogue: '', status: 'pending' as const },
]

// ===== Step Navigator =====
function StepNavigator() {
  const statusStyles = {
    completed: { node: 'bg-[var(--success)] text-white', label: 'text-[var(--success)]', line: 'bg-[var(--success)]' },
    active: { node: 'bg-[var(--primary)] text-white shadow-[var(--glow-primary)]', label: 'text-[var(--primary)]', line: 'bg-[var(--primary)]' },
    generating: { node: 'bg-[var(--accent-cyan)] text-[var(--bg-base)] shadow-[var(--glow-cyan)] animate-pulse-glow', label: 'text-[var(--accent-cyan)]', line: 'bg-[var(--border-default)]' },
    locked: { node: 'bg-[var(--bg-panel)] text-[var(--text-muted)]', label: 'text-[var(--text-muted)]', line: 'bg-[var(--border-dim)]' },
    error: { node: 'bg-[var(--error)] text-white', label: 'text-[var(--error)]', line: 'bg-[var(--border-default)]' },
  }
  return (
    <div className="h-14 border-b border-[var(--border-dim)] bg-[var(--bg-surface)]/80 backdrop-blur-md flex items-center px-6 overflow-x-auto">
      <div className="flex items-center gap-0">
        {STEPS.map((step, i) => {
          const s = statusStyles[step.status]
          return (
            <React.Fragment key={step.key}>
              {i > 0 && <div className={`w-6 h-0.5 mx-1.5 rounded-full ${s.line}`} />}
              <div className="flex items-center gap-2 cursor-pointer group">
                <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-all ${s.node}`}>
                  {step.status === 'completed' ? <Check size={12} /> : step.status === 'locked' ? <Lock size={10} /> : step.icon}
                </div>
                <span className={`text-xs font-medium whitespace-nowrap hidden lg:block ${s.label}`}>{step.label}</span>
                {step.status === 'generating' && <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent-cyan)] animate-pulse-glow" />}
              </div>
            </React.Fragment>
          )
        })}
      </div>
      <div className="ml-auto flex items-center gap-2">
        <ModelSelector active="agnes" />
        <Badge variant="info" dot>3 个视频生成中</Badge>
      </div>
    </div>
  )
}

// ===== Left: Shot List =====
function ShotList({ activeShot, onSelect }: { activeShot: number; onSelect: (id: number) => void }) {
  return (
    <div className="w-56 border-r border-[var(--border-dim)] bg-[var(--bg-surface)] flex flex-col overflow-hidden">
      <div className="px-3 py-3 border-b border-[var(--border-dim)] flex items-center justify-between">
        <h3 className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider">镜头列表</h3>
        <Badge variant="default">{SHOTS.length}</Badge>
      </div>
      <div className="flex-1 overflow-y-auto">
        {SHOTS.map(shot => {
          const isActive = activeShot === shot.id
          const statusIcons = {
            confirmed: <Check size={10} className="text-[var(--success)]" />,
            pending: <Clock size={10} className="text-[var(--text-muted)]" />,
            failed: <AlertTriangle size={10} className="text-[var(--error)]" />,
          }
          return (
            <button key={shot.id} onClick={() => onSelect(shot.id)}
              className={`w-full text-left px-3 py-2.5 border-b border-[var(--border-dim)] transition-colors cursor-pointer ${
                isActive ? 'bg-[var(--primary-muted)] border-l-2 border-l-[var(--primary)]' : 'hover:bg-[var(--bg-elevated)] border-l-2 border-l-transparent'
              }`}>
              <div className="flex items-center gap-2 mb-0.5">
                <span className={`w-5 h-5 rounded-[var(--radius-sm)] flex items-center justify-center text-[10px] font-bold ${
                  isActive ? 'bg-[var(--primary)] text-white' : 'bg-[var(--bg-panel)] text-[var(--text-muted)]'
                }`}>{shot.id}</span>
                <span className="text-sm text-[var(--text-primary)] font-medium truncate">{shot.name}</span>
                <span className="ml-auto">{statusIcons[shot.status]}</span>
              </div>
              <div className="flex items-center gap-2 text-[10px] text-[var(--text-muted)] ml-7">
                <span className="font-mono">{shot.start}-{shot.end}s</span>
                <span>·</span>
                <span className="truncate">{shot.loc}</span>
              </div>
            </button>
          )
        })}
      </div>
      <div className="p-3 border-t border-[var(--border-dim)]">
        <Button variant="secondary" size="sm" className="w-full" icon={<Plus size={12} />}>添加镜头</Button>
      </div>
    </div>
  )
}

// ===== Center: Shot Detail =====
function ShotDetail({ shot }: { shot: typeof SHOTS[0] }) {
  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-5">
      {/* Shot header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="w-8 h-8 rounded-[var(--radius-md)] bg-[var(--primary)] text-white flex items-center justify-center text-sm font-bold">{shot.id}</span>
            <h2 className="text-xl font-bold text-[var(--text-primary)]">{shot.name}</h2>
            <Badge variant={shot.status === 'confirmed' ? 'success' : 'warning'} dot>
              {shot.status === 'confirmed' ? '已确认' : '待确认'}
            </Badge>
          </div>
          <div className="flex items-center gap-3 text-xs text-[var(--text-muted)] ml-10">
            <span className="font-mono">{shot.start}-{shot.end}s ({shot.end - shot.start}s)</span>
            <span>·</span>
            <span>{shot.loc}</span>
            <span>·</span>
            <span>情绪：{shot.emotion}</span>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" icon={<RefreshCw size={12} />}>重新生成</Button>
          {shot.status !== 'confirmed' && <Button variant="primary" size="sm" icon={<Check size={12} />}>确认</Button>}
        </div>
      </div>

      {/* Image preview placeholder */}
      <Card className="overflow-hidden">
        <div className="aspect-[16/9] bg-[var(--bg-panel)] flex items-center justify-center relative">
          <div className="text-center">
            <Image size={48} className="text-[var(--text-muted)] mx-auto mb-3" />
            <p className="text-sm text-[var(--text-muted)]">分镜图待生成</p>
            <Button variant="cyan" size="sm" className="mt-3" icon={<Sparkles size={12} />}>生成分镜图</Button>
          </div>
          {/* Duration badge */}
          <div className="absolute top-3 right-3">
            <Badge variant="default">{`${shot.end - shot.start}s · ${shot.loc}`}</Badge>
          </div>
        </div>
      </Card>

      {/* Prompt details */}
      <div className="grid grid-cols-2 gap-4">
        <Card className="p-4">
          <div className="text-[10px] font-semibold text-[var(--primary)] uppercase tracking-wider mb-2">图片 Prompt</div>
          <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
            A young woman running through rain-soaked city streets at night, neon reflections on wet asphalt, cinematic lighting, medium shot, tense atmosphere, Korean manhwa style
          </p>
          <div className="mt-3 pt-2 border-t border-[var(--border-dim)] text-[10px] text-[var(--text-muted)] flex items-center gap-2">
            <span>Negative: ugly, deformed, bad anatomy…</span>
            <Button variant="ghost" size="sm" className="!h-5 !text-[10px]">展开</Button>
          </div>
        </Card>
        <Card className="p-4">
          <div className="text-[10px] font-semibold text-[var(--accent-cyan)] uppercase tracking-wider mb-2">视频 Prompt</div>
          <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
            Camera tracks alongside running figure, rain splashing, quick pace, urban night scene, handheld feel
          </p>
          {shot.dialogue && (
            <div className="mt-3 pt-2 border-t border-[var(--border-dim)]">
              <div className="text-[10px] font-semibold text-[var(--warning)] uppercase tracking-wider mb-1">台词</div>
              <p className="text-sm text-[var(--text-primary)] italic bg-[var(--warning-muted)] px-2 py-1 rounded-[var(--radius-sm)]">「{shot.dialogue}」</p>
            </div>
          )}
        </Card>
      </div>

      {/* Shot metadata */}
      <Card className="p-4">
        <h4 className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-3">镜头详情</h4>
        <div className="grid grid-cols-3 md:grid-cols-6 gap-3 text-xs">
          {[
            { label: '景别', value: '中景' },
            { label: '角度', value: '平视' },
            { label: '运镜', value: '跟拍' },
            { label: '光影', value: '霓虹反光' },
            { label: '色调', value: '冷色调' },
            { label: '特效', value: '雨滴粒子' },
          ].map(f => (
            <div key={f.label} className="bg-[var(--bg-panel)] rounded-[var(--radius-sm)] px-2.5 py-2">
              <div className="text-[10px] text-[var(--text-muted)]">{f.label}</div>
              <div className="text-[var(--text-secondary)] font-medium mt-0.5">{f.value}</div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  )
}

// ===== Right: AI Assistant + Overview =====
function RightPanel() {
  const [activeTab, setActiveTab] = useState<'ai' | 'overview' | 'qc'>('ai')
  return (
    <div className="w-80 border-l border-[var(--border-dim)] bg-[var(--bg-surface)] flex flex-col overflow-hidden">
      {/* Tab bar */}
      <div className="flex border-b border-[var(--border-dim)]">
        {([
          { key: 'ai' as const, label: 'AI 助手', icon: <Sparkles size={12} /> },
          { key: 'overview' as const, label: '概览', icon: <Eye size={12} /> },
          { key: 'qc' as const, label: '质量', icon: <Shield size={12} /> },
        ]).map(tab => (
          <button key={tab.key} onClick={() => setActiveTab(tab.key)}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-medium transition-colors cursor-pointer border-b-2 ${
              activeTab === tab.key ? 'text-[var(--primary)] border-[var(--primary)]' : 'text-[var(--text-muted)] border-transparent hover:text-[var(--text-secondary)]'
            }`}>
            {tab.icon}{tab.label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {activeTab === 'ai' && (
          <>
            <AISuggestionCard title="分镜脚本待确认" desc="当前 8 个镜头已生成，建议检查后确认以进入下一步。" action={<Button variant="primary" size="sm" icon={<Check size={12} />}>确认分镜</Button>} variant="cyan" />
            <AISuggestionCard title="建议补充台词" desc="镜头 3、5、7、8 缺少对白，建议补充以提升视频配音效果。" action={<Button variant="secondary" size="sm" icon={<Wrench size={12} />}>一键补全</Button>} variant="warning" />
            <AISuggestionCard title="角色「林晓」缺少左侧面图" desc="一致性模式需要 5 个角度，当前只有 4 个。" action={<Button variant="secondary" size="sm">去补全</Button>} />

            {/* AI Chat hint */}
            <div className="bg-[var(--bg-elevated)] border border-[var(--border-dim)] rounded-[var(--radius-md)] p-3">
              <div className="flex items-center gap-2 mb-2">
                <MessageSquare size={14} className="text-[var(--primary)]" />
                <span className="text-xs font-semibold text-[var(--text-primary)]">AI 对话</span>
              </div>
              <p className="text-[11px] text-[var(--text-muted)] leading-relaxed">向 AI 提问关于当前分镜的优化建议，如"如何增强开场紧张感？"</p>
              <div className="mt-2 flex gap-1.5">
                <input className="flex-1 h-8 px-2.5 bg-[var(--bg-panel)] border border-[var(--border-dim)] rounded-[var(--radius-sm)] text-xs text-[var(--text-primary)] placeholder-[var(--text-muted)]" placeholder="输入问题…" />
                <Button variant="primary" size="sm" icon={<ArrowRight size={12} />} className="!px-2">发送</Button>
              </div>
            </div>
          </>
        )}

        {activeTab === 'overview' && (
          <>
            <Card className="p-3">
              <h4 className="text-xs font-semibold text-[var(--text-primary)] mb-2">项目信息</h4>
              {[
                { l: '名称', v: '都市雨夜' },
                { l: '类型', v: '都市 / 悬疑' },
                { l: '画风', v: '韩漫 / 电影感' },
                { l: '时长', v: '60s/集' },
                { l: '模型', v: 'Agnes（免费）' },
                { l: '比例', v: '9:16' },
              ].map(i => (
                <div key={i.l} className="flex justify-between text-xs py-1.5 border-b border-[var(--border-dim)] last:border-0">
                  <span className="text-[var(--text-muted)]">{i.l}</span>
                  <span className="text-[var(--text-secondary)]">{i.v}</span>
                </div>
              ))}
            </Card>
            <Card className="p-3">
              <h4 className="text-xs font-semibold text-[var(--text-primary)] mb-2">数据统计</h4>
              {[
                { l: '角色', v: '3 个' },
                { l: '角色图', v: '12 张' },
                { l: '镜头', v: '8 个' },
                { l: '生成任务', v: '15 个' },
                { l: '成功率', v: '93%' },
              ].map(i => (
                <div key={i.l} className="flex justify-between text-xs py-1.5 border-b border-[var(--border-dim)] last:border-0">
                  <span className="text-[var(--text-muted)]">{i.l}</span>
                  <span className="text-[var(--text-primary)] font-mono">{i.v}</span>
                </div>
              ))}
            </Card>
            <UsageMeter label="Agnes 积分" used={420} total={1000} unit="pt" />
          </>
        )}

        {activeTab === 'qc' && (
          <>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-2xl font-bold font-mono text-[var(--text-primary)]">87</span>
              <span className="text-sm text-[var(--text-muted)]">/ 100 分</span>
            </div>
            <ProgressBar value={87} variant="primary" size="md" />
            <div className="mt-4 space-y-1">
              <QualityCheckItem label="故事方案完整" status="pass" detail="✓" />
              <QualityCheckItem label="所有角色已确认" status="pass" detail="3/3" />
              <QualityCheckItem label="角色参考图完整" status="warn" detail="11/15 张" />
              <QualityCheckItem label="分镜镜头时长合理" status="pass" detail="总时长 60s" />
              <QualityCheckItem label="部分镜头缺少台词" status="warn" detail="4/8 镜头" />
              <QualityCheckItem label="所有图片 Prompt 已生成" status="pass" detail="8/8" />
            </div>
            <div className="mt-4">
              <AISuggestionCard title="一键修复" desc="自动补充缺失台词和角色图，预计消耗 50 积分。" variant="cyan"
                action={<Button variant="cyan" size="sm" icon={<Wrench size={12} />}>一键修复</Button>} />
            </div>
          </>
        )}
      </div>

      {/* Bottom: Generation Queue */}
      <div className="border-t border-[var(--border-dim)]">
        <div className="px-4 py-2 flex items-center justify-between">
          <h4 className="text-xs font-semibold text-[var(--text-muted)] flex items-center gap-1.5"><Zap size={12} className="text-[var(--accent-cyan)]" />生成队列</h4>
          <Badge variant="cyan" dot>3</Badge>
        </div>
        <div className="max-h-48 overflow-y-auto">
          <GenerationTaskItem name="第 3 镜头视频" model="Agnes-Video-V2.0" status="generating" progress={65} />
          <GenerationTaskItem name="第 4 镜头视频" model="Agnes-Video-V2.0" status="queued" />
          <GenerationTaskItem name="第 5 镜头视频" model="Agnes-Video-V2.0" status="queued" />
        </div>
      </div>
    </div>
  )
}

// ===== Timeline Bar (below shot detail) =====
function TimelineBar({ activeShot }: { activeShot: number }) {
  return (
    <div className="border-t border-[var(--border-dim)] bg-[var(--bg-surface)] px-6 py-3">
      <div className="flex items-center gap-2 mb-2">
        <Film size={14} className="text-[var(--primary)]" />
        <span className="text-xs font-semibold text-[var(--text-muted)]">时间线</span>
        <span className="text-[10px] text-[var(--text-muted)] font-mono">0s — 60s</span>
      </div>
      <div className="flex gap-0.5">
        {SHOTS.map(shot => {
          const w = ((shot.end - shot.start) / 60) * 100
          const isActive = activeShot === shot.id
          const colors = {
            confirmed: isActive ? 'bg-[var(--success)]' : 'bg-[var(--success)]/40',
            pending: isActive ? 'bg-[var(--primary)]' : 'bg-[var(--bg-panel)]',
            failed: 'bg-[var(--error)]/60',
          }
          return (
            <div key={shot.id} className={`h-6 rounded-[var(--radius-sm)] flex items-center justify-center text-[10px] font-bold transition-all ${colors[shot.status]}`}
              style={{ width: `${w}%` }}
              title={`${shot.name} (${shot.end - shot.start}s)`}>
              <span className={`truncate px-1 ${shot.status === 'pending' && !isActive ? 'text-[var(--text-muted)]' : 'text-white'}`}>{shot.id}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ===== Main Page =====
export default function WorkflowV2Page() {
  const [activeShot, setActiveShot] = useState(4)

  return (
    <div className="flex flex-col h-screen bg-[var(--bg-base)]">
      {/* Top nav */}
      <div className="h-12 border-b border-[var(--border-dim)] bg-[var(--bg-surface)] flex items-center px-5 gap-4 shrink-0">
        <button className="flex items-center gap-1.5 text-sm text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors cursor-pointer">
          <ArrowLeft size={14} /> 返回项目列表
        </button>
        <ChevronRight size={12} className="text-[var(--text-muted)]" />
        <span className="text-sm font-semibold text-[var(--text-primary)]">都市雨夜</span>
        <Badge variant="info" dot>分镜脚本</Badge>
        <div className="ml-auto flex items-center gap-2">
          <Button variant="ghost" size="sm" icon={<History size={12} />}>版本历史</Button>
          <Button variant="ghost" size="sm" icon={<ListTodo size={12} />}>任务</Button>
        </div>
      </div>

      {/* Step Navigator */}
      <StepNavigator />

      {/* Main content area */}
      <div className="flex-1 flex overflow-hidden">
        <ShotList activeShot={activeShot} onSelect={setActiveShot} />
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="flex-1 flex overflow-hidden">
            <ShotDetail shot={SHOTS.find(s => s.id === activeShot) || SHOTS[0]} />
            <RightPanel />
          </div>
          <TimelineBar activeShot={activeShot} />
        </div>
      </div>
    </div>
  )
}
