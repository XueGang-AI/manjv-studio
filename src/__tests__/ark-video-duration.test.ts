import { afterEach, describe, expect, it, vi } from 'vitest'
import { ArkVideoAdapter, isArkLastFrameEnabled, snapArkSeedanceDuration } from '@/server/model-adapters/ark-video.adapter'

describe('Ark Seedance 视频时长收口', () => {
  const oldLastFrameFlag = process.env.ARK_VIDEO_ENABLE_LAST_FRAME

  afterEach(() => {
    if (oldLastFrameFlag === undefined) delete process.env.ARK_VIDEO_ENABLE_LAST_FRAME
    else process.env.ARK_VIDEO_ENABLE_LAST_FRAME = oldLastFrameFlag
    vi.unstubAllGlobals()
  })

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

  it('仅在显式开关启用时发送 last_frame，且不混用 reference_image', async () => {
    process.env.ARK_VIDEO_ENABLE_LAST_FRAME = 'true'
    expect(isArkLastFrameEnabled()).toBe(true)

    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      task_id: 'task-1',
      status: 'queued',
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
    vi.stubGlobal('fetch', fetchMock)

    const adapter = new ArkVideoAdapter({
      model: 'doubao-seedance-1-5-pro-251215',
      apiKey: 'test-key',
      baseUrl: 'https://ark.example.test/api/v3',
    })

    await adapter.createVideoTask({
      taskType: 'image_to_video',
      prompt: '保持同一镜头动作',
      inputImage: 'https://example.com/first.jpg',
      lastImage: 'https://example.com/last.jpg',
      referenceImages: ['https://example.com/ref.jpg'],
      duration: 6,
      aspectRatio: '9:16',
    })

    const body = JSON.parse(fetchMock.mock.calls[0][1]?.body as string)
    const roles = body.content
      .filter((item: Record<string, unknown>) => item.type === 'image_url')
      .map((item: Record<string, unknown>) => item.role)

    expect(roles).toEqual(['first_frame', 'last_frame'])
    expect(roles).not.toContain('reference_image')
  })
})
