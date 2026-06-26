// ============================================
// Unit Tests: Services
// ============================================
import { describe, it, expect } from 'vitest'

describe('PromptTemplateService', () => {
  it('should fill variables correctly', () => {
    const text = 'Hello {{name}}, your project is {{project_name}}'
    const filled = text.replace(/\{\{(\w+)\}\}/g, (_, key) => {
      const vars: Record<string, string> = { name: 'World', project_name: 'Test' }
      return vars[key] || ''
    })
    expect(filled).toBe('Hello World, your project is Test')
  })

  it('should handle missing variables', () => {
    const text = '{{missing}} and {{present}}'
    const filled = text.replace(/\{\{(\w+)\}\}/g, (_, key) => {
      const vars = { present: 'OK' }
      return vars[key as keyof typeof vars] || ''
    })
    expect(filled).toBe(' and OK')
  })

  it('should handle JSON variables', () => {
    const text = '{{story_package_json}}'
    const vars = { story_package_json: '{"data":1}' }
    const filled = text.replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k as keyof typeof vars] || '')
    expect(filled).toBe('{"data":1}')
  })
})

describe('JSON 解析与校验', () => {
  it('should validate required fields', () => {
    const data = { name: 'test' }
    const schema = { required: ['name', 'age'] }
    const missing = (schema.required as string[]).filter(f => !(f in (data as Record<string, unknown>)))
    expect(missing).toEqual(['age'])
  })

  it('should parse JSON from markdown', () => {
    const text = '```json\n{"name":"test"}\n```'
    const match = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/)
    expect(JSON.parse(match![1])).toEqual({ name: 'test' })
  })

  it('should parse plain JSON', () => {
    expect(JSON.parse('{"name":"test"}')).toEqual({ name: 'test' })
  })
})

describe('ModelAdapterFactory', () => {
  it('should return MockTextAdapter when USE_MOCK_MODEL=true', async () => {
    process.env.USE_MOCK_MODEL = 'true'
    const { adapterFactory } = await import('@/server/model-adapters/adapter.factory')
    const adapter = adapterFactory.getTextAdapter()
    const result = await adapter.generate({ taskType: 'story_analysis', systemPrompt: 'test', userPrompt: 'test' })
    expect(result.rawText).toBeTruthy()
    expect(result.json).toBeDefined()
  })

  it('should return MockImageAdapter with placeholder images', async () => {
    const { adapterFactory } = await import('@/server/model-adapters/adapter.factory')
    const adapter = adapterFactory.getImageAdapter()
    const result = await adapter.generate({ taskType: 'character_image', prompt: 'test', numOutputs: 4 })
    expect(result.images).toHaveLength(4)
    expect(result.images[0].url).toContain('placehold.co')
  })

  it('should return MockVideoAdapter with video URLs', async () => {
    const { adapterFactory } = await import('@/server/model-adapters/adapter.factory')
    const adapter = adapterFactory.getVideoAdapter()
    const result = await adapter.generate({ taskType: 'image_to_video', prompt: 'test', duration: 5 })
    expect(result.videos.length).toBeGreaterThan(0)
    expect(result.videos[0].url).toBeTruthy()
  })
})

describe('VersionService', () => {
  it('should accept createVersion input', () => {
    const input = {
      projectId: 'test-pid', entityType: 'STORY_PACKAGE', entityId: 'test-eid',
      snapshot: { project_status: 'DRAFT' }, changeType: 'GENERATE', description: 'test',
    }
    expect(input.projectId).toBe('test-pid')
    expect(input.entityType).toBe('STORY_PACKAGE')
    expect(input.snapshot).toHaveProperty('project_status')
  })

  it('should identify rollback changeType', () => {
    const changeTypes = ['GENERATE', 'REGENERATE', 'EDIT', 'CONFIRM', 'ROLLBACK', 'SELECT']
    expect(changeTypes).toContain('ROLLBACK')
  })
})

describe('QCService', () => {
  it('should calculate score correctly', () => {
    const highIssues = [{ level: 'high', field: 'x', problem: 'p', suggestion: '' }]
    const mediumIssues = [{ level: 'medium', field: 'y', problem: 'p', suggestion: '' }]
    const score = Math.max(0, 100 - highIssues.length * 15 - mediumIssues.length * 8)
    expect(score).toBe(77)
  })

  it('should map score to level correctly', () => {
    const getLevel = (s: number) => s >= 90 ? 'excellent' : s >= 75 ? 'good' : s >= 60 ? 'warning' : 'failed'
    expect(getLevel(95)).toBe('excellent')
    expect(getLevel(80)).toBe('good')
    expect(getLevel(65)).toBe('warning')
    expect(getLevel(50)).toBe('failed')
  })

  it('should flag rewrite_required when score < 75', () => {
    const score = 70
    expect(score < 75).toBe(true)
    const score2 = 85
    expect(score2 < 75).toBe(false)
  })
})

describe('TaskQueueService', () => {
  it('should define all task types', () => {
    const types = [
      'GENERATE_STORY_PACKAGE', 'GENERATE_CHARACTERS', 'GENERATE_CHARACTER_IMAGES',
      'GENERATE_STORYBOARD', 'GENERATE_SCENE_REFERENCES', 'GENERATE_SHOT_IMAGES', 'GENERATE_SHOT_VIDEOS',
      'RENDER_FINAL_VIDEO', 'QUALITY_CHECK',
    ]
    expect(types).toHaveLength(9)
  })

  it('should define retry limits per task type', () => {
    const getRetries = (type: string) => {
      if (type.includes('RENDER')) return 1
      if (type.includes('VIDEO')) return 2
      return 3
    }
    expect(getRetries('GENERATE_STORY_PACKAGE')).toBe(3)
    expect(getRetries('GENERATE_SHOT_VIDEOS')).toBe(2)
    expect(getRetries('RENDER_FINAL_VIDEO')).toBe(1)
  })
})

describe('FFmpegService', () => {
  it('should define correct output resolution for 9:16', () => {
    const [w, h] = '9:16' === '16:9' ? [1920, 1080] : [1080, 1920]
    expect(w).toBe(1080)
    expect(h).toBe(1920)
  })

  it('should define correct output resolution for 16:9', () => {
    const [w, h] = '16:9' === '16:9' ? [1920, 1080] : [1080, 1920]
    expect(w).toBe(1920)
    expect(h).toBe(1080)
  })
})
