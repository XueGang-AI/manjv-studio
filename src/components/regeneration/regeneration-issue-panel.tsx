'use client'

import type { ReactNode } from 'react'
import { AlertTriangle, UserRound, Scissors, MapPinned, Smartphone, Hand, Volume2, CircleHelp } from 'lucide-react'
import { cn } from '@/lib/utils'

export type RegenerationIssueType =
  | 'character_drift'
  | 'hair_inconsistent'
  | 'scene_drift'
  | 'phone_fake_ui_text'
  | 'large_motion_or_hand_deform'
  | 'audio_issue'
  | 'other'

export const REGENERATION_ISSUE_OPTIONS: Array<{
  value: RegenerationIssueType
  label: string
  icon: ReactNode
}> = [
  { value: 'character_drift', label: '人物漂移', icon: <UserRound size={12} /> },
  { value: 'hair_inconsistent', label: '发型不一致', icon: <Scissors size={12} /> },
  { value: 'scene_drift', label: '场景漂移', icon: <MapPinned size={12} /> },
  { value: 'phone_fake_ui_text', label: '手机伪 UI/文字', icon: <Smartphone size={12} /> },
  { value: 'large_motion_or_hand_deform', label: '动作过大/手部变形', icon: <Hand size={12} /> },
  { value: 'audio_issue', label: '音频问题', icon: <Volume2 size={12} /> },
  { value: 'other', label: '其他', icon: <CircleHelp size={12} /> },
]

interface RegenerationIssuePanelProps {
  issueTypes: RegenerationIssueType[]
  onIssueTypesChange: (types: RegenerationIssueType[]) => void
  fixNote: string
  onFixNoteChange: (note: string) => void
  disabled?: boolean
  className?: string
}

export function RegenerationIssuePanel({
  issueTypes,
  onIssueTypesChange,
  fixNote,
  onFixNoteChange,
  disabled,
  className,
}: RegenerationIssuePanelProps) {
  const toggleIssue = (issueType: RegenerationIssueType) => {
    if (disabled) return
    if (issueTypes.includes(issueType)) {
      onIssueTypesChange(issueTypes.filter(type => type !== issueType))
    } else {
      onIssueTypesChange([...issueTypes, issueType])
    }
  }

  return (
    <div className={cn('rounded-[var(--radius-md)] border border-[var(--color-border-dim)] bg-[var(--bg-elevated)] p-3 space-y-3', className)}>
      <div className="flex items-center gap-2 text-xs font-semibold text-[var(--color-text-secondary)]">
        <AlertTriangle size={13} className="text-[var(--color-warning)]" />
        <span>问题驱动重跑</span>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        {REGENERATION_ISSUE_OPTIONS.map(option => {
          const active = issueTypes.includes(option.value)
          return (
            <button
              key={option.value}
              type="button"
              disabled={disabled}
              aria-pressed={active}
              onClick={() => toggleIssue(option.value)}
              className={cn(
                'min-h-8 rounded-[var(--radius-sm)] border px-2 py-1.5 text-xs flex items-center gap-1.5 transition-colors text-left',
                active
                  ? 'border-[var(--color-primary)] bg-[var(--color-primary-muted)] text-[var(--color-primary)]'
                  : 'border-[var(--color-border-dim)] text-[var(--color-text-secondary)] hover:border-[var(--color-border-bright)]',
                'disabled:opacity-60 disabled:cursor-not-allowed',
              )}
            >
              <span className="shrink-0">{option.icon}</span>
              <span className="truncate">{option.label}</span>
            </button>
          )
        })}
      </div>

      <textarea
        value={fixNote}
        onChange={(event) => onFixNoteChange(event.target.value)}
        disabled={disabled}
        maxLength={500}
        rows={2}
        placeholder="补充修复说明"
        className={cn(
          'w-full rounded-[var(--radius-sm)] border border-[var(--color-border-dim)] bg-[var(--bg-panel)] px-3 py-2 text-xs text-[var(--color-text-primary)] resize-y',
          'placeholder:text-[var(--color-text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/30',
          'disabled:opacity-60 disabled:cursor-not-allowed',
        )}
      />
    </div>
  )
}
