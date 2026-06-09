// ============================================
// FFmpeg 视频合成服务
// ============================================
import { exec } from 'child_process'
import { promisify } from 'util'
import fs from 'fs'
import path from 'path'

const execAsync = promisify(exec)
const FFMPEG_PATH = process.env.FFMPEG_PATH || 'ffmpeg'
const UPLOAD_DIR = process.env.UPLOAD_DIR || './uploads'

export interface RenderInput {
  shotVideos: Array<{ videoUrl: string; duration: number }>
  outputFileName: string
  aspectRatio?: string // '9:16', '16:9'
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

  constructor() {
    this.outputDir = path.join(UPLOAD_DIR, 'final_videos')
    if (!fs.existsSync(this.outputDir)) {
      fs.mkdirSync(this.outputDir, { recursive: true })
    }
  }

  /**
   * 检查 FFmpeg 是否可用
   */
  async checkAvailable(): Promise<boolean> {
    try {
      await execAsync(`${FFMPEG_PATH} -version`)
      return true
    } catch {
      return false
    }
  }

  /**
   * 生成空白测试视频（用于 Mock 占位）
   */
  async generatePlaceholder(
    outputPath: string,
    duration: number,
    aspectRatio = '9:16',
  ): Promise<RenderResult> {
    try {
      // 9:16 → 1080x1920, 16:9 → 1920x1080
      const [w, h] = aspectRatio === '16:9' ? [1920, 1080] : [1080, 1920]
      const cmd = `${FFMPEG_PATH} -f lavfi -i color=c=0x1a1a2e:s=${w}x${h}:d=${duration}:r=25 ` +
        `-f lavfi -i anullsrc=r=44100:cl=mono ` +
        `-c:v libx264 -preset ultrafast -c:a aac -shortest -y "${outputPath}"`

      await execAsync(cmd, { timeout: 30000 })
      return { success: true, outputPath, duration }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  }

  /**
   * 拼接视频片段 → 单个 MP4
   */
  async concatVideos(input: RenderInput): Promise<RenderResult> {
    const outputPath = path.join(this.outputDir, input.outputFileName)
    const [w, h] = (input.aspectRatio || '9:16') === '16:9' ? [1920, 1080] : [1080, 1920]
    const fps = input.fps || 25

    try {
      // 检查输入文件是否可访问（本地文件 or URL）
      const isUrl = (p: string) => p.startsWith('http://') || p.startsWith('https://')

      if (input.shotVideos.every(v => isUrl(v.videoUrl))) {
        // 远程 URL → 用 FFmpeg concat demuxer
        return await this.concatFromUrls(input, outputPath, w, h, fps)
      } else {
        // 本地文件 → 用 concat protocol
        return await this.concatLocalFiles(input, outputPath, w, h, fps)
      }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  }

  private async concatFromUrls(
    input: RenderInput, outputPath: string, w: number, h: number, fps: number,
  ): Promise<RenderResult> {
    const urls = input.shotVideos.map(v => v.videoUrl)
    const listPath = path.join(this.outputDir, `${input.outputFileName}.txt`)

    // 写 concat 列表
    const listContent = urls.map(u => `file '${u}'`).join('\n')
    fs.writeFileSync(listPath, listContent)

    try {
      const cmd = `${FFMPEG_PATH} -f concat -safe 0 -i "${listPath}" ` +
        `-vf "scale=${w}:${h}:force_original_aspect_ratio=decrease,pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2,fps=${fps},format=yuv420p" ` +
        `-c:v libx264 -preset fast -crf 23 -c:a aac -b:a 128k -y "${outputPath}"`

      await execAsync(cmd, { timeout: 300000 })
      fs.unlinkSync(listPath)

      const totalDuration = input.shotVideos.reduce((s, v) => s + v.duration, 0)
      return { success: true, outputPath, duration: totalDuration }
    } catch (error) {
      if (fs.existsSync(listPath)) fs.unlinkSync(listPath)
      throw error
    }
  }

  private async concatLocalFiles(
    input: RenderInput, outputPath: string, w: number, h: number, fps: number,
  ): Promise<RenderResult> {
    const fileList = input.shotVideos.map(v => v.videoUrl)
    const concatInput = fileList.map(f => `file '${f}'`).join('\n')
    const listPath = path.join(this.outputDir, `${input.outputFileName}.txt`)
    fs.writeFileSync(listPath, concatInput)

    try {
      const cmd = `${FFMPEG_PATH} -f concat -safe 0 -i "${listPath}" ` +
        `-vf "scale=${w}:${h}:force_original_aspect_ratio=decrease,pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2,fps=${fps},format=yuv420p" ` +
        `-c:v libx264 -preset fast -crf 23 -c:a aac -b:a 128k -y "${outputPath}"`

      await execAsync(cmd, { timeout: 300000 })
      fs.unlinkSync(listPath)

      const totalDuration = input.shotVideos.reduce((s, v) => s + v.duration, 0)
      return { success: true, outputPath, duration: totalDuration }
    } catch (error) {
      if (fs.existsSync(listPath)) fs.unlinkSync(listPath)
      throw error
    }
  }

  /**
   * 从视频中抽取封面帧
   */
  async extractCover(videoPath: string, coverPath: string, timeSeconds = 3): Promise<string | null> {
    try {
      const cmd = `${FFMPEG_PATH} -i "${videoPath}" -ss ${timeSeconds} -vframes 1 -q:v 2 -y "${coverPath}"`
      await execAsync(cmd, { timeout: 15000 })
      return coverPath
    } catch {
      return null
    }
  }
}

export const ffmpegService = new FFmpegService()
