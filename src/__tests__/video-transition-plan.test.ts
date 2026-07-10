import { describe, expect, it } from 'vitest'
import {
  buildClipFadePlan,
  deriveTransitionPlan,
  getShotContinuityKey,
  normalizeTransitionMode,
} from '@/server/services/video-transition-plan'

describe('视频转场规划', () => {
  it('优先使用 visual.scene_key 作为稳定场景键', () => {
    const shotA = {
      shotNo: 1,
      location: '修伞铺门口',
      sceneTime: '雨夜',
      visual: { scene_key: 'umbrella_shop_night' },
    }
    const shotB = {
      shotNo: 2,
      location: '老街修伞铺外侧',
      sceneTime: '雨夜',
      visual: { scene_key: 'umbrella_shop_night' },
    }

    expect(getShotContinuityKey(shotA)).toBe('umbrella_shop_night')
    expect(getShotContinuityKey(shotB)).toBe('umbrella_shop_night')
  })

  it('同场景相邻镜头默认使用 match_cut，跨时间段使用 fade_to_black', () => {
    const plan = deriveTransitionPlan([
      { shotNo: 1, location: '修伞铺', sceneTime: '雨夜', visual: { scene_key: 'shop_night' } },
      { shotNo: 2, location: '修伞铺门口', sceneTime: '雨夜', visual: { scene_key: 'shop_night' } },
      { shotNo: 3, location: '篮球场', sceneTime: '清晨', visual: { scene_key: 'court_morning' } },
    ])

    expect(plan).toHaveLength(2)
    expect(plan[0]).toMatchObject({ type: 'match_cut', durationFrames: 0, reason: 'same_scene_continuity' })
    expect(plan[1]).toMatchObject({ type: 'fade_to_black', durationFrames: 12, reason: 'scene_time_change' })
  })

  it('显式 transition_to_next 会覆盖自动判断', () => {
    const plan = deriveTransitionPlan([
      {
        shotNo: 1,
        location: '修伞铺',
        sceneTime: '雨夜',
        visual: {
          scene_key: 'shop_night',
          transition_to_next: { type: 'hard_cut', reason: '动作连续', duration_frames: 99 },
        },
      },
      { shotNo: 2, location: '篮球场', sceneTime: '清晨', visual: { scene_key: 'court_morning' } },
    ])

    expect(plan[0]).toMatchObject({ type: 'hard_cut', durationFrames: 0, reason: '动作连续' })
  })

  it('transitionMode=none 时不生成转场计划', () => {
    expect(normalizeTransitionMode('none')).toBe('none')
    expect(deriveTransitionPlan([
      { shotNo: 1, location: 'A' },
      { shotNo: 2, location: 'B' },
    ], { mode: 'none' })).toEqual([])
  })

  it('只为 fade_to_black 边界生成片段淡入淡出计划', () => {
    const fades = buildClipFadePlan(3, [
      { type: 'match_cut', durationFrames: 0, reason: 'same scene' },
      { type: 'fade_to_black', durationFrames: 10, reason: 'time jump' },
    ], 25)

    expect(fades[0]).toEqual({ fadeInSeconds: 0, fadeOutSeconds: 0 })
    expect(fades[1].fadeOutSeconds).toBeCloseTo(0.4)
    expect(fades[2].fadeInSeconds).toBeCloseTo(0.4)
  })
})
