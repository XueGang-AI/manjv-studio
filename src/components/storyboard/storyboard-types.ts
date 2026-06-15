/**
 * Storyboard shared types — aligned with Prisma + API
 */

export interface ImagePromptData {
  id: string; zhPrompt: string | null; enPrompt: string | null
  negativePrompt: string | null; confirmed: boolean
}

export interface VideoPromptData {
  id: string; prompt: string | null; duration: number | null
  motionStrength: string | null; negativePrompt: string | null; confirmed: boolean
}

export interface ShotData {
  id: string; shotNo: number; shotName: string | null
  startTime: number | null; endTime: number | null; sceneTime: string | null
  location: string | null; characters: unknown; action: string | null
  camera: Record<string, unknown>; visual: Record<string, unknown>
  emotion: string | null; sfx: string | null; bgm: string | null
  dialogue: string | null; purpose: string | null
  confirmed: boolean; imagePrompts: ImagePromptData[]; videoPrompts: VideoPromptData[]
}

export interface VoiceScriptData {
  id: string; content: Record<string, unknown>; confirmed: boolean
}

export interface EpisodeData {
  id: string; episodeNo: number; title: string | null; duration: number | null
  coreTask: string | null; emotionCurve: string | null
  openingHook: string | null; endingHook: string | null
  version: number; confirmed: boolean
  shots: ShotData[]; voiceScripts: VoiceScriptData[]
}

export interface ProjectData {
  id: string; projectName: string; storyType: string | null; artStyle: string | null
  modelProvider: string; status: string; episodeDuration: number; aspectRatio: string
}

// ─── Helpers ─────────────────────────────────────────────────────────

export function getShotDuration(shot: ShotData): number {
  return Math.max(0, (shot.endTime ?? 0) - (shot.startTime ?? 0))
}

export function getTotalDuration(shots: ShotData[]): number {
  return shots.reduce((sum, s) => sum + getShotDuration(s), 0)
}

export function getShotStatus(shot: ShotData, isConfirmed: boolean): 'confirmed' | 'pending' {
  return isConfirmed || shot.confirmed ? 'confirmed' : 'pending'
}
