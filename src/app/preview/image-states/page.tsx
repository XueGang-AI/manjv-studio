'use client'

/**
 * 开发预览：图片卡片状态视觉验证。
 * --------------------------------------------
 * 复用真实角色图 URL，渲染普通/选中/生成中/失败/已确认五种状态，
 * 验证 Film Atelier 图片卡片视觉语义（边框色 + 图标 + 文案，不只靠颜色）。
 * 开发预览页，生产导航无入口。
 */
import { CheckCircle2, AlertCircle, Loader2, Image as ImageIcon } from 'lucide-react'

// 本地脱敏占位图（data URI），不固化真实业务对象存储 URL。
// 生产预览如需真实图片，应通过环境变量或本地开发查询获取。
const PLACEHOLDER_IMG =
  'data:image/svg+xml,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="270" height="480" viewBox="0 0 270 480">' +
    '<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">' +
    '<stop offset="0" stop-color="#292623"/><stop offset="1" stop-color="#1a1917"/>' +
    '</linearGradient></defs>' +
    '<rect width="270" height="480" fill="url(#g)"/>' +
    '<circle cx="135" cy="180" r="60" fill="#3a3631"/>' +
    '<path d="M75 480 Q135 320 195 480 Z" fill="#3a3631"/>' +
    '</svg>'
  )

type State = 'normal' | 'selected' | 'generating' | 'failed' | 'confirmed'

const STATE_BORDER: Record<State, string> = {
  normal: 'border-[var(--border-default)]',
  selected: 'border-[var(--accent-primary)]/60',
  generating: 'border-[var(--status-generating)]/45',
  failed: 'border-[var(--status-error)]/55',
  confirmed: 'border-[var(--status-success)]/60',
}

const STATE_BADGE: Record<State, { text: string; cls: string; icon: React.ReactNode }> = {
  normal: { text: '待选择', cls: 'text-[var(--text-secondary)] border-[var(--border-default)]', icon: null },
  selected: { text: '已选择', cls: 'text-[var(--accent-primary)] border-[var(--accent-border)] bg-[var(--accent-soft)]', icon: <CheckCircle2 size={11} /> },
  generating: { text: '生成中', cls: 'text-[var(--status-generating)] border-[var(--status-generating)]/40 bg-[var(--generating-soft)]', icon: <Loader2 size={11} className="animate-spin" /> },
  failed: { text: '生成失败', cls: 'text-[var(--status-error)] border-[var(--status-error)]/40 bg-[var(--error-soft)]', icon: <AlertCircle size={11} /> },
  confirmed: { text: '已确认', cls: 'text-[var(--status-success)] border-[var(--status-success)]/40 bg-[var(--success-soft)]', icon: <CheckCircle2 size={11} /> },
}

function ImageCard({ state, label }: { state: State; label: string }) {
  const badge = STATE_BADGE[state]
  return (
    <div className={`relative border rounded-lg overflow-hidden bg-[var(--bg-card)] ${STATE_BORDER[state]}`}>
      <div className="aspect-[9/16] bg-[var(--bg-panel)] relative">
        {state === 'generating' ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <img src={PLACEHOLDER_IMG} alt="" className="absolute inset-0 w-full h-full object-cover opacity-25" />
            <Loader2 size={28} className="text-[var(--status-generating)] animate-spin mb-1 relative" />
            <span className="text-[10px] text-[var(--text-tertiary)] relative">生成中</span>
          </div>
        ) : state === 'failed' ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <img src={PLACEHOLDER_IMG} alt="" className="absolute inset-0 w-full h-full object-cover opacity-20" />
            <AlertCircle size={28} className="text-[var(--status-error)] mb-1 relative" />
            <span className="text-[10px] text-[var(--status-error)] relative">图片生成失败</span>
          </div>
        ) : (
          <img src={PLACEHOLDER_IMG} alt={label} className="w-full h-full object-cover"
            onError={(e) => { (e.target as HTMLImageElement).style.opacity = '0.2' }}
          />
        )}
        {(state === 'confirmed' || state === 'selected') && (
          <div className={`absolute top-1 right-1 rounded-full p-0.5 ${state === 'confirmed' ? 'bg-[var(--status-success)]' : 'bg-[var(--accent-primary)]'}`}>
            <CheckCircle2 size={12} className={state === 'confirmed' ? 'text-white' : 'text-[var(--text-inverse)]'} />
          </div>
        )}
      </div>
      <div className="px-2 py-1.5 flex items-center justify-between gap-1">
        <span className="text-[10px] font-medium text-[var(--text-secondary)] truncate">{label}</span>
        <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full border text-[10px] leading-none ${badge.cls}`}>
          {badge.icon}
          {badge.text}
        </span>
      </div>
    </div>
  )
}

export default function ImageStatesPreviewPage() {
  return (
    <div className="min-h-screen bg-[var(--bg-base)] p-6">
      <div className="max-w-5xl mx-auto">
        <h1 className="text-xl font-bold text-[var(--text-primary)] mb-1">图片卡片状态预览</h1>
        <p className="text-sm text-[var(--text-tertiary)] mb-6">普通 / 选中 / 生成中 / 失败 / 已确认 — 状态不只靠颜色</p>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <ImageCard state="normal" label="正面全身" />
          <ImageCard state="selected" label="正面半身" />
          <ImageCard state="generating" label="左侧面" />
          <ImageCard state="failed" label="右侧面" />
          <ImageCard state="confirmed" label="背面" />
        </div>
      </div>
    </div>
  )
}
