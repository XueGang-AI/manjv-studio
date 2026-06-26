import fs from 'fs'
import { NextRequest, NextResponse } from 'next/server'
import { contentTypeForLocalMedia, resolveLocalMediaPath } from '@/server/services/local-media-read-url'

function nodeStreamToWeb(stream: fs.ReadStream): ReadableStream<Uint8Array> {
  return new ReadableStream({
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
}

function parseRange(rangeHeader: string, size: number): { start: number; end: number } | null {
  const match = rangeHeader.match(/^bytes=(\d*)-(\d*)$/)
  if (!match) return null

  const [, rawStart, rawEnd] = match
  if (!rawStart && !rawEnd) return null

  if (!rawStart) {
    const suffixLength = Number(rawEnd)
    if (!Number.isInteger(suffixLength) || suffixLength <= 0) return null
    return { start: Math.max(size - suffixLength, 0), end: size - 1 }
  }

  const start = Number(rawStart)
  const end = rawEnd ? Number(rawEnd) : size - 1
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end < start || start >= size) {
    return null
  }

  return { start, end: Math.min(end, size - 1) }
}

async function serveLocalMedia(
  request: NextRequest,
  params: Promise<{ path: string[] }>,
  includeBody: boolean,
) {
  const { path: mediaPath } = await params
  const filePath = resolveLocalMediaPath(mediaPath)
  if (!filePath || !fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    return NextResponse.json({ success: false, error: '资源不存在' }, { status: 404 })
  }

  const stat = fs.statSync(filePath)
  const contentType = contentTypeForLocalMedia(filePath)
  const rangeHeader = request.headers.get('range')

  if (rangeHeader) {
    const range = parseRange(rangeHeader, stat.size)
    if (!range) {
      return new NextResponse(null, {
        status: 416,
        headers: {
          'Content-Range': `bytes */${stat.size}`,
          'Accept-Ranges': 'bytes',
        },
      })
    }

    const { start, end } = range
    const contentLength = end - start + 1
    const body = includeBody ? nodeStreamToWeb(fs.createReadStream(filePath, { start, end })) : null
    return new NextResponse(body, {
      status: 206,
      headers: {
        'Content-Type': contentType,
        'Content-Length': String(contentLength),
        'Content-Range': `bytes ${start}-${end}/${stat.size}`,
        'Accept-Ranges': 'bytes',
        'Cache-Control': 'public, max-age=86400',
      },
    })
  }

  const body = includeBody ? nodeStreamToWeb(fs.createReadStream(filePath)) : null
  return new NextResponse(body, {
    headers: {
      'Content-Type': contentType,
      'Content-Length': String(stat.size),
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'public, max-age=86400',
    },
  })
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  return serveLocalMedia(request, params, true)
}

export async function HEAD(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  return serveLocalMedia(request, params, false)
}
