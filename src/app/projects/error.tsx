'use client'

import { Button } from '@/components/ui/button'
import { AlertTriangle } from 'lucide-react'

export default function ProjectsError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  // Log error for debugging, don't expose to user
  console.error('Projects page error:', error?.message || error)

  return (
    <div className="flex flex-col items-center justify-center py-20 text-center p-6">
      <div className="w-16 h-16 rounded-[var(--radius-xl)] bg-[var(--color-danger-muted)] flex items-center justify-center mb-5 text-[var(--color-danger)]">
        <AlertTriangle size={28} />
      </div>
      <h3 className="text-lg font-semibold text-[var(--color-text-primary)] mb-2">加载失败</h3>
      <p className="text-sm text-[var(--color-text-muted)] max-w-sm mb-6">
        项目列表加载出错，请稍后重试
      </p>
      <Button variant="outline" size="sm" onClick={reset}>
        重试
      </Button>
    </div>
  )
}
