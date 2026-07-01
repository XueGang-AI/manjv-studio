'use client'

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { Boxes, Clapperboard, Download, Eye, Image as ImageIcon, Loader2, Search, Users, Video } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  EmptyState,
  Panel,
  StatusPill,
  WorkbenchPageHeader,
  formatDateTime,
  formatDuration,
} from '@/components/production-workbench/workbench-ui'
import { cn } from '@/lib/utils'

type AssetType = 'character' | 'scene' | 'shot_image' | 'shot_video' | 'final'
type AssetStatus = 'confirmed' | 'selected' | 'candidate' | 'ready'

interface AssetItem {
  id: string
  type: AssetType
  title: string
  subtitle: string
  url: string | null
  status: AssetStatus
  sourceStep: string
  relation: string
  createdAt?: string | null
  meta: Record<string, string>
  href?: string
}

const typeLabels: Record<AssetType | 'all', string> = {
  all: '全部素材',
  character: '角色图',
  scene: '场景参考',
  shot_image: '分镜图',
  shot_video: '视频片段',
  final: '成片文件',
}

export default function AssetsPage() {
  const params = useParams()
  const projectId = params.id as string
  const [assets, setAssets] = useState<AssetItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [typeFilter, setTypeFilter] = useState<AssetType | 'all'>('all')
  const [statusFilter, setStatusFilter] = useState<AssetStatus | 'all'>('all')
  const [query, setQuery] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const projectJson = await fetch(`/api/projects/${projectId}`).then((res) => res.json())
      if (!projectJson.success) throw new Error(projectJson.error || '项目加载失败')
      const firstEpisode = projectJson.data?.episodes?.find((episode: { episodeNo: number }) => episode.episodeNo === 1) || projectJson.data?.episodes?.[0]
      if (!firstEpisode?.id) {
        setAssets([])
        return
      }

      const [characters, scenes, shotImages, shotVideos, finalPreview] = await Promise.all([
        fetch(`/api/projects/${projectId}/character-images`).then((res) => res.json()).catch(() => ({ success: false })),
        fetch(`/api/projects/${projectId}/episodes/${firstEpisode.id}/scene-references`).then((res) => res.json()).catch(() => ({ success: false })),
        fetch(`/api/projects/${projectId}/episodes/${firstEpisode.id}/shot-images`).then((res) => res.json()).catch(() => ({ success: false })),
        fetch(`/api/projects/${projectId}/episodes/${firstEpisode.id}/shot-videos`).then((res) => res.json()).catch(() => ({ success: false })),
        fetch(`/api/projects/${projectId}/episodes/${firstEpisode.id}/final-preview`).then((res) => res.json()).catch(() => ({ success: false })),
      ])

      const nextAssets: AssetItem[] = []
      if (characters.success) {
        for (const group of characters.data?.characters || []) {
          for (const image of group.images || []) {
            nextAssets.push({
              id: image.id,
              type: 'character',
              title: group.character?.name || '未命名角色',
              subtitle: image.referenceType || group.character?.roleType || '角色参考',
              url: image.imageUrl || null,
              status: image.isConfirmed ? 'confirmed' : image.isSelected ? 'selected' : 'candidate',
              sourceStep: '角色图',
              relation: group.character?.roleType || '角色设定',
              createdAt: image.createdAt,
              meta: {
                模型: image.modelName || '-',
                参考类型: image.referenceType || '-',
                Seed: image.seed || '-',
              },
              href: `/projects/${projectId}/character-images`,
            })
          }
        }
      }
      if (scenes.success) {
        for (const scene of scenes.data?.scenes || []) {
          for (const image of scene.sceneImages || []) {
            nextAssets.push({
              id: image.id,
              type: 'scene',
              title: scene.name || '场景参考',
              subtitle: image.referenceType || scene.location || '场景图',
              url: image.imageUrl || null,
              status: image.isConfirmed ? 'confirmed' : image.isSelected ? 'selected' : 'candidate',
              sourceStep: '场景参考图',
              relation: `镜头 ${scene.shots?.map((shot: { shotNo: number }) => shot.shotNo).join('、') || '-'}`,
              createdAt: image.createdAt,
              meta: {
                地点: scene.location || '-',
                时间: scene.sceneTime || '-',
                模型: image.modelName || '-',
              },
              href: `/projects/${projectId}/episodes/${firstEpisode.id}/scene-references`,
            })
          }
        }
      }
      if (shotImages.success) {
        for (const group of shotImages.data?.shots || []) {
          for (const image of group.images || []) {
            nextAssets.push({
              id: image.id,
              type: 'shot_image',
              title: `镜头 ${group.shot?.shotNo ?? '-'} ${group.shot?.shotName || ''}`.trim(),
              subtitle: group.shot?.location || '分镜图',
              url: image.imageUrl || null,
              status: image.isConfirmed ? 'confirmed' : image.isSelected ? 'selected' : 'candidate',
              sourceStep: '分镜图',
              relation: group.shot?.characters?.length ? `角色：${group.shot.characters.join('、')}` : '镜头首帧',
              createdAt: image.createdAt,
              meta: {
                时段: `${group.shot?.startTime ?? '-'}-${group.shot?.endTime ?? '-'}s`,
                模型: image.modelName || '-',
                画幅: image.aspectRatio || '-',
              },
              href: `/projects/${projectId}/episodes/${firstEpisode.id}/shot-images`,
            })
          }
        }
      }
      if (shotVideos.success) {
        for (const group of shotVideos.data?.shots || []) {
          for (const video of group.videos || []) {
            nextAssets.push({
              id: video.id,
              type: 'shot_video',
              title: `镜头 ${group.shot?.shotNo ?? '-'} ${group.shot?.shotName || ''}`.trim(),
              subtitle: video.remoteStatus || '视频片段',
              url: video.videoUrl || null,
              status: video.isConfirmed ? 'confirmed' : video.isSelected ? 'selected' : 'candidate',
              sourceStep: '视频片段',
              relation: `远端任务：${video.remoteTaskId || '-'}`,
              createdAt: video.createdAt,
              meta: {
                时长: formatDuration(video.duration),
                模型: video.modelName || '-',
                状态: video.remoteStatus || '-',
              },
              href: `/projects/${projectId}/episodes/${firstEpisode.id}/shot-videos`,
            })
          }
        }
      }
      if (finalPreview.success) {
        for (const video of finalPreview.data?.finalVideos || []) {
          nextAssets.push({
            id: video.id,
            type: 'final',
            title: '最终成片',
            subtitle: video.status,
            url: video.videoUrl || null,
            status: video.status === 'READY' ? 'ready' : 'candidate',
            sourceStep: '成片交付',
            relation: `FinalVideo ${video.id.slice(0, 8)}`,
            createdAt: video.createdAt,
            meta: {
              时长: formatDuration(video.duration),
              帧率: video.fps ? `${video.fps} fps` : '-',
              画幅: video.aspectRatio || '-',
            },
            href: `/projects/${projectId}/episodes/${firstEpisode.id}/final-preview`,
          })
        }
      }
      setAssets(nextAssets)
      setSelectedId((current) => current || nextAssets[0]?.id || null)
    } catch (err) {
      setError(err instanceof Error ? err.message : '素材资产库加载失败')
    } finally {
      setLoading(false)
    }
  }, [projectId])

  useEffect(() => {
    queueMicrotask(() => load())
  }, [load])

  const filtered = useMemo(() => {
    const lower = query.trim().toLowerCase()
    return assets.filter((asset) => {
      if (typeFilter !== 'all' && asset.type !== typeFilter) return false
      if (statusFilter !== 'all' && asset.status !== statusFilter) return false
      if (!lower) return true
      return `${asset.title} ${asset.subtitle} ${asset.relation} ${asset.sourceStep}`.toLowerCase().includes(lower)
    })
  }, [assets, query, statusFilter, typeFilter])

  const selected = filtered.find((asset) => asset.id === selectedId) || filtered[0] || null
  const counts = useMemo(() => ({
    character: assets.filter((asset) => asset.type === 'character').length,
    scene: assets.filter((asset) => asset.type === 'scene').length,
    shot_image: assets.filter((asset) => asset.type === 'shot_image').length,
    shot_video: assets.filter((asset) => asset.type === 'shot_video').length,
    final: assets.filter((asset) => asset.type === 'final').length,
  }), [assets])
  const assetsByType = useMemo(() => ({
    character: filtered.filter((asset) => asset.type === 'character'),
    scene: filtered.filter((asset) => asset.type === 'scene'),
    shot_image: filtered.filter((asset) => asset.type === 'shot_image'),
    shot_video: filtered.filter((asset) => asset.type === 'shot_video'),
    final: filtered.filter((asset) => asset.type === 'final'),
  }), [filtered])

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 size={32} className="animate-spin text-[var(--color-text-muted)]" />
      </div>
    )
  }

  return (
    <div className="space-y-4 p-4">
      <WorkbenchPageHeader
        eyebrow="Asset library"
        title="素材资产库"
        description="统一查看角色图、场景参考、分镜图、视频片段和最终成片文件；所有数据来自现有生产 API。"
        actions={<Button variant="outline" onClick={load}>刷新素材</Button>}
      />

      {error && (
        <div className="rounded-[var(--radius-md)] border border-[var(--color-danger)]/30 bg-[var(--color-danger-muted)] p-3 text-sm text-[var(--color-danger)]">
          {error}
        </div>
      )}

      <div className="grid gap-2 rounded-[var(--radius-lg)] border border-[var(--color-border-dim)] bg-[var(--bg-panel)]/70 p-2 md:grid-cols-5">
        <AssetStat icon={<Users size={14} />} label="角色图" value={counts.character} />
        <AssetStat icon={<Boxes size={14} />} label="场景参考" value={counts.scene} />
        <AssetStat icon={<ImageIcon size={14} />} label="分镜图" value={counts.shot_image} />
        <AssetStat icon={<Video size={14} />} label="视频片段" value={counts.shot_video} />
        <AssetStat icon={<Clapperboard size={14} />} label="成片文件" value={counts.final} />
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_330px]">
        <Panel
          title="素材浏览工作区"
          description="源图式紧凑卡片网格，角色、场景、分镜、视频和成片保持同屏可扫。"
          action={<Badge variant="default">{filtered.length} / {assets.length}</Badge>}
          bodyClassName="p-3"
        >
          <div className="mb-3 flex flex-col gap-3 lg:flex-row lg:items-center">
            <div className="flex gap-1.5 overflow-x-auto rounded-[var(--radius-md)] border border-[var(--color-border-dim)] bg-[var(--bg-input)] p-1">
              {(['all', 'character', 'scene', 'shot_image', 'shot_video', 'final'] as const).map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => setTypeFilter(type)}
                  className={cn(
                    'whitespace-nowrap rounded-[var(--radius-sm)] px-3 py-1.5 text-xs transition-colors',
                    typeFilter === type ? 'bg-[var(--color-primary-muted)] text-[var(--color-primary-hover)]' : 'text-[var(--color-text-muted)] hover:bg-[var(--bg-panel)] hover:text-[var(--color-text-primary)]',
                  )}
                >
                  {typeLabels[type]}
                </button>
              ))}
            </div>
            <div className="relative min-w-0 flex-1">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)]" />
              <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索素材名称、角色、场景、镜头..." className="pl-9" />
            </div>
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as AssetStatus | 'all')} className="h-10 rounded-[var(--radius-md)] border border-[var(--color-border-dim)] bg-[var(--bg-panel)] px-3 text-sm text-[var(--color-text-primary)]">
              <option value="all">全部状态</option>
              <option value="confirmed">已确认</option>
              <option value="selected">已选择</option>
              <option value="candidate">候选</option>
              <option value="ready">已生成</option>
            </select>
          </div>

          {filtered.length === 0 ? (
            <EmptyState icon={<Boxes size={24} />} title="暂无匹配素材" description="当前项目还没有该类型素材，或筛选条件过窄。" />
          ) : (
            <div className="space-y-3">
              {typeFilter === 'all' ? (
                <>
                  <AssetSection title="角色标准图" assets={assetsByType.character.slice(0, 6)} selectedId={selected?.id} onSelect={setSelectedId} />
                  <AssetSection title="场景参考图" assets={assetsByType.scene.slice(0, 6)} selectedId={selected?.id} onSelect={setSelectedId} />
                  <AssetSection title="分镜与视频资产" assets={[...assetsByType.shot_image.slice(0, 8), ...assetsByType.shot_video.slice(0, 4), ...assetsByType.final.slice(0, 2)]} selectedId={selected?.id} onSelect={setSelectedId} />
                </>
              ) : (
                <AssetSection title={typeLabels[typeFilter]} assets={filtered} selectedId={selected?.id} onSelect={setSelectedId} />
              )}

              <div className="rounded-[var(--radius-lg)] border border-[var(--color-border-dim)] bg-[var(--bg-input)] p-3">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-[var(--color-text-primary)]">选中素材详情</div>
                    <div className="text-xs text-[var(--color-text-muted)]">预览、来源、版本和引用关系同屏检查</div>
                  </div>
                  {selected && <StatusPill status={selected.status === 'confirmed' || selected.status === 'ready' ? 'success' : selected.status === 'selected' ? 'running' : 'pending'} label={statusText(selected.status)} />}
                </div>
                {selected ? (
                  <div className="grid gap-3 lg:grid-cols-[260px_minmax(0,1fr)]">
                    <AssetPreview asset={selected} large />
                    <div className="grid gap-2 text-sm md:grid-cols-2">
                      <InfoRow label="素材名称" value={selected.title} />
                      <InfoRow label="来源步骤" value={selected.sourceStep} />
                      <InfoRow label="引用关系" value={selected.relation} />
                      <InfoRow label="创建时间" value={formatDateTime(selected.createdAt)} />
                      {Object.entries(selected.meta).map(([key, value]) => <InfoRow key={key} label={key} value={value} />)}
                    </div>
                  </div>
                ) : (
                  <div className="text-sm text-[var(--color-text-muted)]">未选择素材。</div>
                )}
              </div>
            </div>
          )}
        </Panel>

        <div className="space-y-4">
          <Panel title="资产关系">
            {selected ? (
              <div className="space-y-4">
                <AssetPreview asset={selected} large />
                <div>
                  <div className="text-base font-semibold text-[var(--color-text-primary)]">{selected.title}</div>
                  <div className="mt-1 text-sm text-[var(--color-text-muted)]">{selected.subtitle}</div>
                </div>
                <div className="space-y-2 text-sm">
                  <InfoRow label="来源步骤" value={selected.sourceStep} />
                  <InfoRow label="引用关系" value={selected.relation} />
                  <InfoRow label="创建时间" value={formatDateTime(selected.createdAt)} />
                  {Object.entries(selected.meta).map(([key, value]) => <InfoRow key={key} label={key} value={value} />)}
                </div>
                <div className="flex gap-2">
                  {selected.href && (
                    <Link href={selected.href} className="flex-1">
                      <Button variant="outline" size="sm" className="w-full" icon={<Eye size={14} />}>打开来源</Button>
                    </Link>
                  )}
                  {selected.url && (
                    <a href={selected.url} target="_blank" rel="noreferrer" className="flex-1">
                      <Button variant="outline" size="sm" className="w-full" icon={<Download size={14} />}>打开文件</Button>
                    </a>
                  )}
                </div>
              </div>
            ) : (
              <EmptyState title="未选择素材" description="从左侧素材网格中选择一个资产查看关系。" />
            )}
          </Panel>
          <Panel title="缺失素材提醒">
            <div className="space-y-2 text-sm">
              <MissingLine label="角色图" ok={counts.character > 0} />
              <MissingLine label="场景参考图" ok={counts.scene > 0} />
              <MissingLine label="分镜图" ok={counts.shot_image > 0} />
              <MissingLine label="视频片段" ok={counts.shot_video > 0} />
              <MissingLine label="最终成片" ok={counts.final > 0} />
            </div>
          </Panel>
          <Panel title="存储空间">
            <div className="space-y-3">
              <div className="flex items-end justify-between gap-3">
                <div>
                  <div className="text-2xl font-semibold text-[var(--color-text-primary)]">{assets.length}</div>
                  <div className="text-xs text-[var(--color-text-muted)]">当前项目登记素材</div>
                </div>
                <Badge variant="info">本地/OSS 路径</Badge>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-[var(--bg-input)]">
                <div className="h-full w-[68%] rounded-full bg-[var(--gradient-aurora)]" />
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs text-[var(--color-text-muted)]">
                <span>图片 {counts.character + counts.scene + counts.shot_image}</span>
                <span>视频 {counts.shot_video + counts.final}</span>
              </div>
            </div>
          </Panel>
        </div>
      </div>
    </div>
  )
}

