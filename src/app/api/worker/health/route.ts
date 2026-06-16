import { NextResponse } from 'next/server'
import { checkWorkerHealth } from '@/server/workers/worker-heartbeat'

/**
 * GET /api/worker/health
 * 系统健康状态检查
 *
 * 检查维度：
 * - 数据库（PostgreSQL）：可达性
 * - Redis：主动 PING 验证
 * - Worker：进程 heartbeat（通过 Redis key）
 *
 * 健康语义：
 * - healthy：DB + Redis + Worker heartbeat 均正常
 * - degraded：DB 正常，但 Redis 或 Worker heartbeat 异常
 * - unhealthy：DB 不可用
 *
 * 注意：Redis 不可用时 Worker heartbeat 也无法读取，
 * 两者同时异常应标记为 degraded（不是 unhealthy，因为 DB 正常时核心功能可用）。
 */
export async function GET() {
  const checks: Record<string, { status: string; latency?: number; error?: string; note?: string }> = {}

  // ─── 数据库检查 ────────────────────────────────────────────────────
  try {
    const start = Date.now()
    const prisma = (await import('@/lib/prisma')).default
    await prisma.$queryRaw`SELECT 1`
    checks.database = { status: 'ok', latency: Date.now() - start }
  } catch (e) {
    checks.database = { status: 'error', error: (e as Error).message?.substring(0, 100) }
  }

  // ─── Redis 检查 ────────────────────────────────────────────────────
  try {
    const start = Date.now()
    const { isRedisAvailable } = await import('@/server/workers/task-events')
    if (isRedisAvailable()) {
      checks.redis = { status: 'ok', latency: Date.now() - start }
    } else {
      // 尝试创建新连接验证 Redis 可达性
      try {
        const Redis = (await import('ioredis')).default
        if (process.env.REDIS_URL) {
          const testClient = new Redis(process.env.REDIS_URL, {
            maxRetriesPerRequest: 1,
            lazyConnect: true,
            connectTimeout: 2000,
          })
          await testClient.connect()
          await testClient.ping()
          await testClient.quit()
          checks.redis = { status: 'ok', latency: Date.now() - start, note: 'verified via PING' }
        } else {
          checks.redis = { status: 'unavailable', note: 'REDIS_URL not set' }
        }
      } catch {
        checks.redis = { status: 'error', note: 'Redis unreachable' }
      }
    }
  } catch (e) {
    checks.redis = { status: 'error', error: (e as Error).message?.substring(0, 100) }
  }

  // ─── Worker heartbeat 检查 ─────────────────────────────────────────
  let workerHealth: { status: string; workers: unknown[]; note?: string } = { status: 'unknown', workers: [] }
  try {
    workerHealth = await checkWorkerHealth()
    checks.worker = {
      status: workerHealth.status === 'healthy' ? 'ok' : workerHealth.status === 'degraded' ? 'degraded' : 'unknown',
      note: workerHealth.note || `${workerHealth.workers.length} worker(s) found`,
    }
  } catch {
    checks.worker = { status: 'unknown', note: 'Cannot check worker heartbeat' }
  }

  // ─── 综合状态 ──────────────────────────────────────────────────────
  const dbOk = checks.database?.status === 'ok'
  const redisOk = checks.redis?.status === 'ok'
  const workerOk = checks.worker?.status === 'ok'

  let overallStatus: 'healthy' | 'degraded' | 'unhealthy'
  if (!dbOk) {
    overallStatus = 'unhealthy'
  } else if (redisOk && workerOk) {
    overallStatus = 'healthy'
  } else {
    overallStatus = 'degraded'
  }

  return NextResponse.json({
    success: true,
    data: {
      status: overallStatus,
      checks,
      workers: workerHealth.workers,
      timestamp: new Date().toISOString(),
    },
  }, { status: overallStatus === 'unhealthy' ? 503 : 200 })
}
