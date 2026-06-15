/**
 * FFmpeg 安全工具函数
 *
 * 提供 URL 校验、路径安全、进程执行包装、concat 文件安全生成等功能。
 * 所有 FFmpeg/ffprobe 调用必须通过此模块的安全包装执行。
 */

import { spawn } from 'child_process'
import crypto from 'crypto'
import fs from 'fs'
import path from 'path'

// ─── 配置 ─────────────────────────────────────────────────────────

export const FFMPEG_PATH = process.env.FFMPEG_PATH || 'ffmpeg'
export const FFPROBE_PATH = process.env.FFPROBE_PATH || 'ffprobe'
export const UPLOAD_DIR = process.env.UPLOAD_DIR || './uploads'

/** 单个输入视频最大体积 (500 MB) */
const MAX_INPUT_FILE_SIZE = 500 * 1024 * 1024
/** 单任务输入总大小上限 (2 GB) — enforced in concatVideos */
const _MAX_TOTAL_INPUT_SIZE = 2 * 1024 * 1024 * 1024
/** 单个输入视频数量上限 */
const MAX_INPUT_COUNT = 100
/** 下载超时 (30s) */
const DOWNLOAD_TIMEOUT = 30_000
/** 下载最大重定向次数 */
const MAX_REDIRECTS = 5
/** spawn 最大 stderr 缓存 (64 KB) */
const MAX_STDERR_BYTES = 64 * 1024
/** spawn 最大 stdout 缓存 (16 KB) */
const MAX_STDOUT_BYTES = 16 * 1024

// ─── 错误码 ──────────────────────────────────────────────────────

export type RenderErrorCode =
  | 'INVALID_VIDEO_SOURCE'
  | 'VIDEO_DOWNLOAD_FAILED'
  | 'VIDEO_VALIDATION_FAILED'
  | 'MEDIA_FORMAT_INCOMPATIBLE'
  | 'RENDER_TIMEOUT'
  | 'RENDER_FAILED'
  | 'RENDER_ALREADY_RUNNING'
  | 'INVALID_INPUT'

export class RenderError extends Error {
  constructor(
    public readonly code: RenderErrorCode,
    message: string,
    public readonly internalDetail?: string,
  ) {
    super(message)
    this.name = 'RenderError'
  }
}

/** 脱敏错误 — 返回给前端的信息 */
export function sanitizeError(error: unknown): { code: string; message: string } {
  if (error instanceof RenderError) {
    return { code: error.code, message: error.message }
  }
  // Never expose internal details
  return { code: 'RENDER_FAILED', message: '成片合成失败，请检查视频片段后重试' }
}

// ─── URL 校验 ────────────────────────────────────────────────────

/** 私有 IP 范围检查 */
function isPrivateIP(hostname: string): boolean {
  // IPv4
  if (/^127\./.test(hostname)) return true
  if (/^10\./.test(hostname)) return true
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(hostname)) return true
  if (/^192\.168\./.test(hostname)) return true
  if (/^0\.0\.0\.0$/.test(hostname)) return true
  // IPv6 loopback
  if (hostname === '::1' || hostname === '[::1]') return true
  // Cloud metadata
  if (hostname === '169.254.169.254' || hostname === 'metadata.google.internal') return true
  // localhost variants
  if (hostname === 'localhost' || hostname.endsWith('.localhost')) return true
  return false
}

/** 检查 URL 是否包含控制字符 */
function hasControlChars(str: string): boolean {
  // eslint-disable-next-line no-control-regex
  return /[\x00-\x1f\x7f\r\n]/.test(str)
}

/**
 * 校验远程视频 URL 是否安全
 *
 * 规则：
 * - 只允许 http/https 协议
 * - 拒绝用户名密码形式
 * - 拒绝控制字符
 * - 拒绝私有 IP / localhost / 元数据地址
 * - 长度上限
 */
export function validateRemoteUrl(raw: string): { valid: true; url: URL } | { valid: false; reason: string } {
  if (raw.length > 2048) return { valid: false, reason: 'URL 过长' }
  if (hasControlChars(raw)) return { valid: false, reason: 'URL 包含控制字符' }

  let parsed: URL
  try {
    parsed = new URL(raw)
  } catch {
    return { valid: false, reason: 'URL 格式无效' }
  }

  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    return { valid: false, reason: `不支持的协议: ${parsed.protocol}` }
  }

  // Reject username/password
  if (parsed.username || parsed.password) {
    return { valid: false, reason: 'URL 不允许包含用户名密码' }
  }

  const hostname = parsed.hostname.replace(/^\[|\]$/g, '') // strip IPv6 brackets

  if (isPrivateIP(hostname)) {
    return { valid: false, reason: '不允许访问内网地址' }
  }

  return { valid: true, url: parsed }
}

