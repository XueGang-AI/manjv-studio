import { NextRequest, NextResponse } from 'next/server'
import fs from 'fs'
import { mediaStorage } from '@/server/services/media-storage'

/**
 * GET /api/media/<objectKey>
 * 静态服务本地转存的媒体文件（图片/视频）。
 * 替代供应商短期签名 URL，提供长期可访问地址。
 *
 * 安全：objectKey 经 mediaStorage.resolveLocalPath 校验路径遍历。
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ key: string[] }> }
) {
  const { key } = await params
  const objectKey = key.join('/')

  const filePath = mediaStorage.resolveLocalPath(objectKey)
  if (!filePath || !fs.existsSync(filePath)) {
    return NextResponse.json({ success: false, error: '资源不存在' }, { status: 404 })
  }

  // 推断 Content-Type
  const ext = objectKey.split('.').pop()?.toLowerCase() || ''
  const contentTypeMap: Record<string, string> = {
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    webp: 'image/webp',
    gif: 'image/gif',
    mp4: 'video/mp4',
    mov: 'video/quicktime',
    webm: 'video/webm',
  }
  const contentType = contentTypeMap[ext] || 'application/octet-stream'

  const stat = fs.statSync(filePath)
  const stream = fs.createReadStream(filePath)

  // 转为 Web ReadableStream
  const webStream = new ReadableStream({
    start(controller) {
      stream.on('data', (chunk) => {
        const buf = typeof chunk === 'string' ? Buffer.from(chunk) : chunk
        controller.enqueue(new Uint8Array(buf))
      })
      stream.on('end', () => controller.close())
      stream.on('error', (err) => controller.error(err))
    },
    cancel() {
      stream.destroy()
    },
  })

  return new NextResponse(webStream, {
    headers: {
      'Content-Type': contentType,
      'Content-Length': String(stat.size),
      'Cache-Control': 'public, max-age=86400',
    },
  })
}
