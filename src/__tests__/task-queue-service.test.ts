import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  prisma: {
    generationTask: {
      update: vi.fn(),
    },
  },
}))

vi.mock('@/lib/prisma', () => ({ default: mocks.prisma }))

const { taskService } = await import('@/server/queues/task-queue.service')

describe('TaskService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.prisma.generationTask.update.mockResolvedValue({ id: 'task-1', status: 'success', progress: 100 })
  })

  it('完成任务时统一把进度置为 100', async () => {
    await taskService.completeTask('task-1', { ok: true })

    expect(mocks.prisma.generationTask.update).toHaveBeenCalledWith({
      where: { id: 'task-1' },
      data: expect.objectContaining({
        status: 'success',
        progress: 100,
        output: { ok: true },
        finishedAt: expect.any(Date),
      }),
    })
  })
})
