import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const mocks = vi.hoisted(() => ({
  prisma: {
    shot: { findFirst: vi.fn() },
    project: { findUnique: vi.fn() },
    shotImage: { findMany: vi.fn(), create: vi.fn(), deleteMany: vi.fn() },
    imagePrompt: { findFirst: vi.fn() },
    scene: { findFirst: vi.fn() },
    characterImage: { findMany: vi.fn() },
    character: { findMany: vi.fn() },
  },
  generate: vi.fn(),
  resolveImageUrlForModel: vi.fn(),
  persistImageWithPolicy: vi.fn(),
}))

vi.mock('@/lib/prisma', () => ({ default: mocks.prisma }))
vi.mock('@/server/model-adapters/adapter.factory', () => ({
  adapterFactory: {
    getImageAdapter: vi.fn(() => ({ generate: mocks.generate })),
  },
}))
vi.mock('@/server/model-adapters/model-config', () => ({
  getRuntimeModelName: vi.fn(() => 'doubao-seedream-5.0-lite'),
}))
vi.mock('@/server/services/media-reference-url', () => ({
  resolveImageUrlForModel: mocks.resolveImageUrlForModel,
}))
vi.mock('@/server/services/media-persist', () => ({
  persistImageWithPolicy: mocks.persistImageWithPolicy,
}))

const { POST } = await import('@/app/api/projects/[id]/episodes/[episodeId]/shots/[shotId]/images/regenerate/route')

function makeRequest(body: unknown) {
  return new NextRequest('http://localhost/api/regenerate', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  })
}

function params() {
  return { params: Promise.resolve({ id: 'project-1', episodeId: 'episode-1', shotId: 'shot-1' }) }
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.prisma.shot.findFirst.mockResolvedValue({
    id: 'shot-1',
    projectId: 'project-1',
    episodeId: 'episode-1',
    sceneId: 'scene-1',
    shotNo: 6,
    shotName: '灯坊返工',
    characters: ['许澄'],
    action: '许澄低头修补鱼龙花灯',
    details: null,
    camera: { shot_size: '近景' },
    visual: {},
    location: '花灯工坊',
    sceneTime: '夜晚',
    emotion: '专注',
  })
  mocks.prisma.project.findUnique.mockResolvedValue({
    id: 'project-1',
    modelProvider: 'ark',
    artStyle: '东方美学',
    aspectRatio: '9:16',
  })
  mocks.prisma.imagePrompt.findFirst.mockResolvedValue({
    enPrompt: 'Xu Cheng repairs a fish-dragon lantern',
    zhPrompt: '许澄修补鱼龙花灯',
    negativePrompt: null,
  })
  mocks.prisma.scene.findFirst.mockResolvedValue({
    id: 'scene-1',
    name: '花灯工坊',
    location: '古城灯坊',
    sceneTime: '夜晚',
    description: '案台、竹篾、彩纸墙和暖色灯光',
    sceneImages: [{
      imageUrl: '/scene.jpg',
      referenceType: 'scene',
      storageObjectKey: null,
      sourceUrl: null,
    }],
  })
  mocks.prisma.characterImage.findMany.mockResolvedValue([{
    characterId: 'char-1',
    imageUrl: '/char.jpg',
    referenceType: 'front_half_body',
    storageObjectKey: null,
    sourceUrl: null,
    character: { id: 'char-1', name: '许澄' },
  }])
  mocks.prisma.character.findMany.mockResolvedValue([{
    id: 'char-1',
    name: '许澄',
    gender: '女',
    age: 24,
    appearance: { hair_style: '低马尾', face_shape: '清秀鹅蛋脸' },
    clothing: { daily: { top: '朱砂红开衫', bottom: '深蓝长裙', accessories: '红绳手链' } },
    signatureFeatures: ['低马尾', '红绳手链'],
  }])
  mocks.resolveImageUrlForModel.mockImplementation(async ({ imageUrl }) => imageUrl)
  mocks.generate.mockResolvedValue({
    images: [
      { url: 'https://provider.example/new-1.jpg', seed: 'seed-1', params: { provider: 'mock' } },
      { url: 'https://provider.example/new-2.jpg', seed: 'seed-2', params: { provider: 'mock' } },
    ],
  })
  mocks.persistImageWithPolicy.mockImplementation(async (url: string) => ({
    persisted: true,
    imageUrl: `/uploads/${url.split('/').pop()}`,
    storageObjectKey: `projects/project-1/images/${url.split('/').pop()}`,
    storageProvider: 'local',
    sourceUrl: url,
  }))
  mocks.prisma.shotImage.create.mockImplementation(async ({ data }) => ({ id: `candidate-${data.seed}`, ...data }))
})

describe('单镜头分镜图重生成', () => {
  it('追加候选图，不删除旧确认图，并写入问题驱动修复信息', async () => {
    mocks.prisma.shotImage.findMany.mockResolvedValue([])

    const response = await POST(makeRequest({
      issueTypes: ['character_drift', 'hair_inconsistent'],
      fixNote: '第 6 镜头保持低马尾和红绳手链',
      clientRequestId: 'req-1',
    }), params())
    const body = await response.json()

    expect(body.success).toBe(true)
    expect(body.data.reused).toBe(false)
    expect(body.data.candidateId).toBe('candidate-seed-1')
    expect(body.data.appliedFixes).toContain('人物漂移修复')
    expect(mocks.prisma.shotImage.deleteMany).not.toHaveBeenCalled()
    expect(mocks.prisma.shotImage.create).toHaveBeenCalledTimes(2)
    expect(mocks.prisma.shotImage.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        isConfirmed: false,
        isSelected: false,
        prompt: expect.stringContaining('低马尾'),
        params: expect.objectContaining({
          generation_method: 'single_regenerate_candidate',
          client_request_id: 'req-1',
          issue_types: ['character_drift', 'hair_inconsistent'],
        }),
      }),
    }))
  })

  it('同一 clientRequestId 重复请求复用已有候选，不再次调用图片模型', async () => {
    mocks.prisma.shotImage.findMany.mockResolvedValue([{
      id: 'existing-candidate',
      shotId: 'shot-1',
      projectId: 'project-1',
      params: { client_request_id: 'req-reuse' },
    }])

    const response = await POST(makeRequest({
      issueTypes: ['phone_fake_ui_text'],
      clientRequestId: 'req-reuse',
    }), params())
    const body = await response.json()

    expect(body.success).toBe(true)
    expect(body.data.reused).toBe(true)
    expect(body.data.candidateId).toBe('existing-candidate')
    expect(mocks.generate).not.toHaveBeenCalled()
    expect(mocks.prisma.shotImage.create).not.toHaveBeenCalled()
  })
})
