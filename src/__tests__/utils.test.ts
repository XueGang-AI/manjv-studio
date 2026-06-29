import { describe, expect, it } from 'vitest'
import { getMaxShotDuration, normalizeShotDurations, snapShotDuration } from '@/lib/utils'

describe('镜头时长工具', () => {
  it('按 Seedance 1.5 模型把单镜头限制到 12 秒', () => {
    expect(getMaxShotDuration('doubao-seedance-1-5-pro-251215')).toBe(12)
    expect(snapShotDuration(15, 'doubao-seedance-1-5-pro-251215')).toBe(12)
    expect(getMaxShotDuration('doubao-seedance-1.5-pro')).toBe(12)
    expect(snapShotDuration(15, 'doubao-seedance-1.5-pro')).toBe(12)
  })

  it('按 Seedance 2.0 模型允许单镜头 15 秒', () => {
    expect(getMaxShotDuration('doubao-seedance-2-0-260128')).toBe(15)
    expect(snapShotDuration(15, 'doubao-seedance-2-0-260128')).toBe(15)
    expect(getMaxShotDuration('doubao-seedance-2.0')).toBe(15)
    expect(snapShotDuration(15, 'doubao-seedance-2.0')).toBe(15)
  })

  it('把 60 秒分镜归一化为连续时间轴，且每镜头不超过 12 秒', () => {
    const shots = [
      { shot_no: 1, shot_name: '发现异常', start_time: 0, end_time: 40 },
      { shot_no: 2, shot_name: '追查日志', start_time: 40, end_time: 60 },
      { shot_no: 3, shot_name: '对比备份', start_time: 60, end_time: 61 },
      { shot_no: 4, shot_name: '投屏证据', start_time: 61, end_time: 62 },
      { shot_no: 5, shot_name: '说服团队', start_time: 62, end_time: 63 },
      { shot_no: 6, shot_name: '暂停上线', start_time: 63, end_time: 64 },
    ]

    const normalized = normalizeShotDurations(shots, 60, 12)
    const durations = normalized.map(shot => Number(shot.end_time) - Number(shot.start_time))

    expect(normalized[0].start_time).toBe(0)
    expect(normalized.at(-1)?.end_time).toBe(60)
    expect(durations.reduce((sum, duration) => sum + duration, 0)).toBe(60)
    expect(durations.every(duration => duration >= 4 && duration <= 12)).toBe(true)
    expect(normalized.every((shot, index) => shot.shot_no === index + 1)).toBe(true)
  })
})
