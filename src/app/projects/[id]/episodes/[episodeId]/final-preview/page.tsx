'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import {
  AlertTriangle,
  CheckCircle2,
  Clapperboard,
  Copy,
  Download,
  ExternalLink,
  FileJson,
  Film,
  Loader2,
  RefreshCw,
  RotateCcw,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { useToast } from '@/components/ui/toast'
import { ProgressBar } from '@/components/ui/progress-bar'
import { getPreflightIssues, getRenderStatus, type FinalPreviewData } from '@/components/final-preview/final-preview-types'
import { useTaskSSE, type TaskEventType, type TaskUpdateEvent } from '@/lib/hooks/use-task-sse'
import {
  CompactMetricCard,
  EmptyState,
  Panel,
  WorkbenchPageHeader,
  formatDateTime,
  formatDuration,
} from '@/components/production-workbench/workbench-ui'

export default function FinalPreviewPage() {
  const params = useParams()
  const router = useRouter()
  const projectId = params.id as string
  const episodeId = params.episodeId as string
  const { addToast } = useToast()

  const [data, setData] = useState<FinalPreviewData | null>(null)
  const [loading, setLoading] = useState(true)
  const [rendering, setRendering] = useState(false)
  const [packaging, setPackaging] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [readyVideoId, setReadyVideoId] = useState<string | null>(null)
  const [erroredVideoId, setErroredVideoId] = useState<string | null>(null)

  const refreshData = useCallback(async () => {
    try {
      const res = await fetch(`/api/projects/${projectId}/episodes/${episodeId}/final-preview`)
      const json = await res.json()
      if (json.success) setData(json.data)
      else setError(json.error || '加载失败')
    } catch {
      setError('网络错误，请重试')
    }
  }, [episodeId, projectId])

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      setError(null)
      try {
        const res = await fetch(`/api/projects/${projectId}/episodes/${episodeId}/final-preview`)
        const json = await res.json()
        if (cancelled) return
        if (json.success) setData(json.data)
        else setError(json.error || '加载失败')
      } catch {
        if (!cancelled) setError('网络错误，请重试')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [episodeId, projectId])

  useTaskSSE(projectId, {
    onTaskUpdate: (type: TaskEventType, payload: TaskUpdateEvent) => {
      if (payload.taskType !== 'RENDER_FINAL_VIDEO') return
      refreshData()
      if (type === 'task.completed') {
        addToast({ type: 'success', title: '成片合成完成' })
        setRendering(false)
      } else if (type === 'task.failed') {
        addToast({ type: 'error', title: '合成失败', description: payload.errorMessage || '请重试' })
        setError(payload.errorMessage || '合成失败')
        setRendering(false)
      } else if (type === 'task.running') {
        setRendering(true)
      }
    },
    onSnapshot: refreshData,
  })

  const status = getRenderStatus(data, rendering)
  const isRendering = status === 'rendering'
  const isRendered = status === 'rendered'
  const canRender = data?.canRender ?? false
  const latest = data?.latest || null
  const preflightIssues = getPreflightIssues(data)
  const allPreflightPassed = preflightIssues.every((issue) => issue.passed)
  const videoReady = readyVideoId === latest?.id
  const videoError = erroredVideoId === latest?.id

  const handleRender = async () => {
    setRendering(true)
    setError(null)
    try {
      const res = await fetch(`/api/projects/${projectId}/episodes/${episodeId}/final-preview/render`, { method: 'POST' })
      const json = await res.json()
      if (json.success) {
        addToast({ type: 'success', title: '合成任务已创建', description: 'Worker 将异步执行，SSE 自动推送状态' })
        await refreshData()
      } else {
        const errMsg = typeof json.error === 'object' && json.error?.message ? json.error.message : String(json.error || '创建任务失败')
        addToast({ type: 'error', title: '创建任务失败', description: errMsg })
        setError(errMsg)
        await refreshData()
      }
    } catch {
      addToast({ type: 'error', title: '请求失败' })
      setError('请求失败，请重试')
      await refreshData()
    } finally {
      setConfirmOpen(false)
    }
  }

  const handleDownload = () => {
    if (videoError) {
      addToast({ type: 'error', title: '下载失败', description: '当前存储链接不可读，请先检查文件链接' })
      return
    }
    if (!latest?.videoUrl) {
      addToast({ type: 'error', title: '下载失败', description: '视频 URL 不可用' })
      return
    }
    const a = document.createElement('a')
    a.href = latest.videoUrl
    a.download = `final_${data?.episodeId || episodeId}_${Date.now()}.mp4`
    a.target = '_blank'
    a.rel = 'noopener noreferrer'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
  }

  const handleCopy = async () => {
    if (videoError) return
    if (!latest?.videoUrl) return
    await navigator.clipboard.writeText(latest.videoUrl)
    addToast({ type: 'success', title: '已复制成片链接' })
  }

  const handleGeneratePackage = async () => {
    setPackaging(true)
    try {
      const res = await fetch(`/api/projects/${projectId}/episodes/${episodeId}/release-package/generate`, { method: 'POST' })
      const json = await res.json()
      if (json.success) {
        addToast({ type: 'success', title: '发布包已生成', description: json.data?.packageUrl })
        await refreshData()
      } else {
        addToast({ type: 'error', title: '发布包生成失败', description: json.error })
      }
    } catch {
      addToast({ type: 'error', title: '发布包请求失败' })
    } finally {
      setPackaging(false)
    }
  }

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
        eyebrow="Delivery"
        title="成片交付"
        description={isRendered ? '最终 MP4 已生成，可播放、下载、重新合成或生成发布包。' : canRender ? '视频片段已确认，可以开始合成最终 MP4。' : '需要先完成全部视频片段确认，才能合成最终成片。'}
        actions={
          <>
            {canRender && !isRendering && (
              <Button variant={isRendered ? 'outline' : 'aurora'} onClick={() => setConfirmOpen(true)} disabled={!allPreflightPassed} icon={isRendered ? <RotateCcw size={16} /> : <Clapperboard size={16} />}>
                {isRendered ? '重新合成' : '开始合成'}
              </Button>
            )}
            {isRendered && latest?.videoUrl && (
              <Button variant="aurora" onClick={handleDownload} disabled={videoError} icon={<Download size={16} />}>下载 MP4</Button>
            )}
          </>
        }
      />

      {error && (
        <div className="flex items-start gap-2 rounded-[var(--radius-md)] border border-[var(--color-danger)]/30 bg-[var(--color-danger-muted)] p-3 text-sm text-[var(--color-danger)]">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          {error}
        </div>
      )}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0 space-y-4">
          <Panel title="成片预览" description="播放器、控制条和镜头时间线作为首屏主工作区。" bodyClassName="p-3">
            {isRendering ? (
              <div className="flex min-h-[455px] flex-col items-center justify-center rounded-[var(--radius-lg)] bg-black/35 text-center">
                <Loader2 size={42} className="mb-4 animate-spin text-[var(--color-info)]" />
                <div className="text-lg font-semibold text-[var(--color-text-primary)]">FFmpeg 正在合成</div>
                <p className="mt-2 max-w-md text-sm text-[var(--color-text-muted)]">正在拼接 {data?.shotsWithVideos.length || 0} 个镜头、标准化分辨率和音频，完成后会自动刷新。</p>
              </div>
            ) : isRendered && latest?.videoUrl ? (
              <div className="rounded-[var(--radius-lg)] border border-[var(--color-border-dim)] bg-black p-3">
                <div className="relative flex min-h-[455px] items-center justify-center overflow-hidden rounded-[var(--radius-md)]">
                  <div
                    className="relative h-[min(58vh,560px)] max-h-[560px] w-auto max-w-full overflow-hidden rounded-[var(--radius-md)] bg-black"
                    style={{ aspectRatio: (latest.aspectRatio || '9:16').replace(':', ' / ') }}
                  >
                    <video
                      key={latest.id}
                      src={latest.videoUrl}
                      poster={latest.coverUrl || undefined}
                      controls
                      preload="metadata"
                      playsInline
                      className="absolute inset-0 h-full w-full bg-black object-contain"
                      aria-label="最终成片播放器"
                      onLoadedMetadata={() => {
                        setReadyVideoId(latest.id)
                        setErroredVideoId(null)
                      }}
                      onCanPlay={() => {
                        setReadyVideoId(latest.id)
                        setErroredVideoId(null)
                      }}
                      onError={() => setErroredVideoId(latest.id)}
                    />
                    {videoError ? (
                      <div className="absolute inset-0 flex items-center justify-center bg-black/70 px-4 text-center">
                        <div className="flex max-w-sm flex-col items-center gap-3">
                          <AlertTriangle size={32} className="text-[var(--color-danger)]" />
                          <div className="text-sm font-medium text-white">成片读取失败</div>
                          <p className="text-xs leading-5 text-white/65">
                            最终 MP4 记录存在，但当前存储链接不可读。请检查对象存储权限或重新获取媒体文件后再下载、播放。
                          </p>
                          {latest.videoUrl && (
                            <Button size="sm" variant="outline" onClick={() => window.open(latest.videoUrl!, '_blank')} icon={<ExternalLink size={14} />}>
                              检查文件链接
                            </Button>
                          )}
                        </div>
                      </div>
                    ) : !videoReady && (
                      <div className="absolute inset-0 flex items-center justify-center bg-black/60 pointer-events-none">
                        {latest.coverUrl && (
                          // eslint-disable-next-line @next/next/no-img-element -- 成片封面来自运行时媒体 URL
                          <img src={latest.coverUrl} alt="" aria-hidden className="absolute inset-0 h-full w-full object-cover opacity-30" />
                        )}
                        <div className="relative z-10 flex flex-col items-center gap-2 text-xs text-white/85">
                          <Loader2 size={26} className="animate-spin text-[var(--color-info)]" />
                          <span>正在读取成片元数据</span>
                        </div>
                      </div>
                    )}
                    </div>
                </div>
                <div className="mt-3 grid gap-2 rounded-[var(--radius-md)] border border-white/10 bg-white/[0.04] p-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 text-xs text-[var(--color-text-muted)]">
                      <span>FinalVideo</span>
                      <span className="font-mono">{latest.id.slice(0, 8)}</span>
                      <span>{formatDuration(latest.duration)}</span>
                      <span>{latest.aspectRatio || '9:16'}</span>
                    </div>
                    <ProgressBar value={100} variant="success" />
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant="outline" onClick={handleCopy} disabled={!latest.videoUrl || videoError} icon={<Copy size={14} />}>复制链接</Button>
                    <Button size="sm" variant="aurora" onClick={handleDownload} disabled={videoError} icon={<Download size={14} />}>下载 MP4</Button>
                  </div>
                </div>
              </div>
            ) : (
              <EmptyState
                icon={<Clapperboard size={28} />}
                title={canRender ? '尚未合成最终 MP4' : '成片前置条件未满足'}
                description={canRender ? '点击开始合成创建 FFmpeg 任务。' : '请先到视频片段页面确认每个镜头的最终视频。'}
                action={canRender ? <Button variant="aurora" onClick={() => setConfirmOpen(true)} disabled={!allPreflightPassed}>开始合成</Button> : <Button variant="outline" onClick={() => router.push(`/projects/${projectId}/episodes/${episodeId}/shot-videos`)}>返回视频片段</Button>}
              />
            )}
            {data?.shotsWithVideos.length ? (
              <div className="mt-3 rounded-[var(--radius-md)] border border-[var(--color-border-dim)] bg-[var(--bg-input)] p-3">
                <div className="mb-2 flex items-center justify-between gap-3">
                  <div className="text-xs font-semibold text-[var(--color-text-primary)]">镜头时间线（共 {data.shotsWithVideos.length} 个镜头）</div>
                  <Badge variant={data.allVideosConfirmed ? 'success' : 'warning'}>{data.allVideosConfirmed ? '全部确认' : '待补齐'}</Badge>
                </div>
                <div className="flex gap-2 overflow-x-auto pb-2">
                  {data.shotsWithVideos.map((shot) => (
                    <div key={shot.shotNo} className="min-w-[104px] rounded-[var(--radius-sm)] border border-[var(--color-border-dim)] bg-[var(--bg-panel)] p-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono text-[11px] text-[var(--color-text-muted)]">{String(shot.shotNo).padStart(2, '0')}</span>
                        <Badge variant={shot.videoCount > 0 ? 'success' : 'warning'}>{shot.videoCount > 0 ? '确认' : '缺失'}</Badge>
                      </div>
                      <div className="mt-1.5 truncate text-[11px] font-medium text-[var(--color-text-primary)]">{shot.shotName || `镜头 ${shot.shotNo}`}</div>
                      <div className="mt-1 text-[11px] text-[var(--color-text-muted)]">{shot.videoCount} 个片段</div>
                    </div>
                  ))}
                </div>
                <ProgressBar value={data.shotsWithVideos.length ? (data.shotsWithVideos.filter((shot) => shot.videoCount > 0).length / data.shotsWithVideos.length) * 100 : 0} variant="success" />
              </div>
            ) : null}
          </Panel>
        </div>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <CompactMetricCard label="成片状态" value={isRendered ? '已生成' : isRendering ? '合成中' : canRender ? '可合成' : '待确认'} helper={data?.projectStatus || '-'} icon={<Clapperboard size={15} />} tone={isRendered ? 'success' : isRendering ? 'info' : canRender ? 'warning' : 'default'} />
            <CompactMetricCard label="镜头片段" value={`${data?.shotsWithVideos.filter((shot) => shot.videoCount > 0).length || 0}/${data?.shotsWithVideos.length || 0}`} helper="确认视频" icon={<Film size={15} />} tone={data?.allVideosConfirmed ? 'success' : 'warning'} progress={data?.shotsWithVideos.length ? (data.shotsWithVideos.filter((shot) => shot.videoCount > 0).length / data.shotsWithVideos.length) * 100 : 0} />
            <CompactMetricCard label="视频参数" value={latest?.aspectRatio || '9:16'} helper={latest?.fps ? `${latest.fps} fps` : '待写入'} icon={<RefreshCw size={15} />} tone="info" />
            <CompactMetricCard label="版本数量" value={data?.finalVideos.length || 0} helper={latest ? `最新 ${formatDateTime(latest.createdAt)}` : '暂无版本'} icon={<FileJson size={15} />} tone="primary" />
          </div>

          <Panel title="交付信息">
            {latest ? (
              <div className="space-y-3 text-sm">
                <Info label="FinalVideo ID" value={latest.id} />
                <Info label="状态" value={latest.status} />
                <Info label="时长" value={formatDuration(latest.duration)} />
                <Info label="分辨率/画幅" value={latest.aspectRatio || '-'} />
                <Info label="帧率" value={latest.fps ? `${latest.fps} fps` : '-'} />
                <Info label="发布包" value={latest.assetPackageUrl || latest.assetPackageObjectKey ? '已生成' : '未生成'} />
                <Info label="生成时间" value={formatDateTime(latest.createdAt)} />
                <details className="rounded-[var(--radius-md)] border border-[var(--color-border-dim)] bg-[var(--bg-panel)] p-3">
                  <summary className="cursor-pointer text-xs font-medium text-[var(--color-text-secondary)]">技术存储信息</summary>
                  <div className="mt-3 space-y-3">
                    <Info label="存储 Provider" value={latest.storageProvider || '-'} />
                    <Info label="视频 Object" value={latest.storageObjectKey || '-'} />
                    <Info label="发布包 Object" value={latest.assetPackageObjectKey || '-'} />
                  </div>
                </details>
              </div>
            ) : (
              <div className="text-sm text-[var(--color-text-muted)]">暂无成片版本。</div>
            )}
          </Panel>

          <Panel title="导出发布包">
            <div className="space-y-3">
              <div className="rounded-[var(--radius-md)] bg-[var(--bg-panel)] p-3 text-xs leading-5 text-[var(--color-text-muted)]">
                发布包会生成交付 manifest，并上传到当前媒体存储；技术 object key 可在成片信息的折叠区查看。
              </div>
              <Button className="w-full" variant="aurora" disabled={!latest || packaging} onClick={handleGeneratePackage} icon={packaging ? <Loader2 size={14} className="animate-spin" /> : <FileJson size={14} />}>
                {packaging ? '生成中...' : '生成发布包'}
              </Button>
              <div className="grid grid-cols-2 gap-2">
                <Button variant="outline" size="sm" disabled={!latest?.videoUrl || videoError} onClick={handleCopy} icon={<Copy size={14} />}>复制链接</Button>
                <Button variant="outline" size="sm" disabled={!latest?.videoUrl} onClick={() => latest?.videoUrl && window.open(latest.videoUrl, '_blank')} icon={<ExternalLink size={14} />}>打开文件</Button>
              </div>
            </div>
          </Panel>

          <Panel title="交付前检查">
            <div className="space-y-2">
              {preflightIssues.map((issue) => (
                <div key={issue.key} className="flex items-center justify-between rounded-[var(--radius-md)] bg-[var(--bg-panel)] px-3 py-2 text-sm">
                  <span className="flex items-center gap-2 text-[var(--color-text-secondary)]">
                    {issue.passed ? <CheckCircle2 size={14} className="text-[var(--color-success)]" /> : <AlertTriangle size={14} className="text-[var(--color-warning)]" />}
                    {issue.label}
                  </span>
                  <span className={issue.passed ? 'text-[var(--color-success)]' : 'text-[var(--color-warning)]'}>{issue.detail}</span>
                </div>
              ))}
              {latest?.videoUrl && (
                <div className="flex items-center justify-between rounded-[var(--radius-md)] bg-[var(--bg-panel)] px-3 py-2 text-sm">
                  <span className="flex items-center gap-2 text-[var(--color-text-secondary)]">
                    <CheckCircle2 size={14} className="text-[var(--color-success)]" />
                    MP4 链接
                  </span>
                  <span className="text-[var(--color-success)]">可访问</span>
                </div>
              )}
            </div>
          </Panel>

          <Panel title="相关入口">
            <div className="space-y-2">
              <Link href={`/projects/${projectId}/qc`}><Button className="w-full" variant="outline" size="sm">查看 QC 质检</Button></Link>
              <Link href={`/projects/${projectId}/episodes/${episodeId}/shot-videos`}><Button className="w-full" variant="outline" size="sm">返回视频片段</Button></Link>
            </div>
          </Panel>
        </div>
      </div>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        variant="warning"
        title={latest ? '重新合成成片' : '合成最终成片'}
        description={latest
          ? `将重新拼接 ${data?.shotsWithVideos.length || 0} 个镜头视频为完整 MP4。之前的成片会保留在历史版本中。`
          : `将拼接 ${data?.shotsWithVideos.length || 0} 个镜头的已确认视频片段为完整 MP4。`
        }
        confirmLabel={rendering ? '合成中...' : '开始合成'}
        loading={rendering}
        onConfirm={handleRender}
      />
    </div>
  )
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-[var(--color-border-dim)] pb-2">
      <span className="text-[var(--color-text-muted)]">{label}</span>
      <span className="truncate text-right font-mono text-[var(--color-text-primary)]">{value}</span>
    </div>
  )
}
