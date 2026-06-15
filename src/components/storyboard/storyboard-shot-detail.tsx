'use client'

import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { getShotDuration, type ShotData } from './storyboard-types'

function DetailField({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-[var(--bg-panel)] rounded-[var(--radius-sm)] px-2.5 py-2">
      <div className="text-[10px] text-[var(--color-text-muted)]">{label}</div>
      <div className="text-[var(--color-text-secondary)] font-medium mt-0.5 truncate">{value || '-'}</div>
    </div>
  )
}

interface StoryboardShotDetailProps {
  shot: ShotData
  isConfirmed: boolean
}

export function StoryboardShotDetail({ shot, isConfirmed }: StoryboardShotDetailProps) {
  const duration = getShotDuration(shot)
  const imgP = shot.imagePrompts?.[0]
  const vidP = shot.videoPrompts?.[0]

  const cameraFields = [
    { l: '景别', v: String(shot.camera?.shot_size || '') },
    { l: '角度', v: String(shot.camera?.angle || '') },
    { l: '运镜', v: String(shot.camera?.movement || '') },
  ]
  const visualFields = [
    { l: '光影', v: String(shot.visual?.lighting || '') },
    { l: '色调', v: String(shot.visual?.color_tone || '') },
    { l: '特效', v: String(shot.visual?.special_effect || shot.visual?.vfx || '') },
  ]
  const allFields = [...cameraFields, ...visualFields].filter(f => f.v)

  return (
    <div className="p-6 space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="w-8 h-8 rounded-[var(--radius-md)] flex items-center justify-center text-sm font-bold text-white" style={{ background: 'var(--gradient-aurora)' }}>
              {shot.shotNo}
            </span>
            <h2 className="text-xl font-bold text-[var(--color-text-primary)]">{shot.shotName || `镜头 ${shot.shotNo}`}</h2>
            <Badge variant={shot.confirmed || isConfirmed ? 'success' : 'warning'} dot>
              {shot.confirmed || isConfirmed ? '已确认' : '待确认'}
            </Badge>
          </div>
          <div className="flex items-center gap-3 text-xs text-[var(--color-text-muted)] ml-10">
            <span className="font-mono">{shot.startTime?.toFixed(0)}-{shot.endTime?.toFixed(0)}s ({duration}s)</span>
            {shot.location && <><span>·</span><span>{shot.location}</span></>}
            {shot.emotion && <><span>·</span><span>情绪：{shot.emotion}</span></>}
          </div>
        </div>
      </div>

      {/* Action description */}
      {shot.action && (
        <Card className="p-4">
          <div className="text-[10px] font-semibold text-[var(--color-primary)] uppercase tracking-wider mb-2">动作描述</div>
          <p className="text-sm text-[var(--color-text-secondary)] leading-relaxed">{shot.action}</p>
        </Card>
      )}

      {/* Dialogue highlight */}
      {shot.dialogue && (
        <div className="rounded-[var(--radius-md)] p-3 bg-[var(--color-warning-muted)]">
          <div className="text-[10px] font-semibold text-[var(--color-warning)] uppercase tracking-wider mb-1">台词</div>
          <p className="text-sm text-[var(--color-text-primary)] italic">「{shot.dialogue}」</p>
        </div>
      )}

      {/* Prompts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {imgP && (imgP.enPrompt || imgP.zhPrompt) && (
          <Card className="p-4">
            <div className="text-[10px] font-semibold text-[var(--color-primary)] uppercase tracking-wider mb-2">图片 Prompt</div>
            <p className="text-xs text-[var(--color-text-secondary)] leading-relaxed max-h-32 overflow-y-auto">
              {imgP.enPrompt || imgP.zhPrompt}
            </p>
            {imgP.negativePrompt && (
              <div className="mt-3 pt-2 border-t border-[var(--color-border-dim)] text-[10px] text-[var(--color-text-muted)] flex items-center gap-2">
                <span>Negative: {imgP.negativePrompt.substring(0, 80)}…</span>
              </div>
            )}
          </Card>
        )}
        {vidP && vidP.prompt && (
          <Card className="p-4">
            <div className="text-[10px] font-semibold text-[var(--color-accent-cyan)] uppercase tracking-wider mb-2">视频 Prompt</div>
            <p className="text-xs text-[var(--color-text-secondary)] leading-relaxed max-h-32 overflow-y-auto">
              {vidP.prompt}
            </p>
            <div className="mt-2 text-[10px] text-[var(--color-text-muted)]">
              {vidP.duration ? `${vidP.duration}s` : ''} {vidP.motionStrength ? `| motion: ${vidP.motionStrength}` : ''}
            </div>
            {shot.dialogue && (
              <div className="mt-3 pt-2 border-t border-[var(--color-border-dim)]">
                <div className="text-[10px] font-semibold text-[var(--color-warning)] uppercase tracking-wider mb-1">台词</div>
                <p className="text-sm text-[var(--color-text-primary)] italic bg-[var(--color-warning-muted)] px-2 py-1 rounded-[var(--radius-sm)]">「{shot.dialogue}」</p>
              </div>
            )}
          </Card>
        )}
      </div>

      {/* Camera & Visual details */}
      {allFields.length > 0 && (
        <Card className="p-4">
          <h4 className="text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wider mb-3">镜头详情</h4>
          <div className="grid grid-cols-3 md:grid-cols-6 gap-3 text-xs">
            {allFields.map(f => (
              <div key={f.l} className="bg-[var(--bg-panel)] rounded-[var(--radius-sm)] px-2.5 py-2">
                <div className="text-[10px] text-[var(--color-text-muted)]">{f.l}</div>
                <div className="text-[var(--color-text-secondary)] font-medium mt-0.5">{f.v}</div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Additional details */}
      <Card className="p-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
          {shot.sceneTime && <DetailField label="场景时间" value={shot.sceneTime} />}
          {shot.location && <DetailField label="地点" value={shot.location} />}
          {shot.emotion && <DetailField label="情绪" value={shot.emotion} />}
          {shot.sfx && <DetailField label="音效" value={shot.sfx} />}
          {shot.bgm && <DetailField label="BGM" value={shot.bgm} />}
          {shot.purpose && <DetailField label="用途" value={shot.purpose} />}
          {Array.isArray(shot.characters) && shot.characters.length > 0 && (
            <DetailField label="出场角色" value={shot.characters.join('、')} />
          )}
        </div>
      </Card>
    </div>
  )
}