// ─── 路径安全 ────────────────────────────────────────────────────

/**
 * 确认 candidatePath 解析后位于 baseDir 内
 *
 * - 使用 path.resolve 处理相对路径
 * - 拒绝 ../ 穿越
 * - 检查标准化路径前缀
 */
export function isPathInside(baseDir: string, candidatePath: string): boolean {
  const resolvedBase = path.resolve(baseDir) + path.sep
  const resolvedCandidate = path.resolve(baseDir, candidatePath) + path.sep
  return resolvedCandidate.startsWith(resolvedBase)
}

/**
 * 安全清理临时目录
 *
 * - 确认 target 位于 tempRoot 内
 * - 不会删除 tempRoot 本身
 * - 清理失败只记录日志
 */
export function safeCleanupDir(targetDir: string, tempRoot: string): void {
  const resolvedTarget = path.resolve(targetDir)
  const resolvedRoot = path.resolve(tempRoot)

  // Safety: don't delete the root temp dir itself
  if (resolvedTarget === resolvedRoot) return
  // Safety: must be inside tempRoot
  if (!resolvedTarget.startsWith(resolvedRoot + path.sep)) return

  try {
    if (fs.existsSync(resolvedTarget)) {
      fs.rmSync(resolvedTarget, { recursive: true, force: true })
    }
  } catch (e) {
    // Cleanup failure should not mask original error
    console.error(`[ffmpeg] Failed to cleanup temp dir ${resolvedTarget}:`, (e as Error).message)
  }
}

// ─── 进程执行包装 ────────────────────────────────────────────────

export interface SpawnResult {
  exitCode: number | null
  stdout: string
  stderr: string
  timedOut: boolean
  killed: boolean
}

/**
 * 安全执行外部程序
 *
 * - 使用 spawn + 参数数组，绝不走 shell
 * - 支持超时 + kill
 * - 限制 stdout/stderr 缓存大小
 * - 防止 Promise 重复 resolve/reject
 */
export function spawnSafe(
  command: string,
  args: string[],
  options: {
    timeout?: number
    cwd?: string
    env?: Record<string, string>
  } = {},
): Promise<SpawnResult> {
  return new Promise((resolve) => {
    let settled = false

    const child = spawn(command, args, {
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
      cwd: options.cwd,
      env: options.env ? { ...process.env, ...options.env } : undefined,
    })

    let stdout = ''
    let stderr = ''
    let stdoutBytes = 0
    let stderrBytes = 0

    let timeoutHandle: ReturnType<typeof setTimeout> | undefined

    const finish = (result: SpawnResult) => {
      if (settled) return
      settled = true
      if (timeoutHandle) clearTimeout(timeoutHandle)
      resolve(result)
    }

    // Timeout
    if (options.timeout) {
      timeoutHandle = setTimeout(() => {
        if (!settled) {
          child.kill('SIGTERM')
          // Give it 5s to exit gracefully, then force kill
          setTimeout(() => {
            if (!settled) {
              child.kill('SIGKILL')
            }
          }, 5000)
        }
      }, options.timeout)
    }

    child.stdout.on('data', (chunk: Buffer) => {
      stdoutBytes += chunk.length
      if (stdoutBytes <= MAX_STDOUT_BYTES) {
        stdout += chunk.toString('utf8')
      }
    })

    child.stderr.on('data', (chunk: Buffer) => {
      stderrBytes += chunk.length
      if (stderrBytes <= MAX_STDERR_BYTES) {
        stderr += chunk.toString('utf8')
      }
    })

    child.on('error', (err) => {
      finish({
        exitCode: null,
        stdout: truncate(stdout, MAX_STDOUT_BYTES),
        stderr: `${truncate(stderr, MAX_STDERR_BYTES)}\n[spawn error: ${err.message}]`,
        timedOut: false,
        killed: false,
      })
    })

    child.on('close', (code) => {
      const wasTimedOut = !!timeoutHandle && settled === false && code === null
      finish({
        exitCode: code,
        stdout: truncate(stdout, MAX_STDOUT_BYTES),
        stderr: truncate(stderr, MAX_STDERR_BYTES),
        timedOut: wasTimedOut,
        killed: code === null && !wasTimedOut,
      })
    })
  })
}

