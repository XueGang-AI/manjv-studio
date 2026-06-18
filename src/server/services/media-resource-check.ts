/**
 * 媒体资源可访问性校验（Phase 6 修正）
 * --------------------------------------------
 * 在调用 Ark 视频生成前，校验 confirmedImage（inputImage）可被远端服务访问。
 * 避免因 TOS 签名 URL 过期（403）触发付费视频生成失败。
 *
 * Phase 6 修正：
 * - 签名 URL 可能只允许 GET（HEAD 返回 403/405 不代表 GET 不可访问）
 * - 以 GET（Range: bytes=0-1）为权威检查，HEAD 仅作补充信息
 * - 不以 HEAD 403 单独认定不可访问
 * - 接受 200/206，拒绝 401/403/404/410/非图片 Content-Type
 * - 不支持 Range 时读最小数据后主动终止流，不把大图读入内存
 * - 正确清理 AbortController/Reader/响应流
 * - 错误信息脱敏，不含完整签名 URL
 */

export interface ResourceCheckResult {
  accessible: boolean
  /** 失败时的可理解原因（脱敏，不含 URL） */
  reason?: string
  /** HTTP 状态码（若获得） */
  status?: number
  /** Content-Type（若获得） */
  contentType?: string
  /** Content-Length（若获得） */
  contentLength?: number
}

const SUPPORTED_IMAGE_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
])

/** 拒绝访问的 HTTP 状态码 */
const FORBIDDEN_STATUS = new Set([401, 403, 404, 410])

function classifyStatus(status: number): string | null {
  if (FORBIDDEN_STATUS.has(status)) {
    if (status === 403 || status === 401) return '输入图片暂不可访问（可能签名已过期或权限不足）'
    if (status === 404) return '输入图片不存在（可能已被清理）'
    if (status === 410) return '输入图片已失效（资源已移除）'
  }
  return null
}

function checkContentType(contentType: string | null | undefined): string | null {
  if (!contentType) return null
  const baseType = contentType.split(';')[0].trim().toLowerCase()
  if (!SUPPORTED_IMAGE_TYPES.has(baseType)) {
    return `输入图片格式不支持（${baseType}）`
  }
  return null
}

/**
 * 主动消费并丢弃响应 body，确保流被清理。
 * 仅读取极少量数据后取消，避免大图入内存。
 */
async function drainAndCancel(body: ReadableStream<Uint8Array> | null): Promise<void> {
  if (!body) return
  try {
    const reader = body.getReader()
    // 读一个 chunk 即可确认可读，然后取消
    await reader.read()
    reader.releaseLock()
    await body.cancel()
  } catch {
    // 忽略清理错误
    try { await body.cancel() } catch { /* noop */ }
  }
}

/**
 * 校验远端图片资源可访问性（GET 优先，HEAD 仅补充）。
 * 不抛异常，返回结构化结果。
 */
export async function checkImageAccessible(url: string): Promise<ResourceCheckResult> {
  if (!url) {
    return { accessible: false, reason: '输入图片地址为空' }
  }

  let parsedUrl: URL
  try {
    parsedUrl = new URL(url)
  } catch {
    return { accessible: false, reason: '输入图片地址格式无效' }
  }

  if (parsedUrl.protocol !== 'https:' && parsedUrl.protocol !== 'http:') {
    return { accessible: false, reason: '输入图片协议不支持' }
  }

  // ─── 权威检查：GET Range 0-1（签名 URL 可能只允许 GET）───
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 8000)
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: { Range: 'bytes=0-1' },
      redirect: 'follow',
      signal: controller.signal,
    })

    // 拒绝状态
    const forbiddenReason = classifyStatus(res.status)
    if (forbiddenReason) {
      await drainAndCancel(res.body)
      return { accessible: false, reason: forbiddenReason, status: res.status }
    }

    // 接受 200（不支持 Range，返回完整）或 206（Partial Content）
    if (res.status !== 200 && res.status !== 206) {
      await drainAndCancel(res.body)
      return { accessible: false, reason: `输入图片暂不可访问（HTTP ${res.status}）`, status: res.status }
    }

    const contentType = res.headers.get('content-type') || undefined
    const contentLengthStr = res.headers.get('content-length')
    const contentLength = contentLengthStr ? parseInt(contentLengthStr, 10) : undefined

    const typeError = checkContentType(contentType)
    if (typeError) {
      await drainAndCancel(res.body)
      return { accessible: false, reason: typeError, status: res.status, contentType }
    }

    // 确认 body 可读后立即清理（不把大图读入内存）
    await drainAndCancel(res.body)

    return {
      accessible: true,
      status: res.status,
      contentType,
      contentLength: Number.isFinite(contentLength) ? contentLength : undefined,
    }
  } catch (err) {
    if (err instanceof DOMException && err.name === 'TimeoutError') {
      return { accessible: false, reason: '输入图片访问超时' }
    }
    if (err instanceof Error && err.name === 'AbortError') {
      return { accessible: false, reason: '输入图片访问超时' }
    }
    return { accessible: false, reason: '输入图片暂不可访问（网络错误）' }
  } finally {
    clearTimeout(timeoutId)
  }
}
