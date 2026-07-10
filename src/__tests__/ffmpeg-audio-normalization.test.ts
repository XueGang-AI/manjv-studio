import { afterEach, describe, expect, it } from 'vitest'
import {
  buildAudioFadeFilter,
  buildAudioNormalizationArgs,
  buildVideoNormalizationFilter,
  isAudioNormalizationEnabled,
} from '@/server/services/ffmpeg.service'

describe('成片音频响度归一化配置', () => {
  const oldEnv = process.env.FFMPEG_NORMALIZE_AUDIO

  afterEach(() => {
    if (oldEnv === undefined) delete process.env.FFMPEG_NORMALIZE_AUDIO
    else process.env.FFMPEG_NORMALIZE_AUDIO = oldEnv
  })

  it('默认启用音频归一化，可由输入或环境关闭', () => {
    delete process.env.FFMPEG_NORMALIZE_AUDIO
    expect(isAudioNormalizationEnabled({})).toBe(true)

    process.env.FFMPEG_NORMALIZE_AUDIO = 'false'
    expect(isAudioNormalizationEnabled({})).toBe(false)
    expect(isAudioNormalizationEnabled({ normalizeAudio: true })).toBe(true)
    expect(isAudioNormalizationEnabled({ normalizeAudio: false })).toBe(false)
  })

  it('生成 loudnorm 参数时只重编码音频，不改变视频流', () => {
    const args = buildAudioNormalizationArgs('/tmp/input.mp4', '/tmp/output.mp4', -16)
    expect(args).toContain('-af')
    expect(args).toContain('loudnorm=I=-16:TP=-1.5:LRA=11')
    expect(args).toContain('-c:v')
    expect(args).toContain('copy')
    expect(args).toContain('-c:a')
    expect(args).toContain('aac')
    expect(args).not.toContain('-an')
  })

  it('限制目标响度范围，避免传入异常值破坏渲染参数', () => {
    expect(buildAudioNormalizationArgs('/tmp/in.mp4', '/tmp/out.mp4', 0)).toContain('loudnorm=I=-8:TP=-1.5:LRA=11')
    expect(buildAudioNormalizationArgs('/tmp/in.mp4', '/tmp/out.mp4', -60)).toContain('loudnorm=I=-30:TP=-1.5:LRA=11')
  })

  it('按边界转场计划生成视频和音频淡入淡出滤镜', () => {
    const videoFilter = buildVideoNormalizationFilter(
      1080,
      1920,
      25,
      6,
      { fadeInSeconds: 0.4, fadeOutSeconds: 0.4 },
    )
    const audioFilter = buildAudioFadeFilter(6, { fadeInSeconds: 0.4, fadeOutSeconds: 0.4 })

    expect(videoFilter).toContain('scale=1080:1920:force_original_aspect_ratio=decrease')
    expect(videoFilter).toContain('fade=t=in:st=0:d=0.4')
    expect(videoFilter).toContain('fade=t=out:st=5.6:d=0.4')
    expect(audioFilter).toBe('afade=t=in:st=0:d=0.4,afade=t=out:st=5.6:d=0.4')
  })
})
