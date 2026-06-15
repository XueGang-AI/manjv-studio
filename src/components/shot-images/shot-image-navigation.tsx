'use client'

import { useState } from 'react'
import { Check, Clock, ImageIcon, Loader2, AlertCircle, Filter } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { getImageGroupStatus, STATUS_LABELS, type ShotGroup, type ImageStatus } from './shot-images-types'

interface ShotImageNavigationProps {
  shots: ShotGroup[]
  isGenerating: boolean
  activeShotId: string | null
  onSelect: (id: string) => void
}

const STATUS_ICON: Record<string, React.ReactNode> = {
  confirmed: <Check size={10} className="text-[var(--color-success)]" />,
  selected: <Check size={10} className="text-[var(--color-primary)]" />,
  generated: <Clock size={10} className="text-[var(--color-text-muted)]" />,
  generating: <Loader2 size={10} className="text-[var(--color-accent-cyan)] animate-spin" />,
  failed: <AlertCircle size={10} className="text-[var(--color-danger)]" />,
  none: <ImageIcon size={10} className="text-[var(--color-text-muted)]" />,
}

const FILTER_OPTIONS: Array<{ value: ImageStatus | 'all'; label: string }> = [
  { value: 'all', label: '全部' },
  { value: 'none', label: '未生成' },
  { value: 'generated', label: '待选择' },
  { value: 'confirmed', label: '已确认' },
]

export function ShotImageNavigation({ shots, isGenerating, activeShotId, onSelect }: ShotImageNavigationProps) {
  const confirmed = shots.filter(s => s.confirmed).length
  const total = shots.length
  const [statusFilter, setStatusFilter] = useState<ImageStatus | 'all'>('all')

  const filteredShots = statusFilter === 'all'
    ? shots
    : shots.filter(s => getImageGroupStatus(s, isGenerating) === statusFilter)

  return (
    <div className="w-56 border-r border-[var(--color-border-dim)] bg-[var(--bg-surface)] flex flex-col overflow-hidden shrink-0">
      <div className="px-3 py-3 border-b border-[var(--color-border-dim)] flex items-center justify-between">
        <h3 className="text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wider">镜头列表</h3>
        <Badge variant={confirmed === total && total > 0 ? 'success' : 'default'}>{confirmed}/{total}</Badge>
      </div>

      {/* Status filter — show when enough shots */}
      {total > 5 && (
        <div className="px-3 py-2 border-b border-[var(--color-border-dim)] flex items-center gap-1 flex-wrap">
          <Filter size={10} className="text-[var(--color-text-muted)] shrink-0" />
          {FILTER_OPTIONS.map(opt => (
            <button
              key={opt.value}
              onClick={() => setStatusFilter(opt.value)}
              className={cn(
                'text-[10px] px-1.5 py-0.5 rounded-[var(--radius-sm)] transition-colors cursor-pointer',
                statusFilter === opt.value
                  ? 'bg-[var(--color-primary-muted)] text-[var(--color-primary)] font-medium'
                  : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]'
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}

      <div className="flex-1 overflow-y-auto">
        {filteredShots.length === 0 ? (
          <div className="px-3 py-6 text-center text-[10px] text-[var(--color-text-muted)]">
            无匹配镜头
          </div>
        ) : (
          filteredShots.map(group => {
            const isActive = activeShotId === group.shot.id
            const status = getImageGroupStatus(group, isGenerating)
            return (
              <button
                key={group.shot.id}
                onClick={() => onSelect(group.shot.id)}
                className={cn(
                  'w-full text-left px-3 py-2.5 border-b border-[var(--color-border-dim)] transition-colors cursor-pointer',
                  isActive ? 'bg-[var(--color-primary-muted)]' : 'hover:bg-[var(--bg-elevated)]'
                )}
                style={isActive ? { borderLeft: '2px solid', borderImage: 'var(--gradient-aurora) 1' } : { borderLeft: '2px solid transparent' }}
                title={`镜头 ${group.shot.shotNo}: ${group.shot.shotName} — ${STATUS_LABELS[status]}`}
                aria-label={`镜头 ${group.shot.shotNo}: ${group.shot.shotName} — ${STATUS_LABELS[status]}`}
              >
                <div className="flex items-center gap-2 mb-0.5">
                  <span className={cn(
                    'w-5 h-5 rounded-[var(--radius-sm)] flex items-center justify-center text-[10px] font-bold',
                    isActive ? 'text-white' : 'bg-[var(--bg-panel)] text-[var(--color-text-muted)]'
                  )} style={isActive ? { background: 'var(--gradient-aurora)' } : {}}>
                    {group.shot.shotNo}
                  </span>
                  <span className="text-sm text-[var(--color-text-primary)] font-medium truncate">{group.shot.shotName || `镜头 ${group.shot.shotNo}`}</span>
                  <span className="ml-auto shrink-0">{STATUS_ICON[status]}</span>
                </div>
                <div className="flex items-center gap-2 text-[10px] text-[var(--color-text-muted)] ml-7">
                  <span className="font-mono">{group.shot.startTime?.toFixed(0)}-{group.shot.endTime?.toFixed(0)}s</span>
                  {group.shot.location && <><span>·</span><span className="truncate">{group.shot.location}</span></>}
                </div>
              </button>
            )
          })
        )}
      </div>
      <div className="px-3 py-2 border-t border-[var(--color-border-dim)] text-[10px] text-[var(--color-text-muted)] flex items-center justify-between">
        <span>总进度</span>
        <span className="font-mono">{confirmed}/{total}</span>
      </div>
    </div>
  )
}
