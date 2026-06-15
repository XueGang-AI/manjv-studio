'use client'

import { Film } from 'lucide-react'
import { cn } from '@/lib/utils'
import { getShotDuration, getShotStatus, type ShotData } from './storyboard-types'

interface StoryboardTimelineProps {
  shots: ShotData[]
  isConfirmed: boolean
  activeShotId: string | null
  totalDuration: number
  onSelect: (id: string) => void
}

export function StoryboardTimeline({ shots, isConfirmed, activeShotId, totalDuration, onSelect }: StoryboardTimelineProps) {
  return (
    <div className="border-t border-[var(--color-border-dim)] bg-[var(--bg-surface)] px-6 py-3 shrink-0">
      <div className="flex items-center gap-2 mb-2">
        <Film size={14} className="text-[var(--color-primary)]" />
        <span className="text-xs font-semibold text-[var(--color-text-muted)]">时间线</span>
        <span className="text-[10px] text-[var(--color-text-muted)] font-mono">0s — {totalDuration}s</span>
      </div>
      <div className="flex gap-0.5">
        {shots.map(shot => {
          const w = totalDuration > 0 ? ((getShotDuration(shot) / totalDuration) * 100) : 0
          const isActive = activeShotId === shot.id
          const status = getShotStatus(shot, isConfirmed)
          return (
            <button
              key={shot.id}
              onClick={() => onSelect(shot.id)}
              className={cn(
                'h-6 rounded-[var(--radius-sm)] flex items-center justify-center text-[10px] font-bold transition-all cursor-pointer',
                status === 'confirmed' && !isActive && 'bg-[var(--color-success)]/30 text-[var(--color-success)]',
                status === 'confirmed' && isActive && 'bg-[var(--color-success)] text-white',
                status === 'pending' && isActive && 'text-white',
                status === 'pending' && !isActive && 'bg-[var(--bg-panel)] text-[var(--color-text-muted)]'
              )}
              style={isActive && status === 'pending' ? { width: `${w}%`, background: 'var(--gradient-aurora)' } : { width: `${w}%` }}
              title={`${shot.shotName || `镜头 ${shot.shotNo}`} (${getShotDuration(shot)}s)`}
            >
              {shot.shotNo}
            </button>
          )
        })}
      </div>
    </div>
  )
}
