import { describe, expect, it } from 'vitest'
import {
  buildIssueFixOverlay,
  buildRegenerationRepairHint,
  buildSeedanceConsistencyPrompt,
  buildSeedanceNegativePrompt,
  buildShotContinuityContext,
  buildShotImagePrompt,
  normalizeIssueTypes,
  normalizeMotionStrength,
  selectReferenceImageUrls,
} from '@/server/services/shot-regeneration-quality'

describe('问题驱动重跑质量约束', () => {
  it('把问题类型映射为 prompt overlay 和 appliedFixes', () => {
    const issueTypes = normalizeIssueTypes(['人物漂移', '发型不一致', 'phone_fake_ui_text', '大面积黑边', '伪地图', 'phone_fake_ui_text'])
    const overlay = buildIssueFixOverlay({ issueTypes, fixNote: '第 8 镜头保持低马尾' })

    expect(issueTypes).toEqual(['character_drift', 'hair_inconsistent', 'phone_fake_ui_text', 'invalid_composition', 'fake_text_or_map'])
    expect(overlay.appliedFixes).toContain('人物漂移修复')
    expect(overlay.appliedFixes).toContain('发型一致性修复')
    expect(overlay.appliedFixes).toContain('黑边/无效构图修复')
    expect(overlay.appliedFixes).toContain('伪文字/伪地图修复')
    expect(overlay.promptSection).toContain('同一脸型')
    expect(overlay.promptSection).toContain('低马尾')
    expect(overlay.promptSection).toContain('红色对勾')
    expect(overlay.promptSection).toContain('上半屏或左右大面积纯黑')
    expect(overlay.promptSection).toContain('伪地图线路')
    expect(overlay.promptSection).toContain('人工修复说明：第 8 镜头保持低马尾')
    expect(overlay.negativeTerms).toContain('heart icon')
    expect(overlay.negativeTerms).toContain('black border')
    expect(overlay.negativeTerms).toContain('fake map')
    expect(overlay.requiresImageRerun).toBe(true)
  })

  it('把 QC 问题映射为可直接传给重生接口的 issueTypes', () => {
    expect(buildRegenerationRepairHint({
      issueType: 'shot_image_partial_black',
      problem: '镜头 2 上半屏大面积近黑',
      suggestion: '重生成分镜图',
      recommendedAction: 'rerun_shot_image',
    })).toMatchObject({
      issueTypes: ['invalid_composition'],
    })

    expect(buildRegenerationRepairHint({
      issueType: 'prompt_phone_safety',
      problem: '站内地图和手机屏幕有乱码文字',
      suggestion: '选择手机伪 UI/文字和伪地图后重跑视频',
      recommendedAction: 'rerun_shot_video',
    }).issueTypes).toEqual(['phone_fake_ui_text', 'fake_text_or_map'])

    expect(buildRegenerationRepairHint({
      issueType: 'visual_qc_unavailable',
      problem: '视觉检测不可用',
      recommendedAction: 'accept',
    }).issueTypes).toEqual([])
  })

  it('单镜头视频重生成和批量视频生成共用 Seedance 1.5 一致性约束', () => {
    const continuityContext = buildShotContinuityContext([
      {
        shotNo: 7,
        action: '许澄在摊位前回头',
        visual: { scene_key: 'bridge_live_booth', continuity_out: '许澄保持低马尾，站在手机支架左侧' },
      },
      {
        shotNo: 8,
        action: '许澄举起鱼龙花灯，手机屏幕在旁侧发光',
        visual: { scene_key: 'bridge_live_booth', continuity_in: '延续手机支架左侧站位', continuity_out: '花灯举到胸前' },
      },
    ], 1)
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
        visual: { scene_key: 'bridge_live_booth', continuity_in: '延续手机支架左侧站位' },
        continuityContext,
      },
      10,
      'medium',
      { issueTypes: ['phone_fake_ui_text', 'hair_inconsistent', 'fake_text_or_map'] },
    )

    expect(prompt).toContain('[Seedance 1.5 Pro 一致性硬约束]')
    expect(prompt).toContain('Use the input image as the exact first frame')
    expect(prompt).toContain('one continuous shot')
    expect(prompt).toContain('red check marks')
    expect(prompt).toContain('heart/like icons')
    expect(prompt).toContain('低马尾')
    expect(prompt).toContain('[跨镜连续性硬约束]')
    expect(prompt).toContain('上一同场景镜头 #7')
    expect(prompt).toContain('station maps')
    expect(prompt).toContain('fake maps')
    expect(normalizeMotionStrength('medium', { shotNo: 8, action: '手机直播近景' }, ['phone_fake_ui_text'])).toBe('low')
  })

  it('第 7-9 类手机问题会进入图片和视频负向 prompt', () => {
    const imagePrompt = buildShotImagePrompt(
      '手机支架旁的花灯直播画面',
      { shotNo: 7, action: '许澄调整手机支架', characters: ['许澄'] },
      '东方美学',
      new Map([['许澄', { name: '许澄', appearanceText: '许澄。低马尾。朱砂红开衫。红绳手链' }]]),
      { name: '拱桥直播摊位', location: '古城夜市' },
      { issueTypes: ['phone_fake_ui_text', 'fake_text_or_map'] },
    )
    const videoNegative = buildSeedanceNegativePrompt(null, { issueTypes: ['phone_fake_ui_text', 'fake_text_or_map'] })

    expect(imagePrompt).toContain('手机、直播屏幕')
    expect(imagePrompt).toContain('墙面标牌、站内导视、地图、海报和票务信息')
    expect(videoNegative).toContain('red check mark')
    expect(videoNegative).toContain('heart icon')
    expect(videoNegative).toContain('garbled Chinese characters')
    expect(videoNegative).toContain('fake map')
  })

  it('分镜图参考图优先覆盖每个出镜角色，再补场景和次角度', () => {
    const selected = selectReferenceImageUrls(
      ['song-front', 'song-half', 'zhou-front', 'zhou-side'],
      ['shop-establishing', 'shop-props'],
      ['宋岚', '宋岚', '周远', '周远'],
    )

    expect(selected).toEqual([
      'song-front',
      'zhou-front',
      'shop-establishing',
      'shop-props',
    ])
  })

  it('只为相邻同 scene_key 镜头生成跨镜连续性上下文', () => {
    const shots = [
      {
        shotNo: 1,
        action: '女主在地铁失物招领窗口清点物品',
        visual: { scene_key: 'metro_lost_found', continuity_out: '女主站在柜台后方，手边是金属收纳箱' },
      },
      {
        shotNo: 2,
        action: '男主靠近窗口递出旧票夹',
        visual: { scene_key: 'metro_lost_found', continuity_in: '女主仍在柜台后方，男主从右侧入画', continuity_out: '两人隔着窗口对视' },
      },
      {
        shotNo: 3,
        action: '出口亮灯，人群散开',
        visual: { scene_key: 'metro_exit', continuity_in: '切到出口区域' },
      },
    ]

    const middle = buildShotContinuityContext(shots, 1)
    const last = buildShotContinuityContext(shots, 2)

    expect(middle?.previous?.shotNo).toBe(1)
    expect(middle?.next).toBeUndefined()
    expect(middle?.continuityIn).toContain('男主从右侧入画')
    expect(last?.previous).toBeUndefined()
  })
})