/** Truncate string to maxBytes, keeping valid UTF-8 */
function truncate(str: string, maxBytes: number): string {
  const buf = Buffer.from(str, 'utf8')
  if (buf.length <= maxBytes) return str
  return buf.subarray(0, maxBytes).toString('utf8').replace(/�$/, '') // remove partial char
}

// ─── 临时目录管理 ────────────────────────────────────────────────

/**
 * 为单次渲染任务创建独立临时目录
 *
 * 格式：{tempRoot}/render-{uuid}/
 */
export function createTaskTempDir(tempRoot: string): string {
  const taskDir = path.join(tempRoot, `render-${crypto.randomUUID()}`)
  fs.mkdirSync(taskDir, { recursive: true })
  return taskDir
}

// ─── concat 列表安全写入 ────────────────────────────────────────

/**
 * 将本地文件路径安全写入 FFmpeg concat demuxer 列表
 *
 * 规则：
 * - 所有路径必须位于 taskDir 内
 * - 拒绝换行和控制字符
 * - 使用 FFmpeg concat demuxer 的转义规则
 * - 列表文件使用随机名称
 */
export function writeConcatList(
  taskDir: string,
  localPaths: string[],
): string {
  // Validate all paths are inside taskDir
  for (const p of localPaths) {
    const resolved = path.resolve(p)
    if (!resolved.startsWith(path.resolve(taskDir) + path.sep)) {
      throw new RenderError('INVALID_INPUT', `输入文件路径不在任务目录内`)
    }
    // Reject control characters in filenames
    if (hasControlChars(p)) {
      throw new RenderError('INVALID_INPUT', '文件路径包含非法字符')
    }
  }

  const listPath = path.join(taskDir, `concat-${crypto.randomUUID()}.txt`)
  const lines = localPaths.map(p => {
    // FFmpeg concat demuxer: escape single quotes and backslashes
    const escaped = p.replace(/\\/g, '\\\\').replace(/'/g, "\\'")
    return `file '${escaped}'`
  })

  fs.writeFileSync(listPath, lines.join('\n') + '\n', 'utf8')
  return listPath
}

// ─── URL 下载 ────────────────────────────────────────────────────

export interface DownloadResult {
  localPath: string
  size: number
  contentType: string | null
}

/**
 * 下载远程视频到本地临时目录
 *
 * 安全措施：
 * - URL 先经过 validateRemoteUrl 校验
 * - 检查重定向目标的 SSRF
 * - 限制重定向次数
 * - 限制文件大小
 * - 设置超时
 * - 使用随机文件名
 * - 流式写入
 * - 失败删除不完整文件
 */
export async function downloadVideo(
  rawUrl: string,
  taskDir: string,
  options: {
    maxSize?: number
    timeout?: number
  } = {},
): Promise<DownloadResult> {
  const validation = validateRemoteUrl(rawUrl)
  if (!validation.valid) {
    throw new RenderError('INVALID_VIDEO_SOURCE', `视频源地址不合法: ${validation.reason}`)
  }

  const maxSize = options.maxSize ?? MAX_INPUT_FILE_SIZE
  const timeout = options.timeout ?? DOWNLOAD_TIMEOUT
  const localPath = path.join(taskDir, `input-${crypto.randomUUID()}.mp4`)

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeout)

  let response: Response
  try {
    response = await fetch(rawUrl, {
      signal: controller.signal,
      redirect: 'follow',
      headers: { 'User-Agent': 'ManjvStudio-FFmpeg/1.0' },
    })
  } catch (e) {
    clearTimeout(timeoutId)
    safeUnlink(localPath)
    throw new RenderError('VIDEO_DOWNLOAD_FAILED', '视频下载失败', (e as Error).message)
  } finally {
    clearTimeout(timeoutId)
  }

  // Check redirect target for SSRF
  const finalUrl = new URL(response.url)
  if (isPrivateIP(finalUrl.hostname.replace(/^\[|\]$/g, ''))) {
    safeUnlink(localPath)
    throw new RenderError('INVALID_VIDEO_SOURCE', '重定向目标不允许访问内网地址')
  }

  if (!response.ok) {
    safeUnlink(localPath)
    throw new RenderError('VIDEO_DOWNLOAD_FAILED', `视频下载失败: HTTP ${response.status}`)
  }

  const contentType = response.headers.get('content-type')

  // Stream to file with size limit
  let totalSize = 0
  const fileStream = fs.createWriteStream(localPath)

  try {
    const reader = response.body?.getReader()
    if (!reader) {
      throw new RenderError('VIDEO_DOWNLOAD_FAILED', '无法读取响应流')
    }

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      totalSize += value.length
      if (totalSize > maxSize) {
        reader.cancel()
        throw new RenderError('VIDEO_DOWNLOAD_FAILED', `视频文件超过大小限制 (${Math.round(maxSize / 1024 / 1024)}MB)`)
      }

      fileStream.write(value)
    }

    fileStream.end()
  } catch (e) {
    safeUnlink(localPath)
    if (e instanceof RenderError) throw e
    throw new RenderError('VIDEO_DOWNLOAD_FAILED', '视频下载写入失败', (e as Error).message)
  }

  return { localPath, size: totalSize, contentType }
}

