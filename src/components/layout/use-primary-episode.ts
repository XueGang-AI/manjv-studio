'use client'

import * as React from 'react'

interface EpisodeSummary {
  id: string
  episodeNo: number
}

interface ProjectResponse {
  success?: boolean
  data?: {
    episodes?: EpisodeSummary[]
  }
}

export function usePrimaryEpisode(projectId?: string | null, pathname?: string) {
  const routeEpisodeId = React.useMemo(() => {
    const segment = pathname?.match(/\/episodes\/([^/]+)/)?.[1]
    if (!segment || /^\d+$/.test(segment)) return undefined
    return segment
  }, [pathname])

  const [lookup, setLookup] = React.useState<{
    projectId?: string
    episodeId?: string
    resolved: boolean
  }>({ resolved: false })

  React.useEffect(() => {
    if (!projectId || projectId === 'new' || routeEpisodeId) return

    const controller = new AbortController()

    fetch(`/api/projects/${projectId}`, { signal: controller.signal })
      .then((res) => res.json() as Promise<ProjectResponse>)
      .then((payload) => {
        if (controller.signal.aborted) return
        const episodes = payload.success ? payload.data?.episodes || [] : []
        const firstEpisode = episodes.find((episode) => episode.episodeNo === 1) || episodes[0]
        setLookup({ projectId, episodeId: firstEpisode?.id, resolved: true })
      })
      .catch((err) => {
        if (err instanceof DOMException && err.name === 'AbortError') return
        setLookup({ projectId, resolved: true })
      })

    return () => controller.abort()
  }, [projectId, routeEpisodeId])

  const needsLookup = Boolean(projectId && projectId !== 'new' && !routeEpisodeId)
  const fetchedEpisodeId = needsLookup && lookup.projectId === projectId ? lookup.episodeId : undefined
  const episodeId = routeEpisodeId || fetchedEpisodeId
  const loading = needsLookup && (lookup.projectId !== projectId || !lookup.resolved)

  return {
    episodeId,
    loading,
    finalPreviewHref: projectId && projectId !== 'new' && episodeId
      ? `/projects/${projectId}/episodes/${episodeId}/final-preview`
      : undefined,
  }
}
