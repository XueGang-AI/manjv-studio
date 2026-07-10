import { describe, expect, it } from 'vitest'

import { analyzeLumaFrame, hasBlockingVisualIssues } from '@/server/services/media-visual-qc.service'

function frame(width: number, height: number, fill: (x: number, y: number) => number): Uint8Array {
  const pixels = new Uint8Array(width * height)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      pixels[y * width + x] = fill(x, y)
    }
  }
  return pixels
}

describe('media visual QC', () => {
  it('识别上半屏近黑、下半屏正常的无效画面', () => {
    const width = 90
    const height = 160
    const pixels = frame(width, height, (_x, y) => y < 62 ? 3 : 120)
    const result = analyzeLumaFrame(pixels, width, height, 7.04)

    expect(result.metrics.topMean).toBeLessThan(10)
    expect(result.metrics.middleMean).toBeGreaterThan(40)
    expect(result.issues).toContainEqual(expect.objectContaining({
      type: 'partial_black_region',
      severity: 'high',
      region: 'top',
    }))
    expect(result.issues).toContainEqual(expect.objectContaining({
      type: 'invalid_composition',
      severity: 'high',
    }))
    expect(hasBlockingVisualIssues({ passed: false, issues: result.issues, frameMetrics: [result.metrics] })).toBe(true)
  })

  it('不把整体暗场误判为局部黑边', () => {
    const width = 90
    const height = 160
    const pixels = frame(width, height, () => 12)
    const result = analyzeLumaFrame(pixels, width, height, 15)

    expect(result.metrics.wholeMean).toBeLessThan(20)
    expect(result.issues).not.toContainEqual(expect.objectContaining({ type: 'partial_black_region' }))
    expect(hasBlockingVisualIssues({ passed: true, issues: result.issues, frameMetrics: [result.metrics] })).toBe(false)
  })

  it('不把正常竖屏构图判为阻断问题', () => {
    const width = 90
    const height = 160
    const pixels = frame(width, height, (_x, y) => y < 30 ? 55 : 130)
    const result = analyzeLumaFrame(pixels, width, height, 0)

    expect(result.issues).toEqual([])
  })
})
