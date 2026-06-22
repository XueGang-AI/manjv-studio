/**
 * 媒体持久化策略（Phase 7.1）
 * --------------------------------------------
 * 统一决定转存失败时是否允许回退到供应商临时 URL。
 * 避免每条生成链路自行决定 fallback 行为。
 *
 * Development：允许临时 fallback（调试用），但必须输出脱敏 warning + 标记无 storageObjectKey。
 * Production：禁止 fallback——不得将供应商签名 URL 作为正式 imageUrl 保存，
 *   不标记可确认，不推进业务状态，任务进入 failed。
 */

export interface MediaPersistencePolicy {
  /** 转存失败时是否允许回退到供应商临时 URL（仅 development） */
  allowEphemeralFallback: boolean
}

export function getPersistPolicy(): MediaPersistencePolicy {
  const isProd = process.env.NODE_ENV === 'production'
  return {
    // 生产环境禁止 fallback：签名 URL 过期后业务不可用，且掩盖转存失败
    allowEphemeralFallback: !isProd,
  }
}

/**
 * 转存失败时的统一结果。调用方按 policy 决定行为：
 * - allowEphemeralFallback=true（dev）：可用 ephemeralUrl 调试，但 storageObjectKey=null
 * - allowEphemeralFallback=false（prod）：必须 failed，不保存 ephemeralUrl
 */
export interface PersistFallbackResult {
  storageObjectKey: null
  storageProvider: null
  /** 供应商临时 URL（仅 dev fallback 用，prod 不使用） */
  ephemeralUrl: string
  sourceUrl: string
  error: string
}

export function isProduction(): boolean {
  return process.env.NODE_ENV === 'production'
}