function AssetPreview({ asset, large }: { asset: AssetItem; large?: boolean }) {
  const className = large ? 'aspect-video rounded-[var(--radius-md)]' : 'aspect-[4/3]'
  if (!asset.url) {
    return (
      <div className={cn('flex items-center justify-center bg-[var(--bg-elevated)] text-[var(--color-text-muted)]', className)}>
        {asset.type === 'shot_video' || asset.type === 'final' ? <Video size={24} /> : <ImageIcon size={24} />}
      </div>
    )
  }
  if (asset.type === 'shot_video' || asset.type === 'final') {
    return (
      <video src={asset.url} className={cn('w-full bg-black object-cover', className)} muted playsInline preload="metadata" />
    )
  }
  return (
    <div className={cn('overflow-hidden bg-[var(--bg-elevated)]', className)}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={asset.url} alt={asset.title} className="h-full w-full object-cover" loading="lazy" />
    </div>
  )
}

function AssetStat({ icon, label, value }: { icon: ReactNode; label: string; value: number }) {
  return (
    <div className="flex items-center justify-between rounded-[var(--radius-md)] border border-[var(--color-border-dim)] bg-[var(--bg-input)] px-3 py-2">
      <span className="flex items-center gap-2 text-xs text-[var(--color-text-muted)]">{icon}{label}</span>
      <span className="font-mono text-sm font-semibold text-[var(--color-text-primary)]">{value}</span>
    </div>
  )
}

