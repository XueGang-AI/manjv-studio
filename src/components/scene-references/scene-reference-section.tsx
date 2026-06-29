'use client'

import { Image as ImageIcon, MapPinned } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'

export interface SceneReferenceImage {
  id: string
  imageUrl: string
  referenceType: string | null
  isConfirmed: boolean
  isSelected: boolean
}

export interface SceneReferenceItem {
  id: string
  name: string
  location: string | null
  sceneTime: string | null
  sceneImages: SceneReferenceImage[]
  shots: Array<{ id: string; shotNo: number; location: string | null; sceneTime: string | null }>
}

interface SceneReferenceSectionProps {
  scenes: SceneReferenceItem[]
  className?: string
  emptyHint?: string
}

export function SceneReferenceSection({
  scenes,
  className = '',
  emptyHint = '尚未生成；点击右侧生成分镜图时会先自动生成场景参考',
}: SceneReferenceSectionProps) {
  if (scenes.length === 0) {
    return (
      <div id="scene-references" className={className}>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-[var(--radius-md)] bg-[var(--bg-panel)] flex items-center justify-center text-[var(--color-text-muted)]">
              <MapPinned size={18} />
            </div>
            <div>
              <div className="text-sm font-semibold text-[var(--color-text-primary)]">场景参考图</div>
              <div className="text-xs text-[var(--color-text-muted)]">{emptyHint}</div>
            </div>
          </div>
        </Card>
      </div>
    )
  }

  const totalImages = scenes.reduce((sum, scene) => sum + scene.sceneImages.length, 0)

  return (
    <div id="scene-references" className={className}>
      <Card className="p-4">
        <div className="flex items-center justify-between gap-3 mb-3">
          <div className="flex items-center gap-2">
            <MapPinned size={16} className="text-[var(--color-accent-cyan)]" />
            <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">场景参考图</h3>
            <Badge variant="cyan">{scenes.length} 个场景</Badge>
            <Badge variant="default">{totalImages} 张图</Badge>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {scenes.map(scene => (
            <div key={scene.id} className="rounded-[var(--radius-md)] border border-[var(--color-border-dim)] bg-[var(--bg-panel)] overflow-hidden">
              <div className="px-3 py-2 border-b border-[var(--color-border-dim)]">
                <div className="text-xs font-semibold text-[var(--color-text-primary)] truncate">{scene.name}</div>
                <div className="text-[10px] text-[var(--color-text-muted)] truncate">
                  镜头 {scene.shots.map(shot => shot.shotNo).join('、') || '-'}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2 p-2">
                {scene.sceneImages.length > 0 ? scene.sceneImages.slice(0, 4).map(image => (
                  <div key={image.id} className="relative aspect-[3/4] rounded-[var(--radius-sm)] overflow-hidden bg-[var(--bg-elevated)]">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={image.imageUrl}
                      alt={`${scene.name} ${image.referenceType || '场景'}`}
                      className="h-full w-full object-cover"
                      loading="lazy"
                    />
                    <span className="absolute left-1 top-1 rounded bg-black/55 px-1.5 py-0.5 text-[9px] text-white">
                      {image.referenceType || '场景'}
                    </span>
                  </div>
                )) : (
                  <div className="col-span-2 aspect-[3/1] flex items-center justify-center gap-2 text-xs text-[var(--color-text-muted)]">
                    <ImageIcon size={14} />
                    无参考图
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  )
}
