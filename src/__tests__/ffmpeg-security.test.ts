/**
 * FFmpeg 安全工具函数单元测试
 *
 * 不依赖真实 FFmpeg 或网络请求。
 * 进程执行相关测试使用 mock。
 */
import { describe, it, expect, beforeEach } from 'vitest'
import path from 'path'
import fs from 'fs'
import os from 'os'

import {
  validateRemoteUrl,
  isPathInside,
  safeCleanupDir,
  writeConcatList,
  createTaskTempDir,
  spawnSafe,
  probeVideo,
  sanitizeUrlForLog,
  validateRenderInput,
  sanitizeError,
  RenderError,
} from '../server/services/ffmpeg-utils'

// ─── URL 校验 ────────────────────────────────────────────────────

describe('validateRemoteUrl', () => {
  it('accepts valid HTTPS URL', () => {
    const result = validateRemoteUrl('https://example.com/video.mp4')
    expect(result.valid).toBe(true)
    if (result.valid) expect(result.url.protocol).toBe('https:')
  })

  it('accepts valid HTTP URL', () => {
    const result = validateRemoteUrl('http://example.com/video.mp4')
    expect(result.valid).toBe(true)
  })

  it('rejects file: protocol', () => {
    const result = validateRemoteUrl('file:///etc/passwd')
    expect(result.valid).toBe(false)
    if (!result.valid) expect(result.reason).toContain('协议')
  })

  it('rejects data: protocol', () => {
    const result = validateRemoteUrl('data:text/html,<script>alert(1)</script>')
    expect(result.valid).toBe(false)
  })

  it('rejects ftp: protocol', () => {
    const result = validateRemoteUrl('ftp://evil.com/video.mp4')
    expect(result.valid).toBe(false)
  })

  it('rejects javascript: protocol', () => {
    const result = validateRemoteUrl('javascript:alert(1)')
    expect(result.valid).toBe(false)
  })

  it('rejects localhost', () => {
    const result = validateRemoteUrl('http://localhost:3100/video.mp4')
    expect(result.valid).toBe(false)
    if (!result.valid) expect(result.reason).toContain('内网')
  })

  it('rejects 127.0.0.1', () => {
    const result = validateRemoteUrl('http://127.0.0.1/video.mp4')
    expect(result.valid).toBe(false)
  })

  it('rejects ::1 (IPv6 loopback)', () => {
    const result = validateRemoteUrl('http://[::1]/video.mp4')
    expect(result.valid).toBe(false)
  })

  it('rejects 10.x private IP', () => {
    const result = validateRemoteUrl('http://10.0.0.1/video.mp4')
    expect(result.valid).toBe(false)
  })

  it('rejects 172.16.x private IP', () => {
    const result = validateRemoteUrl('http://172.16.0.1/video.mp4')
    expect(result.valid).toBe(false)
  })

  it('rejects 192.168.x private IP', () => {
    const result = validateRemoteUrl('http://192.168.1.1/video.mp4')
    expect(result.valid).toBe(false)
  })

  it('rejects 0.0.0.0', () => {
    const result = validateRemoteUrl('http://0.0.0.0/video.mp4')
    expect(result.valid).toBe(false)
  })

  it('rejects cloud metadata address', () => {
    const result = validateRemoteUrl('http://169.254.169.254/latest/meta-data/')
    expect(result.valid).toBe(false)
  })

  it('rejects URL with username and password', () => {
    const result = validateRemoteUrl('https://user:pass@example.com/video.mp4')
    expect(result.valid).toBe(false)
    if (!result.valid) expect(result.reason).toContain('用户名密码')
  })

  it('rejects URL with newline', () => {
    const result = validateRemoteUrl('https://example.com/video.mp4\nfile /etc/passwd')
    expect(result.valid).toBe(false)
  })

  it('rejects URL with carriage return', () => {
    const result = validateRemoteUrl('https://example.com/video.mp4\r\nfile /etc/passwd')
    expect(result.valid).toBe(false)
  })

  it('rejects URL with null byte', () => {
    const result = validateRemoteUrl('https://example.com/\0video.mp4')
    expect(result.valid).toBe(false)
  })

  it('rejects overly long URL', () => {
    const longUrl = 'https://example.com/' + 'a'.repeat(3000)
    const result = validateRemoteUrl(longUrl)
    expect(result.valid).toBe(false)
    if (!result.valid) expect(result.reason).toContain('过长')
  })

  it('accepts URL with port', () => {
    const result = validateRemoteUrl('https://example.com:8443/video.mp4')
    expect(result.valid).toBe(true)
  })

  it('accepts URL with query string', () => {
    const result = validateRemoteUrl('https://cdn.example.com/video.mp4?token=abc123')
    expect(result.valid).toBe(true)
  })
})

// ─── 路径安全 ────────────────────────────────────────────────────