function AssetSection({
  title,
  assets,
  selectedId,
  onSelect,
}: {
  title: string
  assets: AssetItem[]
  selectedId?: string
  onSelect: (id: string) => void
}) {
  if (assets.length === 0) return null
  return (
    <section>
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--color-text-muted)]">{title}</h3>
        <span className="font-mono text-[11px] text-[var(--color-text-muted)]">{assets.length}</span>
      </div>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
        {assets.map((asset) => (
          <button
            key={asset.id}
            onClick={() => onSelect(asset.id)}
            className={cn(
              'overflow-hidden rounded-[var(--radius-md)] border bg-[var(--bg-panel)] text-left transition-colors hover:border-[var(--color-border-bright)]',
              selectedId === asset.id ? 'border-[var(--color-primary)] shadow-[var(--glow-primary)]' : 'border-[var(--color-border-dim)]',
            )}
          >
            <AssetPreview asset={asset} />
            <div className="space-y-1.5 p-2.5">
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-xs font-semibold text-[var(--color-text-primary)]">{asset.title}</span>
                <StatusPill status={asset.status === 'confirmed' || asset.status === 'ready' ? 'success' : asset.status === 'selected' ? 'running' : 'pending'} label={statusText(asset.status)} />
              </div>
              <div className="truncate text-[11px] text-[var(--color-text-muted)]">{asset.subtitle}</div>
              <div className="truncate text-[11px] text-[var(--color-text-muted)]">{asset.relation}</div>
            </div>
          </button>
        ))}
      </div>
    </section>
  )
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-[var(--color-border-dim)] pb-2">
      <span className="text-[var(--color-text-muted)]">{label}</span>
      <span className="truncate text-right text-[var(--color-text-primary)]">{value}</span>
    </div>
  )
}

function MissingLine({ label, ok }: { label: string; ok: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[var(--color-text-secondary)]">{label}</span>
      <Badge variant={ok ? 'success' : 'warning'}>{ok ? '已有素材' : '暂缺'}</Badge>
    </div>
  )
}

function statusText(status: AssetStatus) {
  if (status === 'confirmed') return '已确认'
  if (status === 'selected') return '已选择'
  if (status === 'ready') return '已生成'
  return '候选'
}
