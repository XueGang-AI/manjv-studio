'use client'

/**
 * useAIPromptBox — AI 创作控制台状态 Hook（Phase 5/7）
 * --------------------------------------------
 * 将 prompt/motion/submitting/error 状态提升到调用方，
 * 使桌面常驻控制台与移动 Sheet 共享同一份受控状态（不各自维护副本）。
 *
 * 接入真实链路：
 * - 提交：POST /api/projects/:id/episodes/:eid/shots/:shotId/videos/regenerate
 *   body { prompt, motionStrength?, clientRequestId? }
 * - 状态：ShotVideo.remoteStatus → GenerationState（真实远端状态）
 * - 同步：外部 video.prompt 变化时同步到编辑态，提交中不打断
 *
 * Phase 7 clientRequestId 幂等：
 * - 用户点击一次"生成" → 创建新 clientRequestId
 * - 网络错误自动重试 → 复用同一 clientRequestId（服务端去重，不重复收费）
 * - 用户明确再次点击"生成"/"重试" → 创建新 clientRequestId
 * - 不把 ID 用于不同 shot
 */

import * as React from 'react'
import { deriveGenerationState, type GenerationState } from './generation-state'
import type { RegenerationIssueType } from '@/components/regeneration/regeneration-issue-panel'

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
  issueTypes?: RegenerationIssueType[]
  fixNote?: string
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

const MAX_NETWORK_RETRIES = 2 // 网络错误自动重试次数（复用同一 clientRequestId）

function createClientRequestId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  // 回退（旧环境）
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

export function useAIPromptBox({
  projectId,
  episodeId,
  shotId,
  video,
  issueTypes = [],
  fixNote = '',
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

  /**
   * 执行一次提交尝试（含网络错误自动重试，复用 clientRequestId）。
   * 每次用户主动点击调用前生成新 clientRequestId。
   */
  const doSubmit = React.useCallback(async (clientRequestId: string) => {
    let lastErr: string | null = null
    for (let attempt = 0; attempt <= MAX_NETWORK_RETRIES; attempt++) {
      try {
        const res = await fetch(
          `/api/projects/${projectId}/episodes/${episodeId}/shots/${shotId}/videos/regenerate`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              prompt: prompt.trim(),
              issueTypes,
              fixNote: fixNote.trim() || undefined,
              motionStrength: motion,
              clientRequestId,
            }),
          },
        )
        const data = await res.json()
        if (data.success) {
          await onRefresh()
          return // 成功，结束
        }
        // 业务错误（如 422/400）：不重试，直接展示
        setError(typeof data.error === 'string' ? data.error : '重新生成失败，请重试')
        return
      } catch {
        // 网络错误：复用同一 clientRequestId 重试
        lastErr = '网络错误，请检查连接后重试'
        if (attempt < MAX_NETWORK_RETRIES) {
          // 短暂退避后重试
          await new Promise(r => setTimeout(r, 500 * (attempt + 1)))
          continue
        }
      }
    }
    setError(lastErr || '提交失败')
  }, [prompt, motion, issueTypes, fixNote, projectId, episodeId, shotId, onRefresh])

  const handleSubmit = React.useCallback(async () => {
    // ref 守卫：同步检查，防止重复点击在 setSubmitting 异步生效前触发第二次请求
    if (submittingRef.current || prompt.trim().length === 0) return
    submittingRef.current = true
    setSubmitting(true)
    setError(null)
    // 用户主动点击 → 新 clientRequestId
    const clientRequestId = createClientRequestId()
    try {
      await doSubmit(clientRequestId)
    } finally {
      submittingRef.current = false
      setSubmitting(false)
    }
  }, [prompt, doSubmit])

  const handleRetry = React.useCallback(() => {
    setError(null)
    // 用户明确点击重试 → 新 clientRequestId（handleSubmit 内生成）
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
