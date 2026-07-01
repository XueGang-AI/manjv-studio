import { describe, expect, it, afterEach, beforeEach } from 'vitest'
import {
  DEFAULT_ARK_API_BASE_URL,
  DEFAULT_ARK_IMAGE_MODEL,
  DEFAULT_ARK_TEXT_MODEL,
  DEFAULT_ARK_VIDEO_MODEL,
  getArkBaseUrl,
  getArkVideoBaseUrl,
  getRuntimeModelName,
  normalizeArkBaseUrl,
} from '@/server/model-adapters/model-config'

const ENV_KEYS = [
  'ARK_API_BASE_URL',
  'ARK_VIDEO_API_BASE_URL',
  'ARK_TEXT_MODEL',
  'ARK_IMAGE_MODEL',
  'ARK_VIDEO_MODEL',
] as const

let savedEnv: Record<(typeof ENV_KEYS)[number], string | undefined>

beforeEach(() => {
  savedEnv = Object.fromEntries(ENV_KEYS.map(key => [key, process.env[key]])) as typeof savedEnv
  for (const key of ENV_KEYS) {
    delete process.env[key]
  }
})

afterEach(() => {
  for (const key of ENV_KEYS) {
    const value = savedEnv[key]
    if (value === undefined) {
      delete process.env[key]
    } else {
      process.env[key] = value
    }
  }
})

describe('Ark 运行模型配置', () => {
  it('默认配置使用 Ark plan base URL 与新模型', () => {
    expect(DEFAULT_ARK_API_BASE_URL).toBe('https://ark.cn-beijing.volces.com/api/plan')
    expect(DEFAULT_ARK_TEXT_MODEL).toBe('doubao-seed-2-0-pro-260215')
    expect(DEFAULT_ARK_IMAGE_MODEL).toBe('doubao-seedream-5-0-260128')
    expect(DEFAULT_ARK_VIDEO_MODEL).toBe('doubao-seedance-1-5-pro-251215')

    expect(getRuntimeModelName('text')).toBe(DEFAULT_ARK_TEXT_MODEL)
    expect(getRuntimeModelName('image')).toBe(DEFAULT_ARK_IMAGE_MODEL)
    expect(getRuntimeModelName('video')).toBe(DEFAULT_ARK_VIDEO_MODEL)
  })

  it('把 api/plan 配置规范化为实际请求前缀', () => {
    expect(normalizeArkBaseUrl('https://ark.cn-beijing.volces.com/api/plan')).toBe(
      'https://ark.cn-beijing.volces.com/api/plan/v3'
    )
    expect(normalizeArkBaseUrl('https://ark.cn-beijing.volces.com/api/plan/')).toBe(
      'https://ark.cn-beijing.volces.com/api/plan/v3'
    )
    expect(normalizeArkBaseUrl('https://ark.cn-beijing.volces.com/api/plan/v3')).toBe(
      'https://ark.cn-beijing.volces.com/api/plan/v3'
    )
  })

  it('文本图片与视频接口都使用规范化后的 base URL', () => {
    expect(getArkBaseUrl()).toBe('https://ark.cn-beijing.volces.com/api/plan/v3')

    process.env.ARK_API_BASE_URL = 'https://ark.cn-beijing.volces.com/api/plan'
    expect(getArkBaseUrl()).toBe('https://ark.cn-beijing.volces.com/api/plan/v3')

    process.env.ARK_VIDEO_API_BASE_URL = 'https://ark.cn-beijing.volces.com/api/plan'
    expect(getArkVideoBaseUrl()).toBe('https://ark.cn-beijing.volces.com/api/plan/v3')
  })
})