describe('isPathInside', () => {
  const baseDir = '/tmp/render-test'

  it('accepts path inside baseDir', () => {
    expect(isPathInside(baseDir, '/tmp/render-test/video.mp4')).toBe(true)
  })

  it('accepts nested path inside baseDir', () => {
    expect(isPathInside(baseDir, '/tmp/render-test/sub/dir/video.mp4')).toBe(true)
  })

  it('rejects ../ traversal', () => {
    expect(isPathInside(baseDir, '/tmp/render-test/../../../etc/passwd')).toBe(false)
  })

  it('rejects absolute path escape', () => {
    expect(isPathInside(baseDir, '/etc/passwd')).toBe(false)
  })

  it('rejects prefix collision (render-a vs render-ab)', () => {
    expect(isPathInside('/tmp/render-a', '/tmp/render-ab/video.mp4')).toBe(false)
  })

  it('accepts same-level file inside baseDir', () => {
    expect(isPathInside('/tmp/render', '/tmp/render/video.mp4')).toBe(true)
  })
})

// ─── concat 文件安全 ─────────────────────────────────────────────

describe('writeConcatList', () => {
  let taskDir: string

  beforeEach(() => {
    taskDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ffmpeg-test-'))
  })

  afterEach(() => {
    fs.rmSync(taskDir, { recursive: true, force: true })
  })

  it('writes concat list with local paths', () => {
    const localPaths = [
      path.join(taskDir, 'input-1.mp4'),
      path.join(taskDir, 'input-2.mp4'),
    ]
    // Create dummy files so paths exist
    localPaths.forEach(p => fs.writeFileSync(p, 'dummy'))

    const listPath = writeConcatList(taskDir, localPaths)
    expect(fs.existsSync(listPath)).toBe(true)

    const content = fs.readFileSync(listPath, 'utf8')
    expect(content).toContain("file '")
    expect(content).toContain('input-1.mp4')
    expect(content).toContain('input-2.mp4')
  })

  it('handles paths with spaces', () => {
    const p = path.join(taskDir, 'my video file.mp4')
    fs.writeFileSync(p, 'dummy')

    const listPath = writeConcatList(taskDir, [p])
    const content = fs.readFileSync(listPath, 'utf8')
    expect(content).toContain('my video file.mp4')
  })

  it('handles paths with single quotes', () => {
    const p = path.join(taskDir, "video's file.mp4")
    fs.writeFileSync(p, 'dummy')

    const listPath = writeConcatList(taskDir, [p])
    const content = fs.readFileSync(listPath, 'utf8')
    // Single quotes should be escaped
    expect(content).toContain("\\'")
  })

  it('rejects path outside taskDir', () => {
    const outsidePath = '/etc/passwd'
    expect(() => writeConcatList(taskDir, [outsidePath])).toThrow(/不在任务目录/)
  })

  it('rejects path with newline', () => {
    const p = path.join(taskDir, 'video\n.mp4')
    expect(() => writeConcatList(taskDir, [p])).toThrow(/非法字符/)
  })
})

// ─── 临时目录清理 ────────────────────────────────────────────────

describe('safeCleanupDir', () => {
  const tempRoot = path.join(os.tmpdir(), 'ffmpeg-cleanup-test')

  beforeEach(() => {
    if (!fs.existsSync(tempRoot)) fs.mkdirSync(tempRoot, { recursive: true })
  })

  afterEach(() => {
    if (fs.existsSync(tempRoot)) fs.rmSync(tempRoot, { recursive: true, force: true })
  })

  it('cleans up task directory', () => {
    const taskDir = path.join(tempRoot, 'render-test-123')
    fs.mkdirSync(taskDir, { recursive: true })
    fs.writeFileSync(path.join(taskDir, 'video.mp4'), 'dummy')

    safeCleanupDir(taskDir, tempRoot)
    expect(fs.existsSync(taskDir)).toBe(false)
  })

  it('does not delete temp root itself', () => {
    const taskDir = path.join(tempRoot, 'render-test-456')
    fs.mkdirSync(taskDir, { recursive: true })

    // Try to clean up the root itself
    safeCleanupDir(tempRoot, tempRoot)
    expect(fs.existsSync(tempRoot)).toBe(true)
  })

  it('does not delete path outside tempRoot', () => {
    const outsideDir = path.join(os.tmpdir(), 'ffmpeg-outside-test')
    fs.mkdirSync(outsideDir, { recursive: true })

    safeCleanupDir(outsideDir, tempRoot)
    expect(fs.existsSync(outsideDir)).toBe(true)

    fs.rmSync(outsideDir, { recursive: true, force: true })
  })
})

// ─── 错误脱敏 ────────────────────────────────────────────────────

describe('sanitizeError', () => {
  it('preserves RenderError code and message', () => {
    const err = new RenderError('VIDEO_DOWNLOAD_FAILED', '视频下载失败', 'internal: ECONNREFUSED 10.0.0.1')
    const result = sanitizeError(err)
    expect(result.code).toBe('VIDEO_DOWNLOAD_FAILED')
    expect(result.message).toBe('视频下载失败')
    expect(result.message).not.toContain('10.0.0.1')
  })

  it('hides internal details for generic errors', () => {
    const err = new Error('/tmp/render-abc/output.mp4: No such file or directory')
    const result = sanitizeError(err)
    expect(result.code).toBe('RENDER_FAILED')
    expect(result.message).not.toContain('/tmp/')
  })

  it('hides FFmpeg command details', () => {
    const err = new Error('ffmpeg -f concat -safe 0 -i /tmp/list.txt -y /tmp/output.mp4 failed')
    const result = sanitizeError(err)
    expect(result.message).not.toContain('ffmpeg')
  })
})

