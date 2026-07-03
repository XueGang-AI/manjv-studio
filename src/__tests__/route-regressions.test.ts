import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const mocks = vi.hoisted(() => {
  const calls: string[] = []
  const deleteDelegate = (name: string) => ({
    deleteMany: vi.fn(async () => {
      calls.push(`${name}.deleteMany`)
      return { count: 1 }
    }),
    delete: vi.fn(async () => {
      calls.push(`${name}.delete`)
      return { id: 'project-1' }
    }),
  })

  const prisma = {
    calls,
    project: {
      findUnique: vi.fn(),
      ...deleteDelegate('project'),
    },
    taskLog: deleteDelegate('taskLog'),
    generationTask: {
      ...deleteDelegate('generationTask'),
      create: vi.fn(),
      update: vi.fn(),
    },
    shotVideo: deleteDelegate('shotVideo'),
    videoPrompt: deleteDelegate('videoPrompt'),
    shotImage: deleteDelegate('shotImage'),
    imagePrompt: deleteDelegate('imagePrompt'),
    voiceScript: deleteDelegate('voiceScript'),
    shot: deleteDelegate('shot'),
    sceneImage: deleteDelegate('sceneImage'),
    scene: deleteDelegate('scene'),
    finalVideo: deleteDelegate('finalVideo'),
    episode: deleteDelegate('episode'),
    characterImage: deleteDelegate('characterImage'),
    character: deleteDelegate('character'),
    storyPackage: deleteDelegate('storyPackage'),
    projectVersion: deleteDelegate('projectVersion'),
    qCReport: deleteDelegate('qCReport'),
    assetFile: deleteDelegate('assetFile'),
    $transaction: vi.fn(async (fn: (tx: unknown) => unknown) => fn(prisma)),
  }

  return {
    prisma,
    runQC: vi.fn(),
  }
})

vi.mock('@/lib/prisma', () => ({ default: mocks.prisma }))
vi.mock('@/server/services/qc.service', () => ({
  qcService: { runQC: mocks.runQC },
}))

const projectRoute = await import('@/app/api/projects/[id]/route')
const projectQCRoute = await import('@/app/api/projects/[id]/qc/run/route')
const episodeQCRoute = await import('@/app/api/projects/[id]/episodes/[episodeId]/qc/run/route')

function params(value: Record<string, string>) {
  return { params: Promise.resolve(value) }
}

function request(body: unknown = {}) {
  return new NextRequest('http://localhost/api/test', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.prisma.calls.length = 0
  mocks.prisma.project.findUnique.mockResolvedValue({ id: 'project-1' })
  mocks.prisma.generationTask.create.mockResolvedValue({ id: 'task-1' })
  mocks.prisma.generationTask.update.mockResolvedValue({ id: 'task-1' })
})

describe('项目删除回归', () => {
  it('先删除任务日志和场景子资源，再删除项目本体', async () => {
    const response = await projectRoute.DELETE(
      new NextRequest('http://localhost/api/projects/project-1', { method: 'DELETE' }),
      params({ id: 'project-1' }),
    )
    const body = await response.json()

    expect(body.success).toBe(true)
    expect(mocks.prisma.$transaction).toHaveBeenCalledTimes(1)
    expect(mocks.prisma.calls.indexOf('taskLog.deleteMany')).toBeLessThan(
      mocks.prisma.calls.indexOf('generationTask.deleteMany'),
    )
    expect(mocks.prisma.calls.indexOf('shot.deleteMany')).toBeLessThan(
      mocks.prisma.calls.indexOf('scene.deleteMany'),
    )
    expect(mocks.prisma.calls.indexOf('sceneImage.deleteMany')).toBeLessThan(
      mocks.prisma.calls.indexOf('scene.deleteMany'),
    )
    expect(mocks.prisma.calls.at(-1)).toBe('project.delete')
  })
})

describe('QC 任务回归', () => {
  it('项目级 QC 失败时把 QUALITY_CHECK 任务标记为 failed', async () => {
    mocks.runQC.mockRejectedValue(new Error('qc failed'))

    const response = await projectQCRoute.POST(request({ episode_id: 'episode-1' }), params({ id: 'project-1' }))
    const body = await response.json()

    expect(response.status).toBe(500)
    expect(body.success).toBe(false)
    expect(mocks.prisma.generationTask.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'task-1' },
      data: expect.objectContaining({
        status: 'failed',
        errorMessage: 'qc failed',
        finishedAt: expect.any(Date),
      }),
    }))
  })

  it('剧集级 QC 失败时把 QUALITY_CHECK 任务标记为 failed', async () => {
    mocks.runQC.mockRejectedValue(new Error('episode qc failed'))

    const response = await episodeQCRoute.POST(
      request(),
      params({ id: 'project-1', episodeId: 'episode-1' }),
    )
    const body = await response.json()

    expect(response.status).toBe(500)
    expect(body.success).toBe(false)
    expect(mocks.prisma.generationTask.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'task-1' },
      data: expect.objectContaining({
        status: 'failed',
        errorMessage: 'episode qc failed',
        finishedAt: expect.any(Date),
      }),
    }))
  })
})
