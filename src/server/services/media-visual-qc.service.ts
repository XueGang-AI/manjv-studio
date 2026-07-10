import fs from 'fs'
import path from 'path'

import {
  FFMPEG_PATH,
  UPLOAD_DIR,
  createTaskTempDir,
  safeCleanupDir,
  spawnSafe,
} from './ffmpeg-utils'
import { resolveMediaRenderSource } from './media-persist'

export type VisualQualityIssueType =
  | 'partial_black_region'
  | 'invalid_composition'
  | 'visual_qc_unavailable'

export type VisualQualitySeverity = 'high' | 'medium' | 'low'

export interface VisualQualityIssue {
  type: VisualQualityIssueType
  severity: VisualQualitySeverity
  region?: 'top' | 'bottom' | 'left' | 'right'
  message: string
}

export interface VisualFrameMetrics {
  timeSeconds?: number
  width: number
  height: number
  wholeMean: number
  topMean: number
  middleMean: number
  bottomMean: number
  leftMean: number
  centerMean: number
  rightMean: number
  topDarkRatio: number
  bottomDarkRatio: number
  leftDarkRatio: number
  rightDarkRatio: number
}

export interface VisualQualityResult {
  passed: boolean
  issues: VisualQualityIssue[]
  frameMetrics: VisualFrameMetrics[]
}

export interface VisualQualityStoredResult {
  passed: boolean
  issues: VisualQualityIssue[]
  samples: Array<{
    timeSeconds?: number
    wholeMean: number
    topMean: number
    middleMean: number
    bottomMean: number
    leftMean: number
    centerMean: number
    rightMean: number
    topDarkRatio: number
    bottomDarkRatio: number
    leftDarkRatio: number
    rightDarkRatio: number
  }>
}

const SAMPLE_WIDTH = 90
const SAMPLE_HEIGHT = 160
const DARK_PIXEL_THRESHOLD = 18
const DARK_REGION_MEAN = 16
const DARK_REGION_RATIO = 0.82
const LIT_COMPARISON_MEAN = 45

function roundMetric(value: number): number {
  return Number(value.toFixed(2))
}

function regionMean(
  pixels: Uint8Array,
  width: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
): { mean: number; darkRatio: number } {
  let sum = 0
  let count = 0
  let dark = 0

  for (let y = y0; y < y1; y++) {
    const row = y * width
    for (let x = x0; x < x1; x++) {
      const value = pixels[row + x]
      sum += value
      count++
      if (value <= DARK_PIXEL_THRESHOLD) dark++
    }
  }

  if (count === 0) return { mean: 0, darkRatio: 0 }
  return { mean: sum / count, darkRatio: dark / count }
}

export function analyzeLumaFrame(
  pixels: Uint8Array,
  width: number,
  height: number,
  timeSeconds?: number,
): { metrics: VisualFrameMetrics; issues: VisualQualityIssue[] } {
  if (pixels.length < width * height) {
    return {
      metrics: {
        timeSeconds,
        width,
        height,
        wholeMean: 0,
        topMean: 0,
        middleMean: 0,
        bottomMean: 0,
        leftMean: 0,
        centerMean: 0,
        rightMean: 0,
        topDarkRatio: 0,
        bottomDarkRatio: 0,
        leftDarkRatio: 0,
        rightDarkRatio: 0,
      },
      issues: [{
        type: 'visual_qc_unavailable',
        severity: 'medium',
        message: '抽帧数据长度不足，无法完成视觉质量检测',
      }],
    }
  }

  const thirdH = Math.floor(height / 3)
  const thirdW = Math.floor(width / 3)
  const whole = regionMean(pixels, width, 0, 0, width, height)
  const top = regionMean(pixels, width, 0, 0, width, thirdH)
  const middle = regionMean(pixels, width, 0, thirdH, width, thirdH * 2)
  const bottom = regionMean(pixels, width, 0, thirdH * 2, width, height)
  const left = regionMean(pixels, width, 0, 0, thirdW, height)
  const center = regionMean(pixels, width, thirdW, 0, thirdW * 2, height)
  const right = regionMean(pixels, width, thirdW * 2, 0, width, height)

  const metrics: VisualFrameMetrics = {
    timeSeconds,
    width,
    height,
    wholeMean: roundMetric(whole.mean),
    topMean: roundMetric(top.mean),
    middleMean: roundMetric(middle.mean),
    bottomMean: roundMetric(bottom.mean),
    leftMean: roundMetric(left.mean),
    centerMean: roundMetric(center.mean),
    rightMean: roundMetric(right.mean),
    topDarkRatio: roundMetric(top.darkRatio),
    bottomDarkRatio: roundMetric(bottom.darkRatio),
    leftDarkRatio: roundMetric(left.darkRatio),
    rightDarkRatio: roundMetric(right.darkRatio),
  }

  const issues: VisualQualityIssue[] = []
  const addDarkBandIssue = (
    region: 'top' | 'bottom' | 'left' | 'right',
    mean: number,
    darkRatio: number,
    comparisonMean: number,
  ) => {
    if (mean <= DARK_REGION_MEAN && darkRatio >= DARK_REGION_RATIO && comparisonMean >= LIT_COMPARISON_MEAN) {
      issues.push({
        type: 'partial_black_region',
        severity: 'high',
        region,
        message: `${region} 区域大面积近黑，疑似画面无效区域或异常黑边`,
      })
    }
  }

  addDarkBandIssue('top', metrics.topMean, metrics.topDarkRatio, Math.max(metrics.middleMean, metrics.bottomMean))
  addDarkBandIssue('bottom', metrics.bottomMean, metrics.bottomDarkRatio, Math.max(metrics.middleMean, metrics.topMean))
  addDarkBandIssue('left', metrics.leftMean, metrics.leftDarkRatio, Math.max(metrics.centerMean, metrics.rightMean))
  addDarkBandIssue('right', metrics.rightMean, metrics.rightDarkRatio, Math.max(metrics.centerMean, metrics.leftMean))

  if (issues.some(issue => issue.type === 'partial_black_region' && issue.severity === 'high')) {
    issues.push({
      type: 'invalid_composition',
      severity: 'high',
      message: '主体画面疑似被挤压到局部区域，当前候选不适合作为确认分镜图或首帧',
    })
  }

  return { metrics, issues }
}

