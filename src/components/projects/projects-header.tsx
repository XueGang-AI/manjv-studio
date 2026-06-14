'use client'

import React from 'react'
import { Plus, Clapperboard } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import Link from 'next/link'

export function ProjectsHeader({ projectCount }: { projectCount: number }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-[var(--radius-lg)] flex items-center justify-center" style={{ background: 'var(--gradient-aurora)' }}>
          <Clapperboard size={20} className="text-white" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-[var(--color-text-primary)] tracking-tight">
            我的项目
          </h1>
          <p className="text-sm text-[var(--color-text-muted)] mt-0.5">
            管理你的 AI 漫剧创作项目
            {projectCount > 0 && (
              <Badge variant="default" className="ml-2">{projectCount} 个项目</Badge>
            )}
          </p>
        </div>
      </div>
      <Link href="/projects/new">
        <Button variant="aurora" icon={<Plus size={16} />}>
          新建项目
        </Button>
      </Link>
    </div>
  )
}
