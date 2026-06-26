'use client'

import { useState } from 'react'
import Link from 'next/link'
import {
  Check, Sparkles, RefreshCw, ArrowRight,
  ArrowLeft, Zap, Eye, CheckCircle2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { ProgressBar } from '@/components/ui/progress-bar'
import { cn } from '@/lib/utils'
import type { EpisodeData, ProjectData } from './storyboard-types'

interface StoryboardRightPanelProps {
  project: ProjectData | null
  episode: EpisodeData | null
  isConfirmed: boolean
  hasStoryboard: boolean
  onGenerate: () => void
  onConfirm: () => void
  isGenerating: boolean
  confirming: boolean
}

export function StoryboardRightPanel({ project, episode, isConfirmed, hasStoryboard, onGenerate, onConfirm, isGenerating, confirming }: StoryboardRightPanelProps) {
  const [activeTab, setActiveTab] = useState<'overview' | 'actions'>('overview')
  const confirmedShots = episode?.shots.filter(s => s.confirmed).length ?? 0
  const totalShots = episode?.shots.length ?? 0

  return (
    <div className="w-80 border-l border-[var(--color-border-dim)] bg-[var(--bg-surface)] flex flex-col overflow-hidden shrink-0">
      {/* Tabs */}
      <div className="flex border-b border-[var(--color-border-dim)]">
        {([
          { key: 'overview' as const, label: '概览', icon: <Eye size={12} /> },
          { key: 'actions' as const, label: '操作', icon: <Zap size={12} /> },
        ]).map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={cn(
              'flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-medium transition-colors cursor-pointer',
              activeTab === tab.key ? 'text-[var(--color-primary)]' : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]'
            )}
          >
            {tab.icon}{tab.label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {activeTab === 'overview' && (
          <>
            {/* Project info */}
            {project && (
              <Card className="p-3">
                <h4 className="text-xs font-semibold text-[var(--color-text-primary)] mb-2">项目信息</h4>
                {[
                  { l: '名称', v: project.projectName },
                  { l: '类型', v: project.storyType || '-' },
                  { l: '画风', v: project.artStyle || '-' },
                  { l: '时长', v: `${project.episodeDuration}s/集` },
                  { l: '模型', v: '豆包' },
                  { l: '比例', v: project.aspectRatio },
                ].map(i => (
                  <div key={i.l} className="flex justify-between text-xs py-1.5 border-b border-[var(--color-border-dim)] last:border-0">
                    <span className="text-[var(--color-text-muted)]">{i.l}</span>
                    <span className="text-[var(--color-text-secondary)]">{i.v}</span>
                  </div>
                ))}
              </Card>
            )}

            {/* Episode info */}
            {episode && (
              <Card className="p-3">
                <h4 className="text-xs font-semibold text-[var(--color-text-primary)] mb-2">剧集信息</h4>
                {[
                  { l: '集数', v: `第 ${episode.episodeNo} 集` },
                  { l: '标题', v: episode.title || '-' },
                  { l: '时长', v: episode.duration ? `${episode.duration}s` : '-' },
                  { l: '镜头数', v: `${totalShots} 个` },
                  { l: '已确认', v: `${confirmedShots}/${totalShots}` },
                  { l: '版本', v: `v${episode.version}` },
                ].map(i => (
                  <div key={i.l} className="flex justify-between text-xs py-1.5 border-b border-[var(--color-border-dim)] last:border-0">
                    <span className="text-[var(--color-text-muted)]">{i.l}</span>
                    <span className="text-[var(--color-text-primary)] font-mono">{i.v}</span>
                  </div>
                ))}
                {totalShots > 0 && (
                  <div className="mt-3">
                    <ProgressBar value={(confirmedShots / totalShots) * 100} variant={confirmedShots === totalShots ? 'success' : 'aurora'} size="sm" />
                  </div>
                )}
              </Card>
            )}

            {/* Episode hooks */}
            {episode && (episode.openingHook || episode.endingHook) && (
              <Card className="p-3">
                <h4 className="text-xs font-semibold text-[var(--color-text-primary)] mb-2">叙事钩子</h4>
                {episode.openingHook && (
                  <div className="text-xs mb-2">
                    <span className="text-[var(--color-warning)] font-medium">🎣 开场：</span>
                    <span className="text-[var(--color-text-secondary)]">{episode.openingHook}</span>
                  </div>
                )}
                {episode.endingHook && (
                  <div className="text-xs">
                    <span className="text-[var(--color-danger)] font-medium">🔮 结尾：</span>
                    <span className="text-[var(--color-text-secondary)]">{episode.endingHook}</span>
                  </div>
                )}
              </Card>
            )}

            {/* Core task & emotion */}
            {episode && (episode.coreTask || episode.emotionCurve) && (
              <Card className="p-3">
                {episode.coreTask && (
                  <div className="text-xs mb-2">
                    <span className="text-[var(--color-text-muted)]">核心任务：</span>
                    <span className="text-[var(--color-text-secondary)]">{episode.coreTask}</span>
                  </div>
                )}
                {episode.emotionCurve && (
                  <div className="text-xs">
                    <span className="text-[var(--color-text-muted)]">情绪曲线：</span>
                    <span className="text-[var(--color-text-secondary)]">{episode.emotionCurve}</span>
                  </div>
                )}
              </Card>
            )}
          </>
        )}

        {activeTab === 'actions' && (
          <>
            {hasStoryboard ? (
              <>
                {!isConfirmed && (
                  <>
                    <Card className="p-3">
                      <h4 className="text-xs font-semibold text-[var(--color-text-primary)] mb-2">重新生成</h4>
                      <p className="text-[11px] text-[var(--color-text-muted)] mb-3">将覆盖当前分镜脚本，重新由 AI 生成</p>
                      <Button variant="outline" size="sm" className="w-full" icon={<RefreshCw size={12} />} onClick={onGenerate} disabled={isGenerating}>
                        {isGenerating ? '生成中…' : '重新生成'}
                      </Button>
                    </Card>
                    <Card className="p-3 aurora-border">
                      <h4 className="text-xs font-semibold text-[var(--color-text-primary)] mb-2 flex items-center gap-1.5">
                        <CheckCircle2 size={12} className="text-[var(--color-success)]" />确认分镜
                      </h4>
                      <p className="text-[11px] text-[var(--color-text-muted)] mb-3">确认后锁定当前镜头，进入分镜图生成阶段</p>
                      <Button variant="aurora" size="sm" className="w-full" icon={<Check size={12} />} onClick={onConfirm} disabled={confirming}>
                        {confirming ? '确认中…' : '确认分镜'}
                      </Button>
                    </Card>
                  </>
                )}
                {isConfirmed && (
                  <Card className="p-3">
                    <div className="flex items-center gap-2 mb-3">
                      <CheckCircle2 size={16} className="text-[var(--color-success)]" />
                      <span className="text-sm font-semibold text-[var(--color-text-primary)]">分镜已确认</span>
                    </div>
                    <p className="text-[11px] text-[var(--color-text-muted)] mb-3">可以进入分镜图生成阶段</p>
                    <Link href={`/projects/${project?.id}/episodes/${episode?.id ?? ''}/shot-images`}>
                      <Button variant="aurora" size="sm" className="w-full" icon={<ArrowRight size={12} />}>
                        进入分镜图
                      </Button>
                    </Link>
                  </Card>
                )}
              </>
            ) : (
              <Card className="p-3">
                <h4 className="text-xs font-semibold text-[var(--color-text-primary)] mb-2">生成分镜脚本</h4>
                <p className="text-[11px] text-[var(--color-text-muted)] mb-3">AI 将结合故事方案和角色设定生成完整分镜</p>
                <Button variant="aurora" size="sm" className="w-full" icon={<Sparkles size={12} />} onClick={onGenerate} disabled={isGenerating}>
                  {isGenerating ? '生成中…' : '开始生成'}
                </Button>
              </Card>
            )}

            {/* Navigation */}
            <Card className="p-3">
              <h4 className="text-xs font-semibold text-[var(--color-text-muted)] mb-3">导航</h4>
              <div className="space-y-2">
                <Link href={`/projects/${project?.id}/character-images`} className="flex items-center gap-2 text-xs text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] transition-colors">
                  <ArrowLeft size={12} />返回角色图
                </Link>
                {isConfirmed && (
                  <Link href={`/projects/${project?.id}/episodes/${episode?.id ?? ''}/shot-images`} className="flex items-center gap-2 text-xs text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] transition-colors">
                    进入分镜图 <ArrowRight size={12} />
                  </Link>
                )}
              </div>
            </Card>
          </>
        )}
      </div>
    </div>
  )
}