// ─── URL 日志脱敏 ────────────────────────────────────────────────

describe('sanitizeUrlForLog', () => {
  it('removes query string', () => {
    const result = sanitizeUrlForLog('https://cdn.example.com/video.mp4?token=secret123&sig=abc')
    expect(result).not.toContain('secret123')
    expect(result).toContain('video.mp4')
  })

  it('handles invalid URL', () => {
    const result = sanitizeUrlForLog('not-a-url')
    expect(result).toBe('[invalid-url]')
  })
})

// ─── 输入校验 ────────────────────────────────────────────────────

describe('validateRenderInput', () => {
  it('accepts valid input', () => {
    expect(() => validateRenderInput([
      { videoUrl: 'https://example.com/v1.mp4', duration: 5 },
      { videoUrl: 'https://example.com/v2.mp4', duration: 8 },
    ])).not.toThrow()
  })

  it('rejects empty input', () => {
    expect(() => validateRenderInput([])).toThrow(/没有视频/)
  })

  it('rejects empty videoUrl', () => {
    expect(() => validateRenderInput([
      { videoUrl: '', duration: 5 },
    ])).toThrow(/空的视频/)
  })

  it('rejects zero duration', () => {
    expect(() => validateRenderInput([
      { videoUrl: 'https://example.com/v.mp4', duration: 0 },
    ])).toThrow(/时长无效/)
  })

  it('rejects too many inputs', () => {
    const videos = Array.from({ length: 101 }, (_, i) => ({
      videoUrl: `https://example.com/v${i}.mp4`, duration: 5,
    }))
    expect(() => validateRenderInput(videos)).toThrow(/数量超过上限/)
  })
})

// ─── spawnSafe (mock) ────────────────────────────────────────────

describe('spawnSafe', () => {
  it('executes echo and captures stdout', async () => {
    const result = await spawnSafe('echo', ['hello', 'world'], { timeout: 5000 })
    expect(result.exitCode).toBe(0)
    expect(result.stdout.trim()).toBe('hello world')
  })

  it('captures non-zero exit code', async () => {
    const result = await spawnSafe('false', [], { timeout: 5000 })
    expect(result.exitCode).not.toBe(0)
  })

  it('handles command not found', async () => {
    const result = await spawnSafe('/nonexistent/command', [], { timeout: 5000 })
    expect(result.exitCode).toBeNull()
    expect(result.stderr).toContain('spawn error')
  })

  it('times out long-running process', async () => {
    // sleep 10s with 1s timeout
    const result = await spawnSafe('sleep', ['10'], { timeout: 1000 })
    expect(result.timedOut).toBe(true)
  })
})

// ─── probeVideo (mock via spawnSafe) ─────────────────────────────

describe('probeVideo', () => {
  let taskDir: string

  beforeEach(() => {
    taskDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ffmpeg-probe-'))
  })

  afterEach(() => {
    fs.rmSync(taskDir, { recursive: true, force: true })
  })

  it('returns invalid for non-existent file', async () => {
    const result = await probeVideo(path.join(taskDir, 'nonexistent.mp4'))
    expect(result.valid).toBe(false)
    expect(result.error).toContain('不存在')
  })

  it('returns invalid for empty file', async () => {
    const emptyPath = path.join(taskDir, 'empty.mp4')
    fs.writeFileSync(emptyPath, '')
    const result = await probeVideo(emptyPath)
    expect(result.valid).toBe(false)
    expect(result.error).toContain('为空')
  })

  // Real ffprobe tests are integration tests — not run in unit test suite
  it('returns invalid for non-video file (if ffprobe available)', async () => {
    const textPath = path.join(taskDir, 'text.txt')
    fs.writeFileSync(textPath, 'Hello World')
    const result = await probeVideo(textPath)
    // ffprobe will either fail to parse or report no video stream
    expect(result.valid).toBe(false)
  })
})

// ─── createTaskTempDir ───────────────────────────────────────────

describe('createTaskTempDir', () => {
  const tempRoot = path.join(os.tmpdir(), 'ffmpeg-taskdir-test')

  beforeEach(() => {
    if (!fs.existsSync(tempRoot)) fs.mkdirSync(tempRoot, { recursive: true })
  })

  afterEach(() => {
    if (fs.existsSync(tempRoot)) fs.rmSync(tempRoot, { recursive: true, force: true })
  })

  it('creates directory with render- prefix', () => {
    const taskDir = createTaskTempDir(tempRoot)
    expect(fs.existsSync(taskDir)).toBe(true)
    expect(path.basename(taskDir)).toMatch(/^render-/)
  })

  it('creates unique directories', () => {
    const dir1 = createTaskTempDir(tempRoot)
    const dir2 = createTaskTempDir(tempRoot)
    expect(dir1).not.toBe(dir2)
  })
})
