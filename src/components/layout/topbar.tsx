'use client'

import React from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Bell, ChevronRight, Download, Play, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { usePrimaryEpisode } from '@/components/layout/use-primary-episode'

interface BreadcrumbItem {
  label: string
  href?: string
}

const LABELS: Record<string, string> = {
  projects: '项目',
  story: '故事方案',
  characters: '角色设定',
  'character-images': '角色图',
  episodes: '剧集',
  storyboard: '分镜脚本',
  'scene-references': '场景参考图',
  'shot-images': '分镜图',
  'shot-videos': '视频片段',
  'final-preview': '成片交付',
  assets: '素材资产库',
  tasks: '任务队列',
  versions: '版本管理',
  qc: 'QC 质检',
  prompts: 'Prompt 模板',
  new: '新建项目',
}

type HealthStatus = 'healthy' | 'degraded' | 'unhealthy' | 'unknown'

export function TopBar() {
  const pathname = usePathname()
  const breadcrumbs = React.useMemo(() => generateBreadcrumbs(pathname), [pathname])
  const projectId = pathname.match(/\/projects\/([^/]+)/)?.[1]
  const { finalPreviewHref, loading: episodeLoading } = usePrimaryEpisode(projectId, pathname)
  const [health, setHealth] = React.useState<HealthStatus>('unknown')
  const [workerHealth, setWorkerHealth] = React.useState<Record<string, string>>({})

  const loadHealth = React.useCallback(async () => {
    try {
      const [webRes, workerRes] = await Promise.allSettled([
        fetch('/api/health').then((res) => res.json()),
        fetch('/api/worker/health').then((res) => res.json()),
      ])
      const webOk = webRes.status === 'fulfilled' && webRes.value?.success
      if (workerRes.status === 'fulfilled' && workerRes.value?.success) {
        const data = workerRes.value.data || {}
        setHealth(data.status || (webOk ? 'degraded' : 'unknown'))
        setWorkerHealth({
          Web: webOk ? 'ok' : 'error',
          Worker: data.checks?.worker?.status || 'unknown',
          Redis: data.checks?.redis?.status || 'unknown',
          DB: data.checks?.database?.status || 'unknown',
        })
      } else {
        setHealth(webOk ? 'degraded' : 'unknown')
        setWorkerHealth({ Web: webOk ? 'ok' : 'unknown' })
      }
    } catch {
      setHealth('unknown')
      setWorkerHealth({})
    }
  }, [])

  React.useEffect(() => {
    queueMicrotask(() => loadHealth())
  }, [loadHealth])

  return (
    <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-2 border-b border-[var(--color-border-dim)] bg-[rgba(2,7,19,0.92)] px-3 backdrop-blur-xl sm:gap-4 sm:px-5">
      <nav className="flex min-w-0 flex-1 items-center gap-2 pl-10 text-sm md:pl-0">
        {breadcrumbs.map((item, index) => (
          <React.Fragment key={`${item.label}-${index}`}>
            {index > 0 && <ChevronRight size={14} className="shrink-0 text-[var(--color-text-muted)]" />}
            {item.href ? (
              <Link href={item.href} className="truncate text-[var(--color-text-muted)] transition-colors hover:text-[var(--color-text-primary)]">
                {item.label}
              </Link>
            ) : (
              <span className="truncate font-medium text-[var(--color-text-primary)]">{item.label}</span>
            )}
          </React.Fragment>
        ))}
      </nav>

      <div className="ml-auto hidden items-center gap-2 xl:flex">
        {Object.entries(workerHealth).map(([label, status]) => (
          <span
            key={label}
            className="inline-flex items-center gap-1.5 rounded-[var(--radius-sm)] border border-[var(--color-border-dim)] bg-[var(--bg-input)] px-2.5 py-1.5 text-xs text-[var(--color-text-secondary)] shadow-[inset_0_1px_0_rgba(255,255,255,0.035)]"
          >
            <span className={cn(
              'h-1.5 w-1.5 rounded-full',
              status === 'ok' ? 'bg-[var(--color-success)]' : status === 'error' ? 'bg-[var(--color-danger)]' : 'bg-[var(--color-warning)]',
            )} />
            {label}
            <span className={status === 'ok' ? 'text-[var(--color-success)]' : 'text-[var(--color-warning)]'}>
              {status === 'ok' ? '正常' : status === 'error' ? '异常' : '未知'}
            </span>
          </span>
        ))}
      </div>

      <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
        <Badge variant={health === 'healthy' ? 'success' : health === 'unhealthy' ? 'danger' : 'warning'} dot className="hidden md:inline-flex">
          {health === 'healthy' ? '系统正常' : health === 'unhealthy' ? '系统异常' : '系统待确认'}
        </Badge>
        <button
          onClick={loadHealth}
          className="rounded-[var(--radius-md)] p-2 text-[var(--color-text-muted)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--color-text-primary)]"
          title="刷新运行状态"
        >
          <RefreshCw size={16} />
        </button>
        {projectId && projectId !== 'new' && (
          <div className="hidden items-center gap-2 sm:flex">
            {finalPreviewHref ? (
              <>
                <Link href={finalPreviewHref}>
                  <Button variant="outline" size="sm" icon={<Play size={14} />}>预览成片</Button>
                </Link>
                <Link href={finalPreviewHref}>
                  <Button variant="aurora" size="sm" icon={<Download size={14} />}>导出发布包</Button>
                </Link>
              </>
            ) : (
              <>
                <Button variant="outline" size="sm" icon={<Play size={14} />} disabled title={episodeLoading ? '正在读取剧集信息' : '当前项目尚未创建剧集'}>预览成片</Button>
                <Button variant="aurora" size="sm" icon={<Download size={14} />} disabled title={episodeLoading ? '正在读取剧集信息' : '当前项目尚未创建剧集'}>导出发布包</Button>
              </>
            )}
          </div>
        )}
        <button
          className="relative rounded-[var(--radius-md)] p-2 text-[var(--color-text-muted)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--color-text-primary)]"
          title="通知"
        >
          <Bell size={18} />
        </button>
      </div>
    </header>
  )
}

function generateBreadcrumbs(pathname: string): BreadcrumbItem[] {
  const segments = pathname.split('/').filter(Boolean)
  if (segments.length === 0) return [{ label: '首页', href: '/' }]
  const crumbs: BreadcrumbItem[] = []
  let currentPath = ''
  for (const segment of segments) {
    currentPath += `/${segment}`
    if (isUUID(segment)) {
      if (crumbs.length > 0 && crumbs[crumbs.length - 1]?.label === '项目') {
        crumbs[crumbs.length - 1].href = currentPath
      }
      continue
    }
    if (/^\d+$/.test(segment)) continue
    crumbs.push({
      label: LABELS[segment] || segment,
      href: currentPath,
    })
  }
  return crumbs
}

function isUUID(str: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str)
}
