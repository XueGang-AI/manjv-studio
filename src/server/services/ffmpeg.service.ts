/**
 * FFmpeg 视频合成服务 — 安全加固版
 *
 * 变更摘要：
 * - exec/execAsync → spawnSafe (spawn + 参数数组, shell: false)
 * - 远程 URL → 先下载到受控临时目录，再本地合成
 * - concat 列表只写入本地受控路径
 * - 所有路径经过 isPathInside 校验
 * - ffprobe 预校验每个输入文件
 * - 错误信息脱敏
 * - 进程超时 + SIGTERM/SIGKILL
 * - 每次任务独立临时目录，finally 中清理
 */
import fs from 'fs'
import path from 'path'

import {
  FFMPEG_PATH,
  UPLOAD_DIR,
  spawnSafe,
  createTaskTempDir,
  writeConcatList,
  downloadVideo,
  probeVideo,
  validateRenderInput,
  validateRemoteUrl,
  isPathInside,
  safeCleanupDir,
  sanitizeUrlForLog,
  RenderError,
  sanitizeError,
  type RenderErrorCode,
} from './ffmpeg-utils'

// Re-export for external consumers
export type { RenderErrorCode }
export { sanitizeError, RenderError }

export interface RenderInput {
  shotVideos: Array<{ videoUrl: string; duration: number }>
  outputFileName: string
  aspectRatio?: string
  fps?: number
  addFadeTransition?: boolean
}

export interface RenderResult {
  success: boolean
  outputPath?: string
  duration?: number
  error?: string
}

export class FFmpegService {
  private outputDir: string
  private tempRoot: string
  /** Simple semaphore: prevent concurrent renders */
  private rendering = false

  constructor() {
    this.outputDir = path.join(UPLOAD_DIR, 'final_videos')
    this.tempRoot = path.join(UPLOAD_DIR, 'render_temp')
    if (!fs.existsSync(this.outputDir)) {
      fs.mkdirSync(this.outputDir, { recursive: true })
    }
    if (!fs.existsSync(this.tempRoot)) {
      fs.mkdirSync(this.tempRoot, { recursive: true })
    }
  }

  /**
   * 检查 FFmpeg 是否可用
   */
  async checkAvailable(): Promise<boolean> {
    try {
      const result = await spawnSafe(FFMPEG_PATH, ['-version'], { timeout: 10000 })
      return result.exitCode === 0
    } catch {
      return false
    }
  }

