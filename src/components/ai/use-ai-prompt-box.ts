'use client'

/**
 * useAIPromptBox — AI 创作控制台状态 Hook（Phase 5 收口）
 * --------------------------------------------
 * 将 prompt/motion/submitting/error 状态提升到调用方，
 * 使桌面常驻控制台与移动 Sheet 共享同一份受控状态（不各自维护副本）。
 *
 * 接入真实链路：
 * - 提交：POST /api/projects/:id/episodes/:eid/shots/:shotId/videos/regenerate
 *   body { prompt, motionStrength? }
 * - 状态：ShotVideo.remoteStatus → GenerationState（真实远端状态）
 * - 同步：外部 video.prompt 变化时同步到编辑态，提交中不打断
 */

import * as React from 'react'
import { deriveGenerationState, type GenerationState } from './generation-state'

export interface AIPromptBoxVideoData {
  prompt: string
  motionStrength?: 'low' | 'medium' | 'high' | null
  remoteStatus?: string | null
  hasOutput: boolean
}

export interface UseAIPromptBoxArgs {
  projectId: string
  episodeId: string
  shotId: string
  video: AIPromptBoxVideoData
  onRefresh: () => void
}

export interface AIPromptBoxState {
  prompt: string
  setPrompt: (v: string) => void
  motion: 'low' | 'medium' | 'high'
  setMotion: (v: 'low' | 'medium' | 'high') => void
  submitting: boolean
  error: string | null
  state: GenerationState
  isBusy: boolean
  canSubmit: boolean
  handleSubmit: () => Promise<void>
  handleRetry: () => void
}

export function useAIPromptBox({
  projectId,
  episodeId,
  shotId,
  video,
  onRefresh,
}: UseAIPromptBoxArgs): AIPromptBoxState {
  const [prompt, setPrompt] = React.useState(video.prompt || '')
  const [motion, setMotion] = React.useState<'low' | 'medium' | 'high'>(
    (video.motionStrength as 'low' | 'medium' | 'high') || 'medium',
  )
  const [submitting, setSubmitting] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  // 提交守卫 ref：防止重复点击在 setSubmitting 异步生效前触发第二次请求
  const submittingRef = React.useRef(false)

  // 外部数据变化（如刷新后 videoPrompt 更新）同步到编辑态，提交中不打断。
  // 受控输入与外部数据源同步的合理 effect：仅在 video.prompt 实际变化时更新。
  /* eslint-disable react-hooks/set-state-in-effect */
  React.useEffect(() => {
    if (submitting) return
    setPrompt(video.prompt || '')
    setMotion((video.motionStrength as 'low' | 'medium' | 'high') || 'medium')
  }, [video.prompt, video.motionStrength, submitting])
  /* eslint-enable react-hooks/set-state-in-effect */

  const state: GenerationState = deriveGenerationState(
    video.remoteStatus,
    video.hasOutput,
    submitting,
  )

  const isBusy = state === 'submitting' || state === 'queued' || state === 'running'
  const canSubmit = !isBusy && prompt.trim().length > 0

  const handleSubmit = React.useCallback(async () => {
    // ref 守卫：同步检查，防止重复点击在 setSubmitting 异步生效前触发第二次请求
    if (submittingRef.current || prompt.trim().length === 0) return
    submittingRef.current = true
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch(
        `/api/projects/${projectId}/episodes/${episodeId}/shots/${shotId}/videos/regenerate`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt: prompt.trim(), motionStrength: motion }),
        },
      )
      const data = await res.json()
      if (data.success) {
        await onRefresh()
      } else {
        setError(typeof data.error === 'string' ? data.error : '重新生成失败，请重试')
      }
    } catch {
      setError('网络错误，请检查连接后重试')
    } finally {
      submittingRef.current = false
      setSubmitting(false)
    }
  }, [prompt, motion, projectId, episodeId, shotId, onRefresh])

  const handleRetry = React.useCallback(() => {
    setError(null)
    void handleSubmit()
  }, [handleSubmit])

  return {
    prompt,
    setPrompt,
    motion,
    setMotion,
    submitting,
    error,
    state,
    isBusy,
    canSubmit,
    handleSubmit,
    handleRetry,
  }
}
