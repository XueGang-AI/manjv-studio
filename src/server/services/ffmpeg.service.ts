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
  type ProbeResult,
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
   * 拼接视频片段 → 单个 MP4（安全加固版 — 两阶段法）
   *
   * 流程：
   * 1. 校验输入参数
   * 2. 创建任务临时目录
   * 3. 远程 URL → 下载到临时目录
   * 4. ffprobe 预校验每个输入
   * 5. 逐个标准化输入到统一中间格式（解决异构分辨率/音频/帧率）
   * 6. 生成 concat 列表（只有标准化后的本地受控路径）
   * 7. FFmpeg concat 合成
   * 8. 清理临时目录
   *
   * 为什么需要两阶段：
   * - concat demuxer 在 demux 层拼接流，要求所有输入编码参数一致
   * - 非标准分辨率（如 496×864）与标准分辨率（1280×768）混搭时，
   *   demuxer 在切换文件时解码器无法处理格式跳变，导致 exit=254
   * - 标准化阶段统一分辨率、音频格式、帧率、像素格式，
   *   确保 concat demuxer 可以正确工作
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
      const safeW = Math.max(1, Math.round(w))
      const safeH = Math.max(1, Math.round(h))
      const safeFps = Math.max(1, Math.min(120, fps))

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
      const probeResults: ProbeResult[] = []
      for (let i = 0; i < localPaths.length; i++) {
        const probe = await probeVideo(localPaths[i])
        if (!probe.valid) {
          throw new RenderError('VIDEO_VALIDATION_FAILED', `视频片段 #${i + 1} 校验失败: ${probe.error || '格式无效'}`)
        }
        console.log(`[ffmpeg] Input #${i + 1}: ${probe.duration?.toFixed(1)}s, ${probe.width}x${probe.height}, format=${probe.format}`)
        probeResults.push(probe)
      }

      // 5. Normalize each input to a uniform intermediate format
      //
      // 所有输入统一为：目标分辨率（letterbox padding）、H.264、AAC、44100Hz 立体声、
      // 固定帧率、yuv420p。无音频的输入会添加静音音轨，确保 concat demuxer 兼容。
      // 这是解决非标准分辨率（如 496x864）和异构输入格式导致 concat 失败的关键步骤。
      const normalizedPaths: string[] = []
      for (let i = 0; i < localPaths.length; i++) {
        const probe = probeResults[i]
        const normalizedPath = path.join(taskDir, `norm-${i}.mp4`)

        console.log(
          `[ffmpeg] Normalizing input #${i + 1}: ${probe.width}x${probe.height} → ${safeW}x${safeH}` +
          `${probe.hasAudioStream ? '' : ' (adding silent audio)'}`
        )

        await this.normalizeInput(
          localPaths[i],
          normalizedPath,
          safeW, safeH, safeFps,
          probe.hasAudioStream,
        )

        normalizedPaths.push(normalizedPath)
      }

      // 6. Write concat list with normalized file paths
      const listPath = writeConcatList(taskDir, normalizedPaths)

      // 7. FFmpeg concat — inputs are already normalized, try -c copy first (fast, no quality loss)
      //
      // -fflags +genpts+igndts：重新生成时间戳 + 忽略 DTS 异常，解决 fps filter 残留的时间戳跳变
      // -bsf:v h264_mp4toannexb：将 H.264 转为 Annex B 字节流格式（内联 SPS/PPS），
      //   解决独立编码片段间 SPS/PPS 不一致导致 concat demuxer exit=254 的问题
      let result = await spawnSafe(FFMPEG_PATH, [
        '-fflags', '+genpts+igndts',
        '-f', 'concat',
        '-safe', '0',
        '-i', listPath,
        '-c', 'copy',
        '-bsf:v', 'h264_mp4toannexb',
        '-movflags', '+faststart',
        '-y',
        outputPath,
      ], { timeout: 300_000 })

      // Fallback: if -c copy fails, re-encode using concat filter (NOT concat demuxer).
      //
      // concat demuxer 工作在容器/demux 层，独立编码片段间微小的码流参数差异
      // （H.264 profile/level、GOP 结构、extradata）仍可能导致 demux 失败。
      // concat filter 工作在解码后的帧层面，完全不依赖编码参数兼容性，是最可靠的兜底方案。
      if (result.exitCode !== 0 && !result.timedOut) {
        console.log(`[ffmpeg] concat -c copy failed (exit=${result.exitCode}), falling back to concat filter re-encode`)

        // Build concat filter: [0:v][0:a][1:v][1:a]...concat=n=N:v=1:a=1[outv][outa]
        const filterParts = normalizedPaths.map((_, i) => `[${i}:v][${i}:a]`).join('')
        const n = normalizedPaths.length
        const filterComplex = `${filterParts}concat=n=${n}:v=1:a=1[outv][outa]`

        const concatFilterArgs: string[] = []
        for (const np of normalizedPaths) {
          concatFilterArgs.push('-i', np)
        }
        concatFilterArgs.push(
          '-filter_complex', filterComplex,
          '-map', '[outv]',
          '-map', '[outa]',
          '-c:v', 'libx264',
          '-preset', 'fast',
          '-crf', '23',
          '-c:a', 'aac',
          '-b:a', '128k',
          '-movflags', '+faststart',
          '-y',
          outputPath,
        )

        result = await spawnSafe(FFMPEG_PATH, concatFilterArgs, { timeout: 300_000 })
      }

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
   * 标准化单个输入视频到统一中间格式
   *
   * 解决问题：
   * - 非标准分辨率（如 496x864）→ letterbox padding 到目标分辨率
   * - 异构音频格式（mono/stereo, 不同采样率）→ 统一 AAC 44100Hz 立体声
   * - 无音频输入 → 添加静音音轨
   * - 可变帧率 → 固定帧率
   * - 不同像素格式 → yuv420p
   *
   * 不改变画面内容，不裁切人物，使用 letterbox padding 居中填充。
   */
  private async normalizeInput(
    inputPath: string,
    outputPath: string,
    targetWidth: number,
    targetHeight: number,
    fps: number,
    hasAudio: boolean,
  ): Promise<void> {
    const args: string[] = []

    if (hasAudio) {
      args.push('-i', inputPath)
    } else {
      // 无音频输入：添加静音音轨，确保后续 concat 兼容
      args.push('-i', inputPath, '-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=stereo')
    }

    // 视频滤镜：缩放 + letterbox padding + 统一 SAR + 固定帧率 + 像素格式
    args.push(
      '-vf', `scale=${targetWidth}:${targetHeight}:force_original_aspect_ratio=decrease,pad=${targetWidth}:${targetHeight}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=${fps},format=yuv420p`,
    )

    // 视频编码 — CRF 18 保证中间文件高质量
    args.push('-c:v', 'libx264', '-preset', 'fast', '-crf', '18')

    // 音频编码 — 统一格式
    args.push('-c:a', 'aac', '-b:a', '128k', '-ar', '44100', '-ac', '2')

    // 强制恒定帧率输出，避免 fps filter 产生时间戳不规则
    // 导致后续 concat demuxer 无法处理
    args.push('-vsync', 'cfr')

    if (!hasAudio) {
      args.push('-shortest')
    }

    args.push('-y', outputPath)

    const result = await spawnSafe(FFMPEG_PATH, args, { timeout: 120_000 })

    if (result.exitCode !== 0) {
      const stderrPreview = result.stderr.substring(0, 300)
      throw new RenderError(
        'VIDEO_VALIDATION_FAILED',
        '视频片段标准化失败，请检查视频片段格式后重试',
        `exit=${result.exitCode}, stderr=${stderrPreview}`,
      )
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