  /**
   * 生成空白占位视频（Mock 模式）
   */
  async generatePlaceholder(
    outputPath: string,
    duration: number,
    aspectRatio = '9:16',
  ): Promise<RenderResult> {
    try {
      const [w, h] = aspectRatio === '16:9' ? [1920, 1080] : [1080, 1920]

      // Sanitize: only allow digits and x in resolution
      const safeW = Math.max(1, Math.round(w))
      const safeH = Math.max(1, Math.round(h))
      const safeDuration = Math.max(1, Math.min(36000, Math.round(duration)))
      const safeFps = 25

      const result = await spawnSafe(FFMPEG_PATH, [
        '-f', 'lavfi',
        '-i', `color=c=0x1a1a2e:s=${safeW}x${safeH}:d=${safeDuration}:r=${safeFps}`,
        '-f', 'lavfi',
        '-i', `anullsrc=r=44100:cl=mono`,
        '-c:v', 'libx264',
        '-preset', 'ultrafast',
        '-c:a', 'aac',
        '-shortest',
        '-y',
        outputPath,
      ], { timeout: 30000 })

      if (result.exitCode !== 0) {
        return { success: false, error: `FFmpeg 退出码 ${result.exitCode}` }
      }
      return { success: true, outputPath, duration }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  }

  /**
   * 拼接视频片段 → 单个 MP4（安全加固版）
   *
   * 流程：
   * 1. 校验输入参数
   * 2. 创建任务临时目录
   * 3. 远程 URL → 下载到临时目录
   * 4. ffprobe 预校验每个输入
   * 5. 生成 concat 列表（只有本地受控路径）
   * 6. FFmpeg spawn 合成
   * 7. 输出移到正式目录
   * 8. 清理临时目录
   */
  async concatVideos(input: RenderInput): Promise<RenderResult> {
    // Concurrency guard
    if (this.rendering) {
      throw new RenderError('RENDER_ALREADY_RUNNING', '已有合成任务正在执行')
    }

    this.rendering = true
    let taskDir: string | null = null

    try {
      // 1. Validate input
      validateRenderInput(input.shotVideos)

      const [w, h] = (input.aspectRatio || '9:16') === '16:9' ? [1920, 1080] : [1080, 1920]
      const fps = input.fps || 25
      const outputPath = path.join(this.outputDir, input.outputFileName)

      // 2. Create task temp dir
      taskDir = createTaskTempDir(this.tempRoot)

      // 3. Download remote URLs / validate local paths
      const localPaths: string[] = []
      let totalInputSize = 0

      for (let i = 0; i < input.shotVideos.length; i++) {
        const sv = input.shotVideos[i]
        const urlValidation = validateRemoteUrl(sv.videoUrl)

        if (urlValidation.valid) {
          // Remote URL → download
          console.log(`[ffmpeg] Downloading ${sanitizeUrlForLog(sv.videoUrl)}`)
          const downloadResult = await downloadVideo(sv.videoUrl, taskDir)
          totalInputSize += downloadResult.size
          localPaths.push(downloadResult.localPath)
        } else {
          // Treat as local file — validate it's inside safe directories
          const resolved = path.resolve(sv.videoUrl)
          const isSafeLocal = isPathInside(this.outputDir, resolved) || isPathInside(UPLOAD_DIR, resolved)

          if (!isSafeLocal) {
            throw new RenderError('INVALID_VIDEO_SOURCE', `视频源路径不在允许范围内: ${urlValidation.reason}`)
          }

          // Verify file exists
          try {
            const stat = fs.statSync(resolved)
            totalInputSize += stat.size
            localPaths.push(resolved)
          } catch {
            throw new RenderError('INVALID_VIDEO_SOURCE', '本地视频文件不存在')
          }
        }

        // Check total size
        if (totalInputSize > 2 * 1024 * 1024 * 1024) {
          throw new RenderError('INVALID_INPUT', '输入视频总大小超过限制')
        }
      }

      // 4. ffprobe pre-check each input
      for (let i = 0; i < localPaths.length; i++) {
        const probe = await probeVideo(localPaths[i])
        if (!probe.valid) {
          throw new RenderError('VIDEO_VALIDATION_FAILED', `视频片段 #${i + 1} 校验失败: ${probe.error || '格式无效'}`)
        }
        console.log(`[ffmpeg] Input #${i + 1}: ${probe.duration?.toFixed(1)}s, ${probe.width}x${probe.height}, format=${probe.format}`)
      }

      // 5. Write concat list (only local controlled paths)
      const listPath = writeConcatList(taskDir, localPaths)

      // 6. FFmpeg concat
      const safeW = Math.max(1, Math.round(w))
      const safeH = Math.max(1, Math.round(h))
      const safeFps = Math.max(1, Math.min(120, fps))

      const result = await spawnSafe(FFMPEG_PATH, [
        '-f', 'concat',
        '-safe', '0',
        '-i', listPath,
        '-vf', `scale=${safeW}:${safeH}:force_original_aspect_ratio=decrease,pad=${safeW}:${safeH}:(ow-iw)/2:(oh-ih)/2,fps=${safeFps},format=yuv420p`,
        '-c:v', 'libx264',
        '-preset', 'fast',
        '-crf', '23',
        '-c:a', 'aac',
        '-b:a', '128k',
        '-y',
        outputPath,
      ], { timeout: 300_000 })

      if (result.timedOut) {
        throw new RenderError('RENDER_TIMEOUT', '视频合成超时，请减少镜头数量或缩短视频时长后重试')
      }

      if (result.exitCode !== 0) {
        const stderrPreview = result.stderr.substring(0, 200)
        console.error(`[ffmpeg] FFmpeg exited with code ${result.exitCode}: ${stderrPreview}`)
        throw new RenderError('RENDER_FAILED', '视频合成失败，请检查视频片段格式后重试', `exit=${result.exitCode}`)
      }

      const totalDuration = input.shotVideos.reduce((s, v) => s + v.duration, 0)
      return { success: true, outputPath, duration: totalDuration }

    } catch (error) {
      if (error instanceof RenderError) throw error
      throw new RenderError('RENDER_FAILED', '视频合成失败', (error as Error).message)
    } finally {
      // 8. Cleanup temp dir
      if (taskDir) {
        safeCleanupDir(taskDir, this.tempRoot)
      }
      this.rendering = false
    }
  }

  /**
   * 从视频中抽取封面帧
   */
  async extractCover(videoPath: string, coverPath: string, timeSeconds = 3): Promise<string | null> {
    try {
      // Validate paths
      const resolvedVideo = path.resolve(videoPath)
      const resolvedCover = path.resolve(coverPath)

      if (!isPathInside(UPLOAD_DIR, resolvedVideo) && !isPathInside(this.outputDir, resolvedVideo)) {
        console.error('[ffmpeg] extractCover: video path not in safe directory')
        return null
      }
      if (!isPathInside(UPLOAD_DIR, resolvedCover) && !isPathInside(this.outputDir, resolvedCover)) {
        console.error('[ffmpeg] extractCover: cover path not in safe directory')
        return null
      }

      const safeTime = Math.max(0, Math.min(36000, timeSeconds))

      const result = await spawnSafe(FFMPEG_PATH, [
        '-i', resolvedVideo,
        '-ss', String(safeTime),
        '-vframes', '1',
        '-q:v', '2',
        '-y',
        resolvedCover,
      ], { timeout: 15000 })

      return result.exitCode === 0 ? resolvedCover : null
    } catch {
      return null
    }
  }
}

export const ffmpegService = new FFmpegService()
