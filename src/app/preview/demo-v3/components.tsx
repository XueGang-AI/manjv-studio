/**
 * Manjv Studio V3 — Aurora Studio 组件库
 *
 * 核心原则：
 * - 极光渐变只做线（1-2px），不做面
 * - Indigo 为主色，Cyan 为 AI 信号色
 * - 所有发光效果极轻微（0.12 alpha）
 * - 灰度层级靠 border 透明度区分
 */

type BadgeVariant = 'default' | 'primary' | 'success' | 'warning' | 'danger' | 'info' | 'cyan' | 'violet'

const BADGE_MAP: Record<BadgeVariant, string> = {
  default: 'bg-[var(--bg-panel)] text-[var(--text-secondary)]',
  primary: 'bg-[var(--primary-muted)] text-[var(--primary-hover)]',
  success: 'bg-[var(--success-muted)] text-[var(--success)]',
  warning: 'bg-[var(--warning-muted)] text-[var(--warning)]',
  danger: 'bg-[var(--error-muted)] text-[var(--error)]',
  info: 'bg-[var(--info-muted)] text-[var(--info)]',
  cyan: 'bg-[var(--accent-cyan-muted)] text-[var(--accent-cyan)]',
  violet: 'bg-[var(--accent-violet-muted)] text-[var(--accent-violet)]',
}

export function Badge({ children, variant = 'default', dot }: { children: React.ReactNode; variant?: BadgeVariant; dot?: boolean }) {
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-[var(--radius-sm)] text-xs font-medium ${BADGE_MAP[variant]}`}>
      {dot && <span className="w-1.5 h-1.5 rounded-full bg-current" />}
      {children}
    </span>
  )
}

type BtnV = 'primary' | 'aurora' | 'secondary' | 'ghost' | 'danger' | 'cyan'
type BtnS = 'sm' | 'md' | 'lg'

const BTN_V: Record<BtnV, string> = {
  primary: 'bg-[var(--primary)] text-white hover:bg-[var(--primary-hover)]',
  aurora: 'text-white shadow-[var(--glow-aurora)]', // 需要内联 background
  secondary: 'bg-[var(--bg-panel)] text-[var(--text-primary)] border border-[var(--border-default)] hover:border-[var(--border-bright)] hover:bg-[var(--bg-elevated)]',
  ghost: 'bg-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-panel)]',
  danger: 'bg-[var(--error-muted)] text-[var(--error)] hover:bg-[var(--error)] hover:text-white',
  cyan: 'bg-[var(--accent-cyan-muted)] text-[var(--accent-cyan)] hover:bg-[var(--accent-cyan)] hover:text-[var(--bg-base)]',
}
const BTN_S: Record<BtnS, string> = {
  sm: 'h-8 px-3 text-xs gap-1.5',
  md: 'h-10 px-4 text-sm gap-2',
  lg: 'h-12 px-6 text-base gap-2.5',
}

export function Button({ children, variant = 'primary', size = 'md', disabled = false, icon, className = '' }: {
  children: React.ReactNode; variant?: BtnV; size?: BtnS; disabled?: boolean
  icon?: React.ReactNode; className?: string
}) {
  const auroraStyle = variant === 'aurora' ? { background: 'var(--gradient-aurora)' } : {}
  return (
    <button disabled={disabled} style={auroraStyle}
      className={`
      inline-flex items-center justify-center font-medium rounded-[var(--radius-md)]
      transition-all duration-200 cursor-pointer
      disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none
      active:scale-[0.97] ${BTN_V[variant]} ${BTN_S[size]} ${className}
    `}>
      {icon}{children}
    </button>
  )
}

export function Card({ children, className = '', hover = false, auroraBorder = false }: {
  children: React.ReactNode; className?: string; hover?: boolean; auroraBorder?: boolean
}) {
  return (
    <div className={`
      bg-[var(--bg-elevated)] border border-[var(--border-dim)] rounded-[var(--radius-lg)]
      shadow-[var(--shadow-card)] ${auroraBorder ? 'aurora-border' : ''}
      ${hover ? 'transition-all duration-200 hover:border-[var(--border-bright)] hover:shadow-[var(--shadow-elevated)] hover:-translate-y-px' : ''}
      ${className}
    `}>
      {children}
    </div>
  )
}

export function ProgressBar({ value = 0, variant = 'primary', size = 'sm' }: {
  value: number; variant?: 'primary' | 'aurora' | 'cyan' | 'success' | 'warning'; size?: 'sm' | 'md'
}) {
  const c: Record<string, string> = {
    primary: 'bg-[var(--primary)]',
    aurora: '', // handled inline
    cyan: 'bg-[var(--accent-cyan)]',
    success: 'bg-[var(--success)]',
    warning: 'bg-[var(--warning)]',
  }
  const h = size === 'sm' ? 'h-1.5' : 'h-2.5'
  const isAurora = variant === 'aurora'
  return (
    <div className={`w-full ${h} bg-[var(--bg-panel)] rounded-full overflow-hidden`}>
      <div className={`${h} rounded-full transition-all duration-500 ease-out ${isAurora ? '' : c[variant]}`}
        style={isAurora ? { width: `${Math.min(100, Math.max(0, value))}%`, background: 'var(--gradient-aurora)' } : { width: `${Math.min(100, Math.max(0, value))}%` }} />
    </div>
  )
}

export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse bg-[var(--bg-panel)] rounded-[var(--radius-md)] ${className}`} />
}