function dedupeIssues(issues: VisualQualityIssue[]): VisualQualityIssue[] {
  const seen = new Set<string>()
  const deduped: VisualQualityIssue[] = []
  for (const issue of issues) {
    const key = `${issue.type}:${issue.region || ''}:${issue.severity}`
    if (seen.has(key)) continue
    seen.add(key)
    deduped.push(issue)
  }
  return deduped
}

function combineFrameResults(results: Array<{ metrics: VisualFrameMetrics; issues: VisualQualityIssue[] }>): VisualQualityResult {
  const issues = dedupeIssues(results.flatMap(result => result.issues))
  return {
    passed: !issues.some(issue => issue.severity === 'high'),
    issues,
    frameMetrics: results.map(result => result.metrics),
  }
}

function sanitizeTime(value: number): number {
  if (!Number.isFinite(value) || value < 0) return 0
  return Number(value.toFixed(3))
}

async function extractLumaFrame(
  localPath: string,
  tempDir: string,
  timeSeconds?: number,
): Promise<Uint8Array | null> {
  const outputPath = path.join(tempDir, `frame-${timeSeconds ?? 'image'}-${Math.random().toString(16).slice(2)}.gray`)
  const args: string[] = ['-hide_banner', '-loglevel', 'error']
  if (typeof timeSeconds === 'number') {
    args.push('-ss', String(sanitizeTime(timeSeconds)))
  }
  args.push(
    '-i', localPath,
    '-map', '0:v:0',
    '-frames:v', '1',
    '-vf', `scale=${SAMPLE_WIDTH}:${SAMPLE_HEIGHT},format=gray`,
    '-f', 'rawvideo',
    '-pix_fmt', 'gray',
    '-y',
    outputPath,
  )

  const result = await spawnSafe(FFMPEG_PATH, args, { timeout: 20_000 })
  if (result.exitCode !== 0 || !fs.existsSync(outputPath)) return null
  const buffer = fs.readFileSync(outputPath)
  if (buffer.length < SAMPLE_WIDTH * SAMPLE_HEIGHT) return null
  return new Uint8Array(buffer.subarray(0, SAMPLE_WIDTH * SAMPLE_HEIGHT))
}

function ensureLocalFile(localPath: string): string {
  const resolved = path.resolve(localPath)
  if (!fs.existsSync(resolved)) throw new Error('媒体文件不存在，无法执行视觉质量检测')
  return resolved
}

export async function analyzeImageVisualQuality(localPath: string): Promise<VisualQualityResult> {
  const resolved = ensureLocalFile(localPath)
  const tempRoot = path.join(UPLOAD_DIR, 'visual_qc_temp')
  fs.mkdirSync(tempRoot, { recursive: true })
  const tempDir = createTaskTempDir(tempRoot)
  try {
    const frame = await extractLumaFrame(resolved, tempDir)
    if (!frame) {
      return {
        passed: false,
        issues: [{
          type: 'visual_qc_unavailable',
          severity: 'medium',
          message: '无法抽取图片帧进行视觉质量检测',
        }],
        frameMetrics: [],
      }
    }
    return combineFrameResults([analyzeLumaFrame(frame, SAMPLE_WIDTH, SAMPLE_HEIGHT)])
  } finally {
    safeCleanupDir(tempDir, tempRoot)
  }
}

