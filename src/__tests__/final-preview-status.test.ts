import { describe, expect, it } from 'vitest'
import { getMp4LinkCheck } from '@/components/final-preview/final-preview-types'

describe('成片 MP4 链接状态', () => {
  it('没有 URL 时不输出 MP4 检查项', () => {
    expect(getMp4LinkCheck(null, false, false)).toBeNull()
  })

  it('有 URL 但尚未读取元数据时显示读取中而不是可访问', () => {
    expect(getMp4LinkCheck('/api/media/final.mp4', false, false)).toEqual({
      key: 'mp4_link',
      label: 'MP4 链接',
      passed: false,
      detail: '读取中',
    })
  })

  it('播放器报错时显示不可读', () => {
    expect(getMp4LinkCheck('/api/media/final.mp4', false, true)).toEqual({
      key: 'mp4_link',
      label: 'MP4 链接',
      passed: false,
      detail: '不可读',
    })
  })

  it('播放器确认可播放后才显示可访问', () => {
    expect(getMp4LinkCheck('/api/media/final.mp4', true, false)).toEqual({
      key: 'mp4_link',
      label: 'MP4 链接',
      passed: true,
      detail: '可访问',
    })
  })
})
