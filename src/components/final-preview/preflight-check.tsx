'use client'

import { CheckCircle2, AlertCircle } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { type FinalPreviewData, getPreflightIssues } from './final-preview-types'

interface PreflightCheckProps {
  data: FinalPreviewData
}

export function PreflightCheck({ data }: PreflightCheckProps) {
  const issues = getPreflightIssues(data)
  const allPassed = issues.every(i => i.passed)

  return (
    <Card className={cn(
      'p-4',
      allPassed ? 'border-l-2 border-l-[var(--color-success)]' : 'border-l-2 border-l-[var(--color-warning)]'
    )}>
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-xs font-semibold text-[var(--color-text-primary)] flex items-center gap-2">
          {allPassed ? (
            <CheckCircle2 size={14} className="text-[var(--color-success)]" />
          ) : (
            <AlertCircle size={14} className="text-[var(--color-warning)]" />
          )}
          合成前置检查
        </h4>
        <span className={cn(
          'text-[10px] font-medium px-2 py-0.5 rounded-full',
          allPassed ? 'bg-[var(--color-success-muted)] text-[var(--color-success)]' : 'bg-[var(--color-warning-muted)] text-[var(--color-warning)]'
        )}>
          {allPassed ? '全部通过' : `${issues.filter(i => !i.passed).length} 项未通过`}
        </span>
      </div>

      <div className="space-y-2">
        {issues.map(issue => (
          <div key={issue.key} className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-2">
              {issue.passed ? (
                <CheckCircle2 size={12} className="text-[var(--color-success)]" />
              ) : (
                <AlertCircle size={12} className="text-[var(--color-warning)]" />
              )}
              <span className={cn(
                'font-medium',
                issue.passed ? 'text-[var(--color-text-secondary)]' : 'text-[var(--color-text-primary)]'
              )}>
                {issue.label}
              </span>
            </div>
            <span className={cn(
              'text-[10px]',
              issue.passed ? 'text-[var(--color-text-muted)]' : 'text-[var(--color-warning)]'
            )}>
              {issue.detail}
            </span>
          </div>
        ))}
      </div>

      {!allPassed && (
        <div className="mt-3 pt-2 border-t border-[var(--color-border-dim)] text-[10px] text-[var(--color-text-muted)]">
          请返回视频片段页面完成确认后再合成
        </div>
      )}
    </Card>
  )
}
