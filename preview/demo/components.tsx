/**
 * Manjv Studio 样板页 — 共享 UI 组件
 *
 * 视觉风格：电影暗房
 * 签名元素：胶片穿孔轨道（step navigator 左侧胶片齿孔线）
 *
 * 所有组件均为纯展示用，使用 TailwindCSS v4 design tokens
 */

// ============================================
// Badge
// ============================================
type BadgeVariant = 'default' | 'success' | 'warning' | 'danger' | 'info' | 'accent'

const BADGE_STYLES: Record<BadgeVariant, string> = {
  default: 'bg-[var(--color-surface)] text-[var(--color-text-secondary)]',
  success: 'bg-[var(--color-success-muted)] text-[var(--color-success)]',
  warning: 'bg-[var(--color-warning-muted)] text-[var(--color-warning)]',
  danger: 'bg-[var(--color-danger-muted)] text-[var(--color-danger)]',
  info: 'bg-[var(--color-info-muted)] text-[var(--color-info)]',
  accent: 'bg-[var(--color-accent-muted)] text-[var(--color-accent)]',
}

export function Badge({ children, variant = 'default', className = '' }: { children: React.ReactNode; variant?: BadgeVariant; className?: string }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-[var(--radius-sm)] text-xs font-medium ${BADGE_STYLES[variant]} ${className}`}>
      {children}
    </span>
  )
}

// ============================================
// Button
// ============================================
type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'
type ButtonSize = 'sm' | 'md' | 'lg'

const BUTTON_STYLES: Record<ButtonVariant, string> = {
  primary: 'bg-[var(--color-accent)] text-white hover:bg-[var(--color-accent-hover)] shadow-[var(--shadow-glow)]',
  secondary: 'bg-[var(--color-surface)] text-[var(--color-text-primary)] border border-[var(--color-border)] hover:border-[var(--color-border-hover)] hover:bg-[var(--color-elevated)]',
  ghost: 'bg-transparent text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-surface)]',
  danger: 'bg-[var(--color-danger-muted)] text-[var(--color-danger)] hover:bg-[var(--color-danger)] hover:text-white',
}

const BUTTON_SIZES: Record<ButtonSize, string> = {
  sm: 'h-8 px-3 text-xs gap-1.5',
  md: 'h-10 px-4 text-sm gap-2',
  lg: 'h-12 px-6 text-base gap-2.5',
}

export function Button({
  children, variant = 'primary', size = 'md', disabled = false, icon,
}: {
  children: React.ReactNode; variant?: ButtonVariant; size?: ButtonSize
  disabled?: boolean; icon?: React.ReactNode
}) {
  return (
    <button
      disabled={disabled}
      className={`
        inline-flex items-center justify-center font-medium rounded-[var(--radius-md)]
        transition-all duration-200 cursor-pointer
        disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none
        active:scale-[0.97]
        ${BUTTON_STYLES[variant]} ${BUTTON_SIZES[size]}
      `}
    >
      {icon}
      {children}
    </button>
  )
}

// ============================================
// Card
// ============================================
export function Card({ children, className = '', hover = false }: { children: React.ReactNode; className?: string; hover?: boolean }) {
  return (
    <div className={`
      bg-[var(--color-deep)] border border-[var(--color-border)] rounded-[var(--radius-lg)]
      shadow-[var(--shadow-card)]
      ${hover ? 'transition-all duration-200 hover:border-[var(--color-border-hover)] hover:shadow-[var(--shadow-elevated)] hover:-translate-y-0.5' : ''}
      ${className}
    `}>
      {children}
    </div>
  )
}

// ============================================
// Progress Bar
// ============================================
export function ProgressBar({ value = 0, variant = 'accent' }: { value: number; variant?: 'accent' | 'success' | 'info' }) {
  const colors = {
    accent: 'bg-[var(--color-accent)]',
    success: 'bg-[var(--color-success)]',
    info: 'bg-[var(--color-info)]',
  }
  return (
    <div className="w-full h-1.5 bg-[var(--color-surface)] rounded-full overflow-hidden">
      <div
        className={`h-full rounded-full transition-all duration-500 ease-out ${colors[variant]}`}
        style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
      />
    </div>
  )
}

// ============================================
// Skeleton
// ============================================
export function Skeleton({ className = '' }: { className?: string }) {
  return (
    <div className={`animate-pulse bg-[var(--color-surface)] rounded-[var(--radius-md)] ${className}`} />
  )
}

// ============================================
// Empty State
// ============================================
export function EmptyState({
  icon, title, description, action,
}: {
  icon: React.ReactNode; title: string; description: string
  action?: React.ReactNode
}) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="w-16 h-16 rounded-[var(--radius-xl)] bg-[var(--color-surface)] flex items-center justify-center mb-5 text-[var(--color-text-muted)]">
        {icon}
      </div>
      <h3 className="text-lg font-semibold text-[var(--color-text-primary)] mb-2">{title}</h3>
      <p className="text-sm text-[var(--color-text-muted)] max-w-sm mb-6">{description}</p>
      {action}
    </div>
  )
}

// ============================================
// Film Strip — 签名元素：胶片穿孔轨道
// ============================================
export function FilmStrip({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative pl-8">
      {/* 左侧胶片齿孔线 */}
      <div className="absolute left-0 top-0 bottom-0 w-5 flex flex-col items-center gap-3 py-4">
        {Array.from({ length: 20 }).map((_, i) => (
          <div key={i} className="w-2.5 h-3.5 rounded-[2px] bg-[var(--color-surface)]" />
        ))}
      </div>
      <div className="border-l-2 border-[var(--color-surface)] ml-[2px] pl-6">
        {children}
      </div>
    </div>
  )
}

// ============================================
// Step Chip — 带胶片编号的步骤标签
// ============================================
export function StepChip({
  step, label, status = 'locked',
}: {
  step: number; label: string; status?: 'completed' | 'active' | 'locked' | 'error'
}) {
  const styles = {
    completed: 'bg-[var(--color-success-muted)] text-[var(--color-success)] border-[var(--color-success)]/30',
    active: 'bg-[var(--color-accent-muted)] text-[var(--color-accent)] border-[var(--color-accent)]/30 shadow-[var(--shadow-glow)]',
    locked: 'bg-[var(--color-surface)] text-[var(--color-text-muted)] border-[var(--color-border)]',
    error: 'bg-[var(--color-danger-muted)] text-[var(--color-danger)] border-[var(--color-danger)]/30',
  }
  return (
    <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-[var(--radius-md)] border text-sm font-medium ${styles[status]}`}>
      <span className="font-mono text-xs font-bold">{String(step).padStart(2, '0')}</span>
      <span>{label}</span>
    </div>
  )
}

// ============================================
// Stat Card — 数据概览卡片
// ============================================
export function StatCard({
  label, value, sub, icon, trend,
}: {
  label: string; value: string | number; sub?: string
  icon?: React.ReactNode; trend?: 'up' | 'down' | 'neutral'
}) {
  const trendColor = trend === 'up' ? 'text-[var(--color-success)]' : trend === 'down' ? 'text-[var(--color-danger)]' : 'text-[var(--color-text-muted)]'
  return (
    <Card className="p-4">
      <div className="flex items-start justify-between mb-3">
        <span className="text-xs text-[var(--color-text-muted)] uppercase tracking-wider">{label}</span>
        {icon && <div className="text-[var(--color-text-muted)]">{icon}</div>}
      </div>
      <div className="text-2xl font-bold font-mono tracking-tight text-[var(--color-text-primary)]">{value}</div>
      {sub && <div className={`text-xs mt-1 ${trendColor}`}>{sub}</div>}
    </Card>
  )
}
