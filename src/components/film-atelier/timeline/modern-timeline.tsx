'use client'

import * as React from 'react'
import { cn } from '@/lib/utils'
import { Check, X, Clock } from 'lucide-react'
import type { TimelineEntry, TimelineStatus } from '@/components/film-atelier/types'

// ---- Status color mapping ----

const STATUS_ICON_BG: Record<TimelineStatus, string> = {
  completed: 'bg-[var(--status-success)]',
  current: 'bg-[var(--accent-primary)]',
  error: 'bg-[var(--status-error)]',
  upcoming: 'bg-transparent border border-[var(--border-default)]',
}

const STATUS_TITLE_COLOR: Record<TimelineStatus, string> = {
  completed: 'text-[var(--text-primary)]',
  current: 'text-[var(--text-primary)]',
  error: 'text-[var(--text-primary)]',
  upcoming: 'text-[var(--text-tertiary)]',
}

const STATUS_DESC_COLOR: Record<TimelineStatus, string> = {
  completed: 'text-[var(--text-secondary)]',
  current: 'text-[var(--text-secondary)]',
  error: 'text-[var(--text-secondary)]',
  upcoming: 'text-[var(--text-tertiary)]',
}

const STATUS_ARIA_LABEL: Record<TimelineStatus, string> = {
  completed: '已完成',
  current: '进行中',
  error: '出错',
  upcoming: '待执行',
}

// ---- Connector logic ----

function getConnectorStyle(
  currentStatus: TimelineStatus,
  nextStatus: TimelineStatus
): string {
  // completed -> completed: solid green
  if (currentStatus === 'completed' && nextStatus === 'completed') {
    return 'bg-[var(--status-success)]'
  }
  // completed -> current: solid green
  if (currentStatus === 'completed' && nextStatus === 'current') {
    return 'bg-[var(--status-success)]'
  }
  // completed -> error: solid green
  if (currentStatus === 'completed' && nextStatus === 'error') {
    return 'bg-[var(--status-success)]'
  }
  // current -> anything: amber line
  if (currentStatus === 'current') {
    return 'bg-[var(--accent-primary)]'
  }
  // error -> anything: red dashed line
  if (currentStatus === 'error') {
    return 'border-l border-dashed border-[var(--status-error)] bg-transparent'
  }
  // upcoming -> upcoming: gray dashed line
  return 'border-l border-dashed border-[var(--border-default)] bg-transparent'
}

// ---- Entry icon ----

function EntryIcon({ status }: { status: TimelineStatus }) {
  switch (status) {
    case 'completed':
      return <Check size={14} className="text-white" />
    case 'current':
      return (
        <>
          <span className="absolute inset-0 rounded-full bg-[var(--accent-primary)]/20 motion-safe:animate-ping" />
          <span className="relative w-2 h-2 rounded-full bg-[var(--accent-primary)]" />
        </>
      )
    case 'error':
      return <X size={14} className="text-white" />
    case 'upcoming':
      return <Clock size={12} className="text-[var(--text-tertiary)]" />
  }
}

// ---- Entry indicator (circle) ----

function EntryIndicator({ status }: { status: TimelineStatus }) {
  const isCurrent = status === 'current'

  return (
    <div
      className={cn(
        'relative flex items-center justify-center w-8 h-8 rounded-full shrink-0 transition-colors',
        STATUS_ICON_BG[status],
        isCurrent && 'bg-[var(--accent-primary)]/15 border border-[var(--accent-primary)]/40',
      )}
    >
      <EntryIcon status={status} />
    </div>
  )
}

// ---- Timeline entry row ----

function TimelineEntryRow({
  entry,
  isLast,
  nextStatus,
}: {
  entry: TimelineEntry
  isLast: boolean
  nextStatus?: TimelineStatus
}) {
  const isError = entry.status === 'error'
  const isCurrent = entry.status === 'current'
  const connectorStyle = !isLast && nextStatus
    ? getConnectorStyle(entry.status, nextStatus)
    : ''

  return (
    <div
      role="listitem"
      aria-label={`${entry.title} - ${STATUS_ARIA_LABEL[entry.status]}`}
      className="flex gap-3"
    >
      {/* Left column: indicator + connector */}
      <div className="flex flex-col items-center w-8 shrink-0">
        <EntryIndicator status={entry.status} />
        {!isLast && connectorStyle && (
          <div
            className={cn(
              'w-px flex-1 min-h-6 my-1 transition-colors',
              connectorStyle,
            )}
          />
        )}
      </div>

      {/* Right column: content */}
      <div
        className={cn(
          'flex-1 pb-4 pt-0.5 rounded-md -ml-2.5 pl-2.5 pr-3 py-1.5',
          isError && 'bg-[var(--error-soft)] border-l-2 border-[var(--status-error)]',
          isCurrent && !isError && 'bg-[var(--accent-primary)]/8',
        )}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <span
              className={cn(
                'text-sm font-medium leading-tight',
                STATUS_TITLE_COLOR[entry.status],
              )}
            >
              {entry.title}
            </span>
            <p
              className={cn(
                'text-xs mt-0.5 leading-relaxed',
                STATUS_DESC_COLOR[entry.status],
              )}
            >
              {entry.description}
            </p>
          </div>
          {entry.timestamp && (
            <span className="text-[11px] text-[var(--text-tertiary)] shrink-0 pt-0.5 tabular-nums">
              {entry.timestamp}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}

// ---- Props ----

export interface ModernTimelineProps extends React.HTMLAttributes<HTMLDivElement> {
  entries: TimelineEntry[]
}

// ---- ModernTimeline ----

export const ModernTimeline = React.memo(
  React.forwardRef<HTMLDivElement, ModernTimelineProps>(
    ({ entries, className, ...props }, ref) => {
      if (!entries.length) return null

      return (
        <div
          ref={ref}
          role="list"
          aria-label="任务执行时间线"
          className={cn('flex flex-col', className)}
          {...props}
        >
          {entries.map((entry, index) => (
            <TimelineEntryRow
              key={entry.id}
              entry={entry}
              isLast={index === entries.length - 1}
              nextStatus={entries[index + 1]?.status}
            />
          ))}
        </div>
      )
    }
  )
)

ModernTimeline.displayName = 'ModernTimeline'
