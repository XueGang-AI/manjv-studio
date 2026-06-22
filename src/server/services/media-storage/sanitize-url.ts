/**
 * sourceUrl 脱敏（Phase 7.1）
 * --------------------------------------------
 * 禁止把完整签名 URL 长期存入数据库。
 * 保留 protocol + host + pathname，删除全部 query string 和 fragment。
 *
 * 完整源 URL 只允许在转存调用的内存中短暂存在。
 * 日志/错误/数据库/测试快照中不得出现完整签名 URL。
 */

/**
 * 脱敏 sourceUrl：移除 query string 和 fragment，仅保留 protocol+host+pathname。
 * 这样数据库保存的是可识别来源（哪个供应商/路径），但不包含签名参数。
 */
export function sanitizeSourceUrl(sourceUrl: string): string {
  if (!sourceUrl) return ''
  try {
    const parsed = new URL(sourceUrl)
    // 仅保留 protocol + host + pathname，删除 query 和 fragment
    return `${parsed.protocol}//${parsed.host}${parsed.pathname}`
  } catch {
    // 非 URL 格式：返回空，避免存入无法解析的字符串
    return ''
  }
}

/**
 * 检测 URL 是否包含敏感签名参数（用于审计/统计已有数据）。
 */
const SENSITIVE_QUERY_KEYS = new Set([
  'x-tos-signature',
  'x-tos-credential',
  'x-tos-date',
  'x-tos-expires',
  'x-tos-algorithm',
  'x-tos-signedheaders',
  'awsaccesskeyid',
  'x-amz-signature',
  'x-amz-credential',
  'x-amz-date',
  'x-amz-expires',
  'signature',
  'token',
  'accesskey',
  'secret',
])

export function hasSensitiveQueryParams(sourceUrl: string): boolean {
  if (!sourceUrl) return false
  try {
    const parsed = new URL(sourceUrl)
    for (const key of parsed.searchParams.keys()) {
      if (SENSITIVE_QUERY_KEYS.has(key.toLowerCase())) return true
    }
  } catch {
    return false
  }
  return false
}