export function EmptyState({ icon, title, desc, action }: {
  icon: React.ReactNode; title: string; desc: string; action?: React.ReactNode
}) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="w-16 h-16 rounded-[var(--radius-xl)] bg-[var(--primary-muted)] flex items-center justify-center mb-5 text-[var(--primary)]">
        {icon}
      </div>
      <h3 className="text-lg font-semibold text-[var(--text-primary)] mb-2">{title}</h3>
      <p className="text-sm text-[var(--text-muted)] max-w-sm mb-6">{desc}</p>
      {action}
    </div>
  )
}

export function StatCard({ label, value, sub, icon, trend }: {
  label: string; value: string | number; sub?: string
  icon?: React.ReactNode; trend?: 'up' | 'down' | 'neutral'
}) {
  const tc = trend === 'up' ? 'text-[var(--success)]' : trend === 'down' ? 'text-[var(--error)]' : 'text-[var(--text-muted)]'
  return (
    <Card className="p-4">
      <div className="flex items-start justify-between mb-3">
        <span className="text-[11px] text-[var(--text-muted)] uppercase tracking-wider font-medium">{label}</span>
        {icon && <div className="text-[var(--text-muted)]">{icon}</div>}
      </div>
      <div className="text-2xl font-bold font-mono tracking-tight text-[var(--text-primary)]">{value}</div>
      {sub && <div className={`text-xs mt-1.5 ${tc}`}>{sub}</div>}
    </Card>
  )
}

export function AISuggestionCard({ title, desc, action, variant = 'primary' }: {
  title: string; desc: string; action?: React.ReactNode; variant?: 'primary' | 'cyan' | 'warning'
}) {
  const colors = {
    primary: 'bg-[var(--primary-muted)]',
    cyan: 'bg-[var(--accent-cyan-muted)]',
    warning: 'bg-[var(--warning-muted)]',
  }
  const iconColors = {
    primary: 'text-[var(--primary)]',
    cyan: 'text-[var(--accent-cyan)]',
    warning: 'text-[var(--warning)]',
  }
  const useAurora = variant === 'primary'
  return (
    <div className={`rounded-[var(--radius-md)] p-3.5 ${colors[variant]} ${useAurora ? 'aurora-border' : ''}`}>
      <div className="flex items-start gap-3">
        <div className={`w-8 h-8 rounded-[var(--radius-sm)] flex items-center justify-center shrink-0 bg-[var(--bg-base)] ${iconColors[variant]}`}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>
        </div>
        <div className="flex-1 min-w-0">
          <h4 className="text-sm font-semibold text-[var(--text-primary)]">{title}</h4>
          <p className="text-xs text-[var(--text-muted)] mt-0.5 leading-relaxed">{desc}</p>
          {action && <div className="mt-2">{action}</div>}
        </div>
      </div>
    </div>
  )
}

