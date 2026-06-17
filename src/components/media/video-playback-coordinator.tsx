/**
 * 视频播放协调 Hook（Phase 3）
 * --------------------------------------------
 * 在多个视频卡片之间协调：同一时间最多一个视频播放。
 * 用 React Context 提供轻量协调，不引入全局状态库。
 *
 * 职责：
 * - 提供 activeVideoId（当前播放的视频 id）
 * - setActive(id)：设为当前播放，自动暂停其他
 * - clearActive()：无播放（用于全部暂停）
 *
 * 卡片侧通过 useVideoPlaybackControl 获取：
 * - isMineActive：本视频是否正在播放
 * - requestPlay()/requestPause()：请求播放/暂停（自动互斥）
 */

import * as React from 'react'

interface PlaybackCoordination {
  activeVideoId: string | null
  setActive: (id: string | null) => void
}

const PlaybackContext = React.createContext<PlaybackCoordination | null>(null)

export function PlaybackProvider({ children }: { children: React.ReactNode }) {
  const [activeVideoId, setActiveVideoId] = React.useState<string | null>(null)
  // setActive 用 useCallback 稳定引用，避免子组件 effect 抖动
  const setActive = React.useCallback((id: string | null) => {
    setActiveVideoId(id)
  }, [])

  const value = React.useMemo(() => ({ activeVideoId, setActive }), [activeVideoId, setActive])
  return <PlaybackContext.Provider value={value}>{children}</PlaybackContext.Provider>
}

export interface VideoPlaybackControl {
  /** 本视频是否为当前活动视频 */
  isMineActive: boolean
  /** 请求播放本视频（自动互斥：会暂停其他视频） */
  requestPlay: () => void
  /** 请求暂停本视频 */
  requestPause: () => void
}

export function useVideoPlaybackControl(videoId: string): VideoPlaybackControl {
  const ctx = React.useContext(PlaybackContext)
  if (!ctx) {
    // 无 Provider 时回退到独立播放（不互斥），避免破坏无协调场景
    return {
      isMineActive: true,
      requestPlay: () => {},
      requestPause: () => {},
    }
  }
  const { activeVideoId, setActive } = ctx
  return {
    isMineActive: activeVideoId === videoId,
    requestPlay: () => setActive(videoId),
    requestPause: () => {
      // 仅当本视频活动时才清除，避免误清其他视频
      if (activeVideoId === videoId) setActive(null)
    },
  }
}
