/**
 * Seedance first/last frame policy (P1-2)
 * --------------------------------------
 * After real-account probe (docs/ARK_LAST_FRAME_PROBE_REPORT.md) confirmed
 * `first_frame` + `last_frame` works on the default Medium model, production
 * may opt in via ARK_VIDEO_ENABLE_LAST_FRAME=true.
 *
 * Rules (keep narrow to avoid breaking hard_cut / fade scenes):
 * - Env must be exactly "true"
 * - Must have a first-frame image (confirmed shot image)
 * - Boundary transition must be match_cut (same-scene continuity)
 * - Next shot must have a confirmed image usable as last_frame
 * - first/last mode must not mix reference_image (enforced in ArkVideoAdapter)
 */

import type { VideoTransitionType } from './video-transition-plan'

export type SeedanceInputMode = 'first_last_frame' | 'first_frame' | 'reference_media'

export function isSeedanceLastFrameEnabled(
  env: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env,
): boolean {
  return env.ARK_VIDEO_ENABLE_LAST_FRAME === 'true'
}

export function shouldAttachSeedanceLastFrame(input: {
  /** When omitted, reads ARK_VIDEO_ENABLE_LAST_FRAME from process.env */
  enabled?: boolean
  hasFirstFrame: boolean
  transitionType?: VideoTransitionType | string | null
  hasNextFrameImage: boolean
}): boolean {
  const enabled = input.enabled ?? isSeedanceLastFrameEnabled()
  return (
    enabled &&
    !!input.hasFirstFrame &&
    input.transitionType === 'match_cut' &&
    !!input.hasNextFrameImage
  )
}

export function resolveSeedanceInputMode(input: {
  hasFirstFrame: boolean
  hasLastFrame: boolean
}): SeedanceInputMode {
  if (!input.hasFirstFrame) return 'reference_media'
  return input.hasLastFrame ? 'first_last_frame' : 'first_frame'
}