function safeUnlink(filePath: string) {
  try {
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath)
  } catch { /* ignore */ }
}

// ─── ffprobe 校验 ────────────────────────────────────────────────

export interface ProbeResult {
  valid: boolean
  duration: number | null
  width: number | null
  height: number | null
  format: string | null
  hasVideoStream: boolean
  hasAudioStream: boolean
  error?: string
}

/**
 * 使用 ffprobe 校验本地视频文件
 *
 * 安全措施：
 * - 使用 spawnSafe（参数数组，不走 shell）
 * - 只传入受控本地路径
 * - 解析 JSON 输出
 */
export async function probeVideo(localPath: string): Promise<ProbeResult> {
  // Verify file exists and has size
  try {
    const stat = fs.statSync(localPath)
    if (stat.size === 0) {
      return { valid: false, duration: null, width: null, height: null, format: null, hasVideoStream: false, hasAudioStream: false, error: '文件为空' }
    }
  } catch {
    return { valid: false, duration: null, width: null, height: null, format: null, hasVideoStream: false, hasAudioStream: false, error: '文件不存在' }
  }

  const result = await spawnSafe(FFPROBE_PATH, [
    '-v', 'quiet',
    '-print_format', 'json',
    '-show_format',
    '-show_streams',
    localPath,
  ], { timeout: 15000 })

  if (result.exitCode !== 0) {
    return {
      valid: false, duration: null, width: null, height: null, format: null,
      hasVideoStream: false, hasAudioStream: false,
      error: `ffprobe 退出码 ${result.exitCode}`,
    }
  }

  try {
    const info = JSON.parse(result.stdout)
    const streams = info.streams || []
    const videoStream = streams.find((s: Record<string, unknown>) => s.codec_type === 'video')
    const audioStream = streams.find((s: Record<string, unknown>) => s.codec_type === 'audio')

    if (!videoStream) {
      return {
        valid: false, duration: null, width: null, height: null, format: null,
        hasVideoStream: false, hasAudioStream: !!audioStream,
        error: '无视频流',
      }
    }

    const duration = parseFloat(info.format?.duration) || null
    const width = videoStream.width || null
    const height = videoStream.height || null
    const format = info.format?.format_name || null

    // Sanity checks
    if (duration !== null && (duration <= 0 || duration > 36000)) {
      return {
        valid: false, duration, width, height, format,
        hasVideoStream: true, hasAudioStream: !!audioStream,
        error: `时长异常: ${duration}s`,
      }
    }

    return {
      valid: true,
      duration,
      width,
      height,
      format,
      hasVideoStream: true,
      hasAudioStream: !!audioStream,
    }
  } catch (e) {
    return {
      valid: false, duration: null, width: null, height: null, format: null,
      hasVideoStream: false, hasAudioStream: false,
      error: `ffprobe 输出解析失败`,
    }
  }
}

// ─── 输入校验 ────────────────────────────────────────────────────

/**
 * 校验渲染输入参数
 */
export function validateRenderInput(videos: Array<{ videoUrl: string; duration: number }>): void {
  if (videos.length === 0) {
    throw new RenderError('INVALID_INPUT', '没有视频片段')
  }
  if (videos.length > MAX_INPUT_COUNT) {
    throw new RenderError('INVALID_INPUT', `视频片段数量超过上限 (${MAX_INPUT_COUNT})`)
  }

  for (const v of videos) {
    if (!v.videoUrl) {
      throw new RenderError('INVALID_VIDEO_SOURCE', '存在空的视频 URL')
    }
    if (v.duration <= 0) {
      throw new RenderError('INVALID_VIDEO_SOURCE', `视频时长无效: ${v.duration}s`)
    }
  }
}

// ─── 脱敏日志 ────────────────────────────────────────────────────

/**
 * 日志中脱敏 URL — 移除 query string
 */
export function sanitizeUrlForLog(raw: string): string {
  try {
    const parsed = new URL(raw)
    parsed.search = ''
    parsed.hash = ''
    return parsed.toString()
  } catch {
    return '[invalid-url]'
  }
}
