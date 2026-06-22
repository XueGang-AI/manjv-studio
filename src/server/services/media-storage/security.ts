/**
 * 媒体存储安全模块（Phase 7）
 * --------------------------------------------
 * SSRF 防护：服务端下载外部 URL 时禁止访问内网/元数据/私网地址。
 */

const SSRF_BLOCKED_HOSTS = new Set([
  'localhost',
  'metadata.google.internal',
  '169.254.169.254', // AWS/GCP 元数据
  'metadata.tencentyun.com',
  '100.100.100.200', // 阿里云元数据
  '0.0.0.0',
])

/** 判断 IP 形式主机名是否为私网/保留地址 */
export function isPrivateIp(host: string): boolean {
  const parts = host.split('.').map(Number)
  if (parts.length !== 4 || parts.some(p => !Number.isInteger(p) || p < 0 || p > 255)) {
    return false
  }
  const [a, b] = parts
  if (a === 10) return true
  if (a === 172 && b >= 16 && b <= 31) return true
  if (a === 192 && b === 168) return true
  if (a === 127) return true // loopback
  if (a === 169 && b === 254) return true // link-local / metadata
  if (a === 0) return true
  return false
}

export function isSsrfBlockedHost(host: string): boolean {
  const h = host.toLowerCase()
  return SSRF_BLOCKED_HOSTS.has(h) || isPrivateIp(h)
}

/**
 * 校验来源 URL 安全性。抛错则不继续下载。
 * 仅允许 http/https，禁止内网/元数据地址。
 */
export function validateSourceUrl(sourceUrl: string): URL {
  let parsed: URL
  try {
    parsed = new URL(sourceUrl)
  } catch {
    throw new Error('来源地址格式无效')
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new Error('来源协议不支持（仅允许 http/https）')
  }
  const host = parsed.hostname.toLowerCase()
  if (isSsrfBlockedHost(host)) {
    throw new Error('来源地址被禁止访问')
  }
  return parsed
}
