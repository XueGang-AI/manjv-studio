// ============================================
// 模型适配器基类
// ============================================
import { ITextAdapter, IImageAdapter, IVideoAdapter } from './types'

export abstract class BaseTextAdapter implements ITextAdapter {
  abstract generate<T = unknown>(
    request: Parameters<ITextAdapter['generate']>[0]
  ): ReturnType<ITextAdapter['generate']>
}

export abstract class BaseImageAdapter implements IImageAdapter {
  abstract generate(
    request: Parameters<IImageAdapter['generate']>[0]
  ): ReturnType<IImageAdapter['generate']>
}

export abstract class BaseVideoAdapter implements IVideoAdapter {
  abstract generate(
    request: Parameters<IVideoAdapter['generate']>[0]
  ): ReturnType<IVideoAdapter['generate']>
}
