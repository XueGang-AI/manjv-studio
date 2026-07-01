import { describe, expect, it } from 'vitest'
import {
  buildIssueFixOverlay,
  buildSeedanceConsistencyPrompt,
  buildSeedanceNegativePrompt,
  buildShotImagePrompt,
  normalizeIssueTypes,
  normalizeMotionStrength,
} from '@/server/services/shot-regeneration-quality'

describe('问题驱动重跑质量约束', () => {
  it('把问题类型映射为 prompt overlay 和 appliedFixes', () => {
    const issueTypes = normalizeIssueTypes(['人物漂移', '发型不一致', 'phone_fake_ui_text', 'phone_fake_ui_text'])
    const overlay = buildIssueFixOverlay({ issueTypes, fixNote: '第 8 镜头保持低马尾' })

    expect(issueTypes).toEqual(['character_drift', 'hair_inconsistent', 'phone_fake_ui_text'])
    expect(overlay.appliedFixes).toContain('人物漂移修复')
    expect(overlay.appliedFixes).toContain('发型一致性修复')
    expect(overlay.promptSection).toContain('同一脸型')
    expect(overlay.promptSection).toContain('低马尾')
    expect(overlay.promptSection).toContain('红色对勾')
    expect(overlay.promptSection).toContain('人工修复说明：第 8 镜头保持低马尾')
    expect(overlay.negativeTerms).toContain('heart icon')
    expect(overlay.requiresImageRerun).toBe(true)
  })

  it('单镜头视频重生成和批量视频生成共用 Seedance 1.5 一致性约束', () => {
    const prompt = buildSeedanceConsistencyPrompt(
      '许澄在拱桥直播摊位前展示鱼龙花灯',
      {
        shotNo: 8,
        shotName: '直播转机',
        action: '许澄举起鱼龙花灯，手机屏幕在旁侧发光',
        location: '古城拱桥直播摊位',
        sceneTime: '夜晚',
        camera: { shot_size: '近景', movement: '缓慢推进' },
        dialogue: '这盏灯还能再亮一次',
      },
      10,
      'medium',
      { issueTypes: ['phone_fake_ui_text', 'hair_inconsistent'] },
    )

    expect(prompt).toContain('[Seedance 1.5 Pro 一致性硬约束]')
    expect(prompt).toContain('Use the input image as the exact first frame')
    expect(prompt).toContain('one continuous shot')
    expect(prompt).toContain('red check marks')
    expect(prompt).toContain('heart/like icons')
    expect(prompt).toContain('低马尾')
    expect(normalizeMotionStrength('medium', { shotNo: 8, action: '手机直播近景' }, ['phone_fake_ui_text'])).toBe('low')
  })

  it('第 7-9 类手机问题会进入图片和视频负向 prompt', () => {
    const imagePrompt = buildShotImagePrompt(
      '手机支架旁的花灯直播画面',
      { shotNo: 7, action: '许澄调整手机支架', characters: ['许澄'] },
      '东方美学',
      new Map([['许澄', { name: '许澄', appearanceText: '许澄。低马尾。朱砂红开衫。红绳手链' }]]),
      { name: '拱桥直播摊位', location: '古城夜市' },
      { issueTypes: ['phone_fake_ui_text'] },
    )
    const videoNegative = buildSeedanceNegativePrompt(null, { issueTypes: ['phone_fake_ui_text'] })

    expect(imagePrompt).toContain('手机、直播屏幕')
    expect(imagePrompt).toContain('禁止字幕、水印、logo、平台 UI、红色对勾、爱心、点赞图标')
    expect(videoNegative).toContain('red check mark')
    expect(videoNegative).toContain('heart icon')
    expect(videoNegative).toContain('garbled Chinese characters')
  })
})
