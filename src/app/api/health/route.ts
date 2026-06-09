import { NextResponse } from 'next/server'

/**
 * GET /api/health
 * 健康检查接口
 */
export async function GET() {
  return NextResponse.json({
    success: true,
    data: {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      environment: process.env.NODE_ENV || 'development',
      version: '0.1.0',
    },
  })
}
