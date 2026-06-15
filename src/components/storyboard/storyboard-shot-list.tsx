'use client'

import { Check, Clock } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { getShotStatus, type ShotData } from './storyboard-types'

interface StoryboardShotListProps {
  shots: ShotData[]
  isConfirmed: boolean
  activeShotId: string | null
  totalDuration: number
  onSelect: (id: string) => void
}

export function StoryboardShotList({ shots, isConfirmed, activeShotId, totalDuration, onSelect }: StoryboardShotListProps) {
  return (
    <div className="w-56 border-r border-[var(--color-border-dim)] bg-[var(--bg-surface)] flex flex-col overflow-hidden shrink-0">
      <div className="px-3 py-3 border-b border-[var(--color-border-dim)] flex items-center justify-between">
        <h3 className="text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wider">镜头列表</h3>
        <Badge variant="default">{shots.length}</Badge>
      </div>
      <div className="flex-1 overflow-y-auto">
        {shots.map(shot => {
          const isActive = activeShotId === shot.id
          const status = getShotStatus(shot, isConfirmed)
          return (
            <button
              key={shot.id}
              onClick={() => onSelect(shot.id)}
              className={cn(
                'w-full text-left px-3 py-2.5 border-b border-[var(--color-border-dim)] transition-colors cursor-pointer',
                isActive ? 'bg-[var(--color-primary-muted)]' : 'hover:bg-[var(--bg-elevated)]'
              )}
              style={isActive ? { borderLeft: '2px solid', borderImage: 'var(--gradient-aurora) 1' } : { borderLeft: '2px solid transparent' }}
              aria-label={`镜头 ${shot.shotNo}: ${shot.shotName}`}
            >
              <div className="flex items-center gap-2 mb-0.5">
                <span className={cn(
                  'w-5 h-5 rounded-[var(--radius-sm)] flex items-center justify-center text-[10px] font-bold',
                  isActive ? 'text-white' : 'bg-[var(--bg-panel)] text-[var(--color-text-muted)]'
                )} style={isActive ? { background: 'var(--gradient-aurora)' } : {}}>
                  {shot.shotNo}
                </span>
                <span className="text-sm text-[var(--color-text-primary)] font-medium truncate">{shot.shotName || `镜头 ${shot.shotNo}`}</span>
                {status === 'confirmed' && <Check size={10} className="text-[var(--color-success)] ml-auto" />}
                {status === 'pending' && <Clock size={10} className="text-[var(--color-text-muted)] ml-auto" />}
              </div>
              <div className="flex items-center gap-2 text-[10px] text-[var(--color-text-muted)] ml-7">
                <span className="font-mono">{shot.startTime?.toFixed(0)}-{shot.endTime?.toFixed(0)}s</span>
                {shot.location && <><span>·</span><span className="truncate">{shot.location}</span></>}
              </div>
            </button>
          )
        })}
      </div>
      <div className="px-3 py-2 border-t border-[var(--color-border-dim)] text-[10px] text-[var(--color-text-muted)] flex items-center justify-between">
        <span>总时长</span>
        <span className="font-mono">{totalDuration.toFixed(0)}s</span>
      </div>
    </div>
  )
}
