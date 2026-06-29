import { describe, expect, it } from 'vitest'
import { snapArkSeedanceDuration } from '@/server/model-adapters/ark-video.adapter'

describe('Ark Seedance 视频时长收口', () => {
  it('点号版 Seedance 2.0 与横线版一样允许 4 到 15 秒', () => {
    expect(snapArkSeedanceDuration(15, 'image_to_video', 'doubao-seedance-2.0')).toBe(15)
    expect(snapArkSeedanceDuration(16, 'image_to_video', 'doubao-seedance-2.0')).toBe(15)
    expect(snapArkSeedanceDuration(3, 'image_to_video', 'doubao-seedance-2.0')).toBe(4)

    expect(snapArkSeedanceDuration(15, 'image_to_video', 'doubao-seedance-2-0-260128')).toBe(15)
  })

  it('Seedance 1.5 图生视频仍限制到 12 秒', () => {
    expect(snapArkSeedanceDuration(10, 'image_to_video', 'doubao-seedance-1.5-pro')).toBe(10)
    expect(snapArkSeedanceDuration(12, 'image_to_video', 'doubao-seedance-1.5-pro')).toBe(12)
    expect(snapArkSeedanceDuration(15, 'image_to_video', 'doubao-seedance-1.5-pro')).toBe(12)
  })
})
