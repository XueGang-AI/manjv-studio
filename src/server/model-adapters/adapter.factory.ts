// ============================================
// 模型适配器工厂 — Mock / Real 切换
// ============================================
import { ITextAdapter, IImageAdapter, IVideoAdapter } from './types'
import { MockTextAdapter } from './mock/mock-text.adapter'
import { MockImageAdapter } from './mock/mock-image.adapter'
import { MockVideoAdapter } from './mock/mock-video.adapter'
import { AgnesTextAdapter } from './agnes/agnes-text.adapter'
import { AgnesImageAdapter } from './agnes/agnes-image.adapter'
import { AgnesVideoAdapter } from './agnes/agnes-video.adapter'

export class AdapterFactory {
  private useMock: boolean

  constructor() {
    this.useMock = process.env.USE_MOCK_MODEL === 'true'
  }

  getTextAdapter(): ITextAdapter {
    return this.useMock ? new MockTextAdapter() : new AgnesTextAdapter()
  }

  getImageAdapter(): IImageAdapter {
    return this.useMock ? new MockImageAdapter() : new AgnesImageAdapter()
  }

  getVideoAdapter(): IVideoAdapter {
    return this.useMock ? new MockVideoAdapter() : new AgnesVideoAdapter()
  }
}

export const adapterFactory = new AdapterFactory()
