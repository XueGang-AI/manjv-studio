import { describe, expect, it } from 'vitest'
import {
  isSeedanceLastFrameEnabled,
  resolveSeedanceInputMode,
  shouldAttachSeedanceLastFrame,
} from '@/server/services/seedance-last-frame'

describe('seedance-last-frame policy', () => {
  it('仅当环境变量严格为 true 时视为启用', () => {
    expect(isSeedanceLastFrameEnabled({ ARK_VIDEO_ENABLE_LAST_FRAME: 'true' })).toBe(true)
    expect(isSeedanceLastFrameEnabled({ ARK_VIDEO_ENABLE_LAST_FRAME: '1' })).toBe(false)
    expect(isSeedanceLastFrameEnabled({ ARK_VIDEO_ENABLE_LAST_FRAME: 'false' })).toBe(false)
    expect(isSeedanceLastFrameEnabled({})).toBe(false)
  })

  it('仅 match_cut + 首帧 + 下一镜确认图 才附加 last_frame', () => {
    expect(shouldAttachSeedanceLastFrame({
      enabled: true,
      hasFirstFrame: true,
      transitionType: 'match_cut',
      hasNextFrameImage: true,
    })).toBe(true)

    expect(shouldAttachSeedanceLastFrame({
      enabled: true,
      hasFirstFrame: true,
      transitionType: 'hard_cut',
      hasNextFrameImage: true,
    })).toBe(false)

    expect(shouldAttachSeedanceLastFrame({
      enabled: true,
      hasFirstFrame: true,
      transitionType: 'fade_to_black',
      hasNextFrameImage: true,
    })).toBe(false)

    expect(shouldAttachSeedanceLastFrame({
      enabled: false,
      hasFirstFrame: true,
      transitionType: 'match_cut',
      hasNextFrameImage: true,
    })).toBe(false)

    expect(shouldAttachSeedanceLastFrame({
      enabled: true,
      hasFirstFrame: false,
      transitionType: 'match_cut',
      hasNextFrameImage: true,
    })).toBe(false)

    expect(shouldAttachSeedanceLastFrame({
      enabled: true,
      hasFirstFrame: true,
      transitionType: 'match_cut',
      hasNextFrameImage: false,
    })).toBe(false)
  })

  it('input mode 命名与审计字段一致', () => {
    expect(resolveSeedanceInputMode({ hasFirstFrame: false, hasLastFrame: false })).toBe('reference_media')
    expect(resolveSeedanceInputMode({ hasFirstFrame: true, hasLastFrame: false })).toBe('first_frame')
    expect(resolveSeedanceInputMode({ hasFirstFrame: true, hasLastFrame: true })).toBe('first_last_frame')
  })
})
