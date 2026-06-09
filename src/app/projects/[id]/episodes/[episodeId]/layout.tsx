'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'

export default function EpisodeLayout({ children }: { children: React.ReactNode }) {
  const params = useParams()
  const router = useRouter()
  const projectId = params.id as string
  const episodeId = params.episodeId as string
  const [resolved, setResolved] = useState(false)

  useEffect(() => {
    // 如果 episodeId 是数字（episode_no），查找实际 UUID
    if (/^\d+$/.test(episodeId)) {
      fetch(`/api/projects/${projectId}`)
        .then(res => res.json())
        .then(data => {
          if (data.success) {
            const ep = data.data.episodes?.find((e: {episodeNo: number}) => e.episodeNo === parseInt(episodeId))
            if (ep && ep.id !== episodeId) {
              // 替换当前路径中的 episodeId 为实际 UUID
              const newPath = window.location.pathname.replace(`/episodes/${episodeId}`, `/episodes/${ep.id}`)
              router.replace(newPath)
              return
            }
          }
          setResolved(true)
        })
        .catch(() => setResolved(true))
    } else {
      setResolved(true)
    }
  }, [episodeId, projectId, router])

  if (!resolved) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 size={32} className="animate-spin text-gray-300" />
      </div>
    )
  }

  return <>{children}</>
}
