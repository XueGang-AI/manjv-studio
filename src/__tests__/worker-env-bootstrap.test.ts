import fs from 'fs'
import path from 'path'
import { describe, expect, it } from 'vitest'

describe('worker env bootstrap', () => {
  it('在导入 Prisma 前用 side-effect import 加载 .env', () => {
    const workerSource = fs.readFileSync(
      path.resolve(process.cwd(), 'src/server/workers/task.worker.ts'),
      'utf8',
    )

    const dotenvImportIndex = workerSource.indexOf("import 'dotenv/config'")
    const prismaImportIndex = workerSource.indexOf("import prisma from '@/lib/prisma'")

    expect(dotenvImportIndex).toBeGreaterThanOrEqual(0)
    expect(prismaImportIndex).toBeGreaterThan(dotenvImportIndex)
    expect(workerSource).not.toContain("import { config } from 'dotenv'")
  })
})
