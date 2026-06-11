// ============================================
// 模型适配器工厂 — Mock / Ark / Agnes 切换
// ============================================
import { ITextAdapter, IImageAdapter, IVideoAdapter } from './types'
import { MockTextAdapter } from './mock/mock-text.adapter'
import { MockImageAdapter } from './mock/mock-image.adapter'
import { MockVideoAdapter } from './mock/mock-video.adapter'
import { AgnesTextAdapter, AgnesTextAdapterConfig } from './agnes/agnes-text.adapter'
import { AgnesImageAdapter, AgnesImageAdapterConfig } from './agnes/agnes-image.adapter'
import { AgnesVideoAdapter, AgnesVideoAdapterConfig } from './agnes/agnes-video.adapter'
import { ArkTextAdapter, ArkTextAdapterOptions } from './ark-text.adapter'
import { ArkImageAdapter, ArkImageAdapterConfig } from './ark/ark-image.adapter'
import { ArkVideoAdapter, ArkVideoAdapterOptions } from './ark-video.adapter'

export type ModelProvider = 'ark' | 'agnes'

export class AdapterFactory {
  private useMock: boolean

  constructor() {
    this.useMock = process.env.USE_MOCK_MODEL === 'true'
  }

  getTextAdapter(provider?: string): ITextAdapter {
    if (this.useMock) return new MockTextAdapter()

    const p = (provider || 'agnes') as ModelProvider

    if (p === 'ark') {
      return new ArkTextAdapter({
        model: process.env.ARK_TEXT_MODEL || 'doubao-seed-character-251128',
        apiKey: process.env.ARK_API_KEY || '',
        baseUrl: process.env.ARK_API_BASE_URL || 'https://ark.cn-beijing.volces.com/api/v3',
      })
    }

    return new AgnesTextAdapter({
      model: process.env.AGNES_TEXT_MODEL || 'agnes-2.0-flash',
      apiKey: process.env.AGNES_TEXT_API_KEY || '',
      baseUrl: process.env.AGNES_TEXT_API_BASE_URL || 'https://apihub.agnes-ai.com/v1',
    })
  }

  getImageAdapter(provider?: string): IImageAdapter {
    if (this.useMock) return new MockImageAdapter()

    const p = (provider || 'agnes') as ModelProvider

    if (p === 'ark') {
      return new ArkImageAdapter({
        model: process.env.ARK_IMAGE_MODEL || 'doubao-seedream-5-0-260128',
        apiKey: process.env.ARK_API_KEY || '',
        baseUrl: process.env.ARK_API_BASE_URL || 'https://ark.cn-beijing.volces.com/api/v3',
      })
    }

    return new AgnesImageAdapter({
      model: process.env.AGNES_IMAGE_MODEL || 'agnes-image-2.0-flash',
      apiKey: process.env.AGNES_IMAGE_API_KEY || '',
      baseUrl: process.env.AGNES_IMAGE_API_BASE_URL || 'https://apihub.agnes-ai.com/v1',
    })
  }

  getVideoAdapter(provider?: string): IVideoAdapter {
    if (this.useMock) return new MockVideoAdapter()

    const p = (provider || 'agnes') as ModelProvider

    if (p === 'ark') {
      return new ArkVideoAdapter({
        model: process.env.ARK_VIDEO_MODEL || 'doubao-seedance-1-5-pro-251215',
        apiKey: process.env.ARK_API_KEY || '',
        baseUrl: process.env.ARK_API_BASE_URL || 'https://ark.cn-beijing.volces.com/api/v3',
      })
    }

    return new AgnesVideoAdapter({
      model: process.env.AGNES_VIDEO_MODEL || 'agnes-video-v2.0',
      apiKey: process.env.AGNES_VIDEO_API_KEY || '',
      baseUrl: process.env.AGNES_VIDEO_API_BASE_URL || 'https://apihub.agnes-ai.com/v1',
    })
  }
}

export const adapterFactory = new AdapterFactory()
