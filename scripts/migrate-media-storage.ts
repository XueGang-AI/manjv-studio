/**
 * 历史图片转存迁移脚本（Phase 6）
 * --------------------------------------------
 * 将 CharacterImage/ShotImage 中尚未转存（无 storageObjectKey）的图片
 * 从供应商短期签名 URL 转存到项目自有存储，写入 storageObjectKey。
 *
 * 特性：
 * - 支持 dry-run（不修改数据库，仅统计）
 * - 分批处理（BATCH_SIZE）
 * - 失败记录（不中断整体）
 * - 可重复执行（已转存的跳过）
 * - 不删除旧字段（imageUrl/sourceUrl 保留）
 * - 不在日志输出完整签名 URL
 *
 * 用法：
 *   npx tsx scripts/migrate-media-storage.ts --dry-run
 *   npx tsx scripts/migrate-media-storage.ts --batch=20
 */

import { prisma } from '../src/lib/prisma'
import { mediaStorage } from '../src/server/services/media-storage'

interface MigrateArgs {
  dryRun: boolean
  batchSize: number
}

function parseArgs(): MigrateArgs {
  const args = process.argv.slice(2)
  const dryRun = args.includes('--dry-run')
  let batchSize = 10
  for (const a of args) {
    if (a.startsWith('--batch=')) {
      const n = parseInt(a.slice(8), 10)
      if (Number.isFinite(n) && n > 0) batchSize = n
    }
  }
  return { dryRun, batchSize }
}

interface MigrateResult {
  total: number
  migrated: number
  skipped: number
  failed: number
  failures: Array<{ id: string; table: string; reason: string }>
}

async function migrateTable(
  table: 'characterImage' | 'shotImage',
  dryRun: boolean,
  batchSize: number,
  result: MigrateResult,
) {
  let cursor: string | undefined
  let hasMore = true

  while (hasMore) {
    // 动态表名迁移工具：prisma[table] 需 any 访问模型委托，此处合理使用
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const records = await (prisma[table] as any).findMany({
      where: {
        imageUrl: { not: null },
        storageObjectKey: null,
      },
      take: batchSize,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      orderBy: { id: 'asc' },
      select: { id: true, imageUrl: true, projectId: true },
    })

    if (records.length === 0) {
      hasMore = false
      break
    }

    cursor = records[records.length - 1].id

    for (const rec of records) {
      result.total++
      if (!rec.imageUrl) {
        result.skipped++
        continue
      }

      if (dryRun) {
        // dry-run：仅统计，不下载/不写库
        result.migrated++
        continue
      }

      try {
        const stored = await mediaStorage.ingestFromUrl({
          sourceUrl: rec.imageUrl,
          projectId: rec.projectId,
          mediaType: 'image',
        })
        // 转存成功：imageUrl 改为本地可访问 readUrl（稳定，不依赖供应商签名）
        const readUrl = await mediaStorage.createReadUrl({
          objectKey: stored.objectKey,
          expiresInSeconds: 86400,
        })
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (prisma[table] as any).update({
          where: { id: rec.id },
          data: {
            storageObjectKey: stored.objectKey,
            storageProvider: stored.provider,
            sourceUrl: rec.imageUrl,
            imageUrl: readUrl,
          },
        })
        result.migrated++
      } catch (err) {
        result.failed++
        const reason = err instanceof Error ? err.message.slice(0, 100) : 'unknown'
        result.failures.push({ id: rec.id, table, reason })
        // 不输出完整签名 URL
        console.error(`[migrate] ${table} ${rec.id.slice(0, 8)} failed: ${reason}`)
      }
    }

    if (records.length < batchSize) hasMore = false
  }
}

async function main() {
  const { dryRun, batchSize } = parseArgs()
  console.log(`[migrate] dryRun=${dryRun} batchSize=${batchSize}`)

  const result: MigrateResult = {
    total: 0, migrated: 0, skipped: 0, failed: 0, failures: [],
  }

  await migrateTable('characterImage', dryRun, batchSize, result)
  await migrateTable('shotImage', dryRun, batchSize, result)

  console.log('[migrate] result:', {
    total: result.total,
    migrated: result.migrated,
    skipped: result.skipped,
    failed: result.failed,
    failuresShown: result.failures.length,
  })
  if (result.failures.length > 0) {
    console.log('[migrate] first 5 failures:', result.failures.slice(0, 5))
  }

  await prisma.$disconnect()
}

main().catch(e => { console.error('ERR:', e.message); process.exit(1) })
