import { NextResponse } from 'next/server'

/**
 * GET /api/worker/health
 * Worker 健康状态检查
 *
 * 注意：此端点运行在 Next.js 进程中，只能检查共享资源（DB、Redis）。
 * Worker 进程本身的存活需要通过部署平台进程健康检查确认。
 */
export async function GET() {
  const checks: Record<string, { status: string; latency?: number; error?: string }> = {}

  // 数据库检查
  try {
    const start = Date.now()
    const prisma = (await import('@/lib/prisma')).default
    await prisma.$queryRaw`SELECT 1`
    checks.database = { status: 'ok', latency: Date.now() - start }
  } catch (e) {
    checks.database = { status: 'error', error: (e as Error).message?.substring(0, 100) }
  }

  // Redis 检查
  try {
    const start = Date.now()
    const { isRedisAvailable } = await import('@/server/workers/task-events')
    const available = isRedisAvailable()
    checks.redis = {
      status: available ? 'ok' : 'unavailable',
      latency: available ? Date.now() - start : undefined,
    }
  } catch (e) {
    checks.redis = { status: 'error', error: (e as Error).message?.substring(0, 100) }
  }

  const allOk = Object.values(checks).every(c => c.status === 'ok')
  const someUnavailable = Object.values(checks).some(c => c.status === 'unavailable')

  return NextResponse.json({
    success: true,
    data: {
      status: allOk ? 'healthy' : someUnavailable ? 'degraded' : 'unhealthy',
      checks,
      worker: {
        // Worker 进程状态需通过独立机制检查
        // 此端点只能反映 Next.js 进程侧的健康状态
        note: 'Worker process health requires separate process monitoring',
      },
      timestamp: new Date().toISOString(),
    },
  }, { status: allOk ? 200 : 503 })
}
