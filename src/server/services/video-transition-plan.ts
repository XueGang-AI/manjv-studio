export type VideoTransitionType = 'hard_cut' | 'match_cut' | 'fade_to_black'
export type TransitionMode = 'auto' | 'none'

export interface VideoTransitionPlanItem {
  type: VideoTransitionType
  durationFrames: number
  reason: string
  fromShotNo?: number
  toShotNo?: number
}

export interface TransitionShotContext {
  shotNo?: number | null
  sceneId?: string | null
  location?: string | null
  sceneTime?: string | null
  visual?: unknown
  camera?: unknown
  emotion?: string | null
  technicalNotes?: string | null
}

export interface ClipFadePlan {
  fadeInSeconds: number
  fadeOutSeconds: number
}

const DEFAULT_FADE_FRAMES = 12
const MIN_FADE_FRAMES = 6
const MAX_FADE_FRAMES = 18

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

function cleanText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function normalizeKey(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[\s,，。.:：;；、|｜/\\-]+/g, '')
}

function clampFadeFrames(value: unknown): number {
  const parsed = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_FADE_FRAMES
  return Math.max(MIN_FADE_FRAMES, Math.min(MAX_FADE_FRAMES, Math.round(parsed)))
}

export function normalizeTransitionMode(value: unknown): TransitionMode {
  return value === 'none' ? 'none' : 'auto'
}

export function normalizeTransitionType(value: unknown): VideoTransitionType | null {
  const text = cleanText(value).toLowerCase()
  if (!text) return null
  if (text === 'hard_cut' || /硬切|直接切/.test(text)) return 'hard_cut'
  if (text === 'match_cut' || /匹配剪辑|动作衔接|match/.test(text)) return 'match_cut'
  if (text === 'fade_to_black' || /淡出|淡入|黑场|fade/.test(text)) return 'fade_to_black'
  return null
}

export function getShotContinuityKey(shot: TransitionShotContext): string {
  const visual = asRecord(shot.visual)
  const explicitSceneKey = cleanText(visual?.scene_key) || cleanText(visual?.sceneKey)
  if (explicitSceneKey) return normalizeKey(explicitSceneKey)
  if (shot.sceneId) return `scene:${shot.sceneId}`

  const location = cleanText(shot.location)
  const sceneTime = cleanText(shot.sceneTime)
  if (!location && !sceneTime) return ''
  return normalizeKey(`${location}|${sceneTime}`)
}

function readExplicitTransition(shot: TransitionShotContext): VideoTransitionPlanItem | null {
  const visual = asRecord(shot.visual)
  const raw = visual?.transition_to_next ?? visual?.transitionToNext
  const rawRecord = asRecord(raw)
  const type = normalizeTransitionType(rawRecord?.type ?? raw)
  if (type) {
    return {
      type,
      durationFrames: type === 'fade_to_black' ? clampFadeFrames(rawRecord?.duration_frames ?? rawRecord?.durationFrames) : 0,
      reason: cleanText(rawRecord?.reason) || 'explicit_storyboard_transition',
    }
  }

  const notes = cleanText(shot.technicalNotes)
  if (!notes) return null
  const noteType = normalizeTransitionType(notes)
  if (!noteType) return null
  return {
    type: noteType,
    durationFrames: noteType === 'fade_to_black' ? DEFAULT_FADE_FRAMES : 0,
    reason: 'technical_notes_transition',
  }
}

function transitionForBoundary(from: TransitionShotContext, to: TransitionShotContext): VideoTransitionPlanItem {
  const explicit = readExplicitTransition(from)
  if (explicit) {
    return { ...explicit, fromShotNo: from.shotNo || undefined, toShotNo: to.shotNo || undefined }
  }

  const fromKey = getShotContinuityKey(from)
  const toKey = getShotContinuityKey(to)
  if (fromKey && toKey && fromKey === toKey) {
    return {
      type: 'match_cut',
      durationFrames: 0,
      reason: 'same_scene_continuity',
      fromShotNo: from.shotNo || undefined,
      toShotNo: to.shotNo || undefined,
    }
  }

  const fromTime = normalizeKey(cleanText(from.sceneTime))
  const toTime = normalizeKey(cleanText(to.sceneTime))
  if (fromTime && toTime && fromTime !== toTime) {
    return {
      type: 'fade_to_black',
      durationFrames: DEFAULT_FADE_FRAMES,
      reason: 'scene_time_change',
      fromShotNo: from.shotNo || undefined,
      toShotNo: to.shotNo || undefined,
    }
  }

  const fromLocation = normalizeKey(cleanText(from.location))
  const toLocation = normalizeKey(cleanText(to.location))
  if (fromLocation && toLocation && fromLocation !== toLocation) {
    return {
      type: 'fade_to_black',
      durationFrames: DEFAULT_FADE_FRAMES,
      reason: 'location_change',
      fromShotNo: from.shotNo || undefined,
      toShotNo: to.shotNo || undefined,
    }
  }

  return {
    type: 'hard_cut',
    durationFrames: 0,
    reason: 'default_boundary_cut',
    fromShotNo: from.shotNo || undefined,
    toShotNo: to.shotNo || undefined,
  }
}

export function deriveTransitionPlan(
  shots: TransitionShotContext[],
  options: { mode?: TransitionMode } = {},
): VideoTransitionPlanItem[] {
  if (options.mode === 'none' || shots.length < 2) return []
  const plan: VideoTransitionPlanItem[] = []
  for (let i = 0; i < shots.length - 1; i++) {
    plan.push(transitionForBoundary(shots[i], shots[i + 1]))
  }
  return plan
}

export function buildClipFadePlan(
  clipCount: number,
  transitions: VideoTransitionPlanItem[],
  fps: number,
): ClipFadePlan[] {
  const safeFps = Math.max(1, Math.min(120, Math.round(fps || 25)))
  const clips = Array.from({ length: Math.max(0, clipCount) }, () => ({
    fadeInSeconds: 0,
    fadeOutSeconds: 0,
  }))

  for (let i = 0; i < transitions.length && i < clipCount - 1; i++) {
    const transition = transitions[i]
    if (transition.type !== 'fade_to_black') continue
    const frames = clampFadeFrames(transition.durationFrames)
    const seconds = frames / safeFps
    clips[i].fadeOutSeconds = Math.max(clips[i].fadeOutSeconds, seconds)
    clips[i + 1].fadeInSeconds = Math.max(clips[i + 1].fadeInSeconds, seconds)
  }

  return clips
}