async function resolveLocalVisualSource(
  storageObjectKey: string | null | undefined,
  legacyUrl: string | null | undefined,
): Promise<string | null> {
  const renderSource = await resolveMediaRenderSource(storageObjectKey, legacyUrl)
  if (!renderSource || /^https?:\/\//i.test(renderSource)) return null
  return renderSource
}

export async function analyzePersistedImageVisualQuality(
  storageObjectKey: string | null | undefined,
  imageUrl: string | null | undefined,
): Promise<VisualQualityResult | null> {
  const localSource = await resolveLocalVisualSource(storageObjectKey, imageUrl)
  if (!localSource) return null
  return analyzeImageVisualQuality(localSource)
}

function buildVideoSampleTimes(duration?: number | null, sampleIntervalSeconds?: number, maxSamples?: number): number[] {
  const safeDuration = Number.isFinite(duration || 0) ? Math.max(0, Number(duration || 0)) : 0
  if (sampleIntervalSeconds && sampleIntervalSeconds > 0 && safeDuration > 0) {
    const times: number[] = []
    const limit = Math.max(1, Math.min(maxSamples || 40, 120))
    for (let t = 0; t < safeDuration && times.length < limit; t += sampleIntervalSeconds) {
      times.push(sanitizeTime(t))
    }
    if (times.length === 0) times.push(0)
    return times
  }

  if (safeDuration <= 0) return [0]
  const middle = safeDuration / 2
  const nearStart = Math.min(1, Math.max(0, safeDuration - 0.1))
  return Array.from(new Set([0, nearStart, middle].map(sanitizeTime))).sort((a, b) => a - b)
}

export async function analyzeVideoVisualQuality(
  localPath: string,
  options: { duration?: number | null; sampleIntervalSeconds?: number; maxSamples?: number } = {},
): Promise<VisualQualityResult> {
  const resolved = ensureLocalFile(localPath)
  const tempRoot = path.join(UPLOAD_DIR, 'visual_qc_temp')
  fs.mkdirSync(tempRoot, { recursive: true })
  const tempDir = createTaskTempDir(tempRoot)
  const times = buildVideoSampleTimes(options.duration, options.sampleIntervalSeconds, options.maxSamples)
  try {
    const results: Array<{ metrics: VisualFrameMetrics; issues: VisualQualityIssue[] }> = []
    for (const time of times) {
      const frame = await extractLumaFrame(resolved, tempDir, time)
      if (!frame) continue
      results.push(analyzeLumaFrame(frame, SAMPLE_WIDTH, SAMPLE_HEIGHT, time))
    }
    if (results.length === 0) {
      return {
        passed: false,
        issues: [{
          type: 'visual_qc_unavailable',
          severity: 'medium',
          message: '无法抽取视频帧进行视觉质量检测',
        }],
        frameMetrics: [],
      }
    }
    return combineFrameResults(results)
  } finally {
    safeCleanupDir(tempDir, tempRoot)
  }
}

export async function analyzePersistedVideoVisualQuality(
  storageObjectKey: string | null | undefined,
  videoUrl: string | null | undefined,
  options: { duration?: number | null; sampleIntervalSeconds?: number; maxSamples?: number } = {},
): Promise<VisualQualityResult | null> {
  const localSource = await resolveLocalVisualSource(storageObjectKey, videoUrl)
  if (!localSource) return null
  return analyzeVideoVisualQuality(localSource, options)
}

export function toStoredVisualQuality(result: VisualQualityResult): VisualQualityStoredResult {
  return {
    passed: result.passed,
    issues: result.issues,
    samples: result.frameMetrics.map(metric => ({
      timeSeconds: metric.timeSeconds,
      wholeMean: metric.wholeMean,
      topMean: metric.topMean,
      middleMean: metric.middleMean,
      bottomMean: metric.bottomMean,
      leftMean: metric.leftMean,
      centerMean: metric.centerMean,
      rightMean: metric.rightMean,
      topDarkRatio: metric.topDarkRatio,
      bottomDarkRatio: metric.bottomDarkRatio,
      leftDarkRatio: metric.leftDarkRatio,
      rightDarkRatio: metric.rightDarkRatio,
    })),
  }
}

export function hasBlockingVisualIssues(result: VisualQualityResult | null | undefined): boolean {
  return !!result?.issues.some(issue => issue.severity === 'high')
}
