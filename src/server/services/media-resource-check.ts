/**
 * 媒体资源可访问性校验（Phase 5 视频链路可靠性）
 * --------------------------------------------
 * 在调用 Ark 视频生成前，校验 confirmedImage（inputImage）可被远端服务访问。
 * 避免因 TOS 签名 URL 过期（403）触发付费视频生成失败。
 *
 * 设计：
 * - 轻量检查：HEAD 优先（无 body 下载）；HEAD 不支持时用 Range GET 首字节
 * - 不下载完整大图
 * - 返回结构化结果，不抛异常（调用方决定是否中止）
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

/**
 * 校验远端图片资源可访问性。
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

  // 轻量检查：HEAD 请求（不下载 body）
  try {
    const headRes = await fetch(url, {
      method: 'HEAD',
      signal: AbortSignal.timeout(8000),
      redirect: 'follow',
    })

    if (headRes.status === 403 || headRes.status === 401) {
      return {
        accessible: false,
        reason: '输入图片暂不可访问（可能签名已过期或权限不足）',
        status: headRes.status,
      }
    }
    if (headRes.status === 404) {
      return { accessible: false, reason: '输入图片不存在（可能已被清理）', status: 404 }
    }
    if (!headRes.ok) {
      return {
        accessible: false,
        reason: `输入图片暂不可访问（HTTP ${headRes.status}）`,
        status: headRes.status,
      }
    }

    const contentType = headRes.headers.get('content-type') || undefined
    const contentLengthStr = headRes.headers.get('content-length')
    const contentLength = contentLengthStr ? parseInt(contentLengthStr, 10) : undefined

    // Content-Type 校验（若服务端返回）
    if (contentType) {
      const baseType = contentType.split(';')[0].trim().toLowerCase()
      if (!SUPPORTED_IMAGE_TYPES.has(baseType)) {
        return {
          accessible: false,
          reason: `输入图片格式不支持（${baseType}）`,
          status: headRes.status,
          contentType,
        }
      }
    }

    return {
      accessible: true,
      status: headRes.status,
      contentType,
      contentLength: Number.isFinite(contentLength) ? contentLength : undefined,
    }
  } catch (err) {
    // HEAD 可能被某些存储拒绝（405），降级到 Range GET 首字节
    if (err instanceof DOMException && err.name === 'TimeoutError') {
      return { accessible: false, reason: '输入图片访问超时' }
    }

    // 降级：Range GET 0-1（仅取首字节，最小下载）
    try {
      const rangeRes = await fetch(url, {
        method: 'GET',
        headers: { Range: 'bytes=0-1' },
        signal: AbortSignal.timeout(8000),
        redirect: 'follow',
      })
      if (rangeRes.status === 403 || rangeRes.status === 401) {
        return { accessible: false, reason: '输入图片暂不可访问（可能签名已过期或权限不足）', status: rangeRes.status }
      }
      if (rangeRes.status === 404) {
        return { accessible: false, reason: '输入图片不存在（可能已被清理）', status: 404 }
      }
      // 206 (Partial Content) 或 200 都表示可访问
      if (rangeRes.status === 206 || rangeRes.status === 200) {
        const contentType = rangeRes.headers.get('content-type') || undefined
        if (contentType) {
          const baseType = contentType.split(';')[0].trim().toLowerCase()
          if (!SUPPORTED_IMAGE_TYPES.has(baseType)) {
            return { accessible: false, reason: `输入图片格式不支持（${baseType}）`, status: rangeRes.status, contentType }
          }
        }
        // 立即丢弃 body，不保留
        await rangeRes.body?.cancel()
        return { accessible: true, status: rangeRes.status, contentType }
      }
      return { accessible: false, reason: `输入图片暂不可访问（HTTP ${rangeRes.status}）`, status: rangeRes.status }
    } catch (err2) {
      if (err2 instanceof DOMException && err2.name === 'TimeoutError') {
        return { accessible: false, reason: '输入图片访问超时' }
      }
      return { accessible: false, reason: '输入图片暂不可访问（网络错误）' }
    }
  }
}
