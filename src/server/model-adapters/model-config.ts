// ============================================
// Runtime model config
// ============================================

export type RuntimeModelProvider = 'ark'
export type RuntimeModelType = 'text' | 'image' | 'video'

export const RUNTIME_MODEL_PROVIDER: RuntimeModelProvider = 'ark'

export const DEFAULT_ARK_API_BASE_URL = 'https://ark.cn-beijing.volces.com/api/v3'
export const DEFAULT_ARK_TEXT_MODEL = 'doubao-seed-character-251128'
export const DEFAULT_ARK_IMAGE_MODEL = 'doubao-seedream-5-0-260128'
export const DEFAULT_ARK_VIDEO_MODEL = 'doubao-seedance-2-0-260128'

export function shouldUseMockModel(): boolean {
  if (process.env.NODE_ENV === 'production' && process.env.USE_MOCK_MODEL === 'true') {
    throw new Error('USE_MOCK_MODEL=true is not allowed in production')
  }

  return process.env.USE_MOCK_MODEL === 'true'
}

export function getArkApiKey(): string {
  return process.env.ARK_API_KEY || ''
}

export function getArkBaseUrl(): string {
  return process.env.ARK_API_BASE_URL || DEFAULT_ARK_API_BASE_URL
}

export function getArkTextModel(): string {
  return process.env.ARK_TEXT_MODEL || DEFAULT_ARK_TEXT_MODEL
}

export function getArkImageModel(): string {
  return process.env.ARK_IMAGE_MODEL || DEFAULT_ARK_IMAGE_MODEL
}

export function getArkVideoModel(): string {
  return process.env.ARK_VIDEO_MODEL || DEFAULT_ARK_VIDEO_MODEL
}

export function getRuntimeModelName(type: RuntimeModelType): string {
  if (type === 'text') return getArkTextModel()
  if (type === 'image') return getArkImageModel()
  return getArkVideoModel()
}
