// ============================================
// 模型适配器工厂 — Mock / Ark 切换
// ============================================
import { ITextAdapter, IImageAdapter, IVideoAdapter } from './types'
import { MockTextAdapter } from './mock/mock-text.adapter'
import { MockImageAdapter } from './mock/mock-image.adapter'
import { MockVideoAdapter } from './mock/mock-video.adapter'
import { ArkTextAdapter } from './ark-text.adapter'
import { ArkImageAdapter } from './ark/ark-image.adapter'
import { ArkVideoAdapter } from './ark-video.adapter'
import {
  getArkApiKey,
  getArkBaseUrl,
  getArkImageModel,
  getArkTextModel,
  getArkVideoModel,
  shouldUseMockModel,
} from './model-config'

export class AdapterFactory {
  private useMock: boolean

  constructor() {
    this.useMock = shouldUseMockModel()
  }

  getTextAdapter(_provider?: string): ITextAdapter {
    if (this.useMock) return new MockTextAdapter()

    return new ArkTextAdapter({
      model: getArkTextModel(),
      apiKey: getArkApiKey(),
      baseUrl: getArkBaseUrl(),
    })
  }

  getImageAdapter(_provider?: string): IImageAdapter {
    if (this.useMock) return new MockImageAdapter()

    return new ArkImageAdapter({
      model: getArkImageModel(),
      apiKey: getArkApiKey(),
      baseUrl: getArkBaseUrl(),
    })
  }

  getVideoAdapter(_provider?: string): IVideoAdapter {
    if (this.useMock) return new MockVideoAdapter()

    return new ArkVideoAdapter({
      model: getArkVideoModel(),
      apiKey: getArkApiKey(),
      baseUrl: getArkBaseUrl(),
    })
  }
}

export const adapterFactory = new AdapterFactory()
