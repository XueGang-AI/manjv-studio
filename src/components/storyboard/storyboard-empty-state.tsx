'use client'

import { Film, Wand2, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ProgressBar } from '@/components/ui/progress-bar'

interface StoryboardEmptyStateProps {
  onGenerate: () => void
  isGenerating: boolean
}

export function StoryboardEmptyState({ onGenerate, isGenerating }: StoryboardEmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center h-full text-center p-6">
      <div className="w-16 h-16 rounded-[var(--radius-xl)] bg-[var(--color-primary-muted)] flex items-center justify-center mb-5 text-[var(--color-primary)]">
        <Film size={28} />
      </div>
      <h3 className="text-lg font-semibold text-[var(--color-text-primary)] mb-2">尚未生成分镜脚本</h3>
      <p className="text-sm text-[var(--color-text-muted)] max-w-sm mb-6">
        AI 将结合故事方案、角色设定和电影运镜素材库，生成完整分镜脚本
      </p>
      <Button variant="aurora" icon={<Wand2 size={16} />} onClick={onGenerate} disabled={isGenerating}>
        {isGenerating ? '生成中…' : '生成分镜脚本'}
      </Button>
    </div>
  )
}

export function StoryboardGeneratingState() {
  return (
    <div className="flex flex-col items-center justify-center h-full text-center p-6">
      <div className="w-16 h-16 rounded-[var(--radius-xl)] bg-[var(--color-accent-cyan-muted)] flex items-center justify-center mb-5 text-[var(--color-accent-cyan)] animate-pulse-glow">
        <Sparkles size={28} />
      </div>
      <h3 className="text-lg font-semibold text-[var(--color-text-primary)] mb-2">AI 正在生成分镜脚本</h3>
      <p className="text-sm text-[var(--color-text-muted)] max-w-sm">
        分析剧情、设计镜头语言、生成图片和视频 Prompt…
      </p>
      <div className="mt-6 w-64">
        <ProgressBar value={60} variant="aurora" size="md" />
      </div>
    </div>
  )
}