export function GenerationTaskItem({ name, model, status, progress }: {
  name: string; model: string; status: 'queued' | 'generating' | 'done' | 'failed'; progress?: number
}) {
  const sMap = {
    queued: { label: '排队中', color: 'text-[var(--text-muted)]', dot: 'bg-[var(--text-muted)]' },
    generating: { label: '生成中', color: 'text-[var(--accent-cyan)]', dot: 'bg-[var(--accent-cyan)] animate-pulse-glow' },
    done: { label: '已完成', color: 'text-[var(--success)]', dot: 'bg-[var(--success)]' },
    failed: { label: '失败', color: 'text-[var(--error)]', dot: 'bg-[var(--error)]' },
  }
  const s = sMap[status]
  return (
    <div className="flex items-center gap-3 py-2.5 px-3 rounded-[var(--radius-md)] hover:bg-[var(--bg-panel)] transition-colors">
      <span className={`w-2 h-2 rounded-full ${s.dot}`} />
      <div className="flex-1 min-w-0">
        <div className="text-sm text-[var(--text-primary)] truncate">{name}</div>
        <div className="text-[11px] text-[var(--text-muted)] mt-0.5 font-mono">{model}</div>
      </div>
      {status === 'generating' && progress !== undefined && (
        <div className="w-16"><ProgressBar value={progress} variant="cyan" size="sm" /></div>
      )}
      <span className={`text-xs font-medium ${s.color} shrink-0`}>{s.label}</span>
    </div>
  )
}

export function ActivityItem({ icon, text, time, variant = 'default' }: {
  icon: React.ReactNode; text: string; time: string; variant?: 'default' | 'success' | 'warning' | 'error'
}) {
  const colors = { default: 'text-[var(--text-muted)]', success: 'text-[var(--success)]', warning: 'text-[var(--warning)]', error: 'text-[var(--error)]' }
  return (
    <div className="flex items-start gap-3 py-2">
      <div className={`mt-0.5 ${colors[variant]}`}>{icon}</div>
      <div className="flex-1 min-w-0">
        <p className="text-sm text-[var(--text-secondary)]">{text}</p>
        <p className="text-[11px] text-[var(--text-muted)] mt-0.5">{time}</p>
      </div>
    </div>
  )
}

export function QualityCheckItem({ label, status, detail }: {
  label: string; status: 'pass' | 'warn' | 'fail'; detail?: string
}) {
  const icons = {
    pass: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--success)" strokeWidth="2.5"><path d="M20 6L9 17l-5-5"/></svg>,
    warn: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--warning)" strokeWidth="2.5"><path d="M12 9v4m0 4h.01M12 2L2 22h20L12 2z"/></svg>,
    fail: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--error)" strokeWidth="2.5"><path d="M18 6L6 18M6 6l12 12"/></svg>,
  }
  return (
    <div className="flex items-center gap-2.5 py-1.5 text-sm">
      {icons[status]}
      <span className={status === 'pass' ? 'text-[var(--text-secondary)]' : 'text-[var(--text-primary)] font-medium'}>{label}</span>
      {detail && <span className="text-[11px] text-[var(--text-muted)] ml-auto">{detail}</span>}
    </div>
  )
}

export function ModelSelector({ active = 'agnes' }: { active?: 'agnes' | 'ark' }) {
  return (
    <div className="flex items-center gap-1 bg-[var(--bg-panel)] border border-[var(--border-dim)] rounded-[var(--radius-md)] p-1">
      {(['agnes', 'ark'] as const).map(m => (
        <button key={m} className={`
          px-3 py-1.5 rounded-[var(--radius-sm)] text-xs font-medium transition-all cursor-pointer
          ${active === m ? 'bg-[var(--primary)] text-white' : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'}
        `}>{m === 'agnes' ? 'Agnes' : '豆包'}</button>
      ))}
    </div>
  )
}

export function NotificationBell({ count = 0 }: { count?: number }) {
  return (
    <button className="relative p-2 rounded-[var(--radius-md)] hover:bg-[var(--bg-panel)] transition-colors text-[var(--text-muted)] hover:text-[var(--text-secondary)] cursor-pointer">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 01-3.46 0"/></svg>
      {count > 0 && <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-[var(--error)] text-white text-[9px] font-bold rounded-full flex items-center justify-center">{count}</span>}
    </button>
  )
}

export function UserMenu() {
  return (
    <div className="flex items-center gap-2.5 cursor-pointer hover:bg-[var(--bg-panel)] rounded-[var(--radius-md)] px-2 py-1.5 transition-colors">
      <div className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold" style={{ background: 'var(--gradient-aurora)' }}>X</div>
      <span className="text-sm text-[var(--text-secondary)] hidden lg:block">管理员</span>
    </div>
  )
}

export function UsageMeter({ label, used, total, unit = '' }: {
  label: string; used: number; total: number; unit?: string
}) {
  const pct = Math.round((used / total) * 100)
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-xs text-[var(--text-muted)]">{label}</span>
        <span className="text-xs font-mono text-[var(--text-secondary)]">{used}{unit} / {total}{unit}</span>
      </div>
      <ProgressBar value={pct} variant={pct > 80 ? 'warning' : 'primary'} size="md" />
    </div>
  )
}
