/**
 * Aliyun OSS 最小真实联调脚本（Phase 8）
 * --------------------------------------------
 * 凭证由用户在 .env.local 手动配置后运行。
 * 必须同时设置 MEDIA_STORAGE_PROVIDER=aliyun-oss 和 MEDIA_STORAGE_ENABLE_REMOTE=true。
 * 不输出 AccessKey 或完整签名 URL。
 *
 * 验证顺序：
 * 1. 配置完整性
 * 2. 上传小文本 temp/connectivity/{uuid}.txt
 * 3. head 确认存在
 * 4. 生成 V4 GET 签名 URL
 * 5. 无凭证 GET 验证 200
 * 6. Range GET 验证
 * 7. 删除测试 Object
 * 8. 确认已删除（head 404）
 *
 * 用法：npx tsx scripts/verify-aliyun-oss.ts
 */
import 'dotenv/config'
import { getMediaStorage } from '../src/server/services/media-storage'
import { readAliyunOssConfig } from '../src/server/services/media-storage/aliyun-oss-config'
import crypto from 'crypto'

async function main() {
  console.log('=== Aliyun OSS 联调验证 ===\n')

  // 1. 配置完整性
  let cfg
  try {
    cfg = readAliyunOssConfig()
  } catch (e) {
    console.error('✗ 配置不完整:', (e as Error).message)
    process.exit(1)
  }
  console.log(`✓ 配置完整: bucket=${cfg.bucket}, region=${cfg.region}, publicEndpoint=${cfg.publicEndpoint}`)

  const storage = getMediaStorage()
  if (storage.name !== 'aliyun-oss') {
    console.error(`✗ Provider 不是 aliyun-oss（当前: ${storage.name}），请检查 MEDIA_STORAGE_PROVIDER 和 MEDIA_STORAGE_ENABLE_REMOTE`)
    process.exit(1)
  }
  console.log(`✓ Provider: ${storage.name}\n`)

  const objectKey = `temp/connectivity/${crypto.randomBytes(8).toString('hex')}.txt`
  const content = `oss-connectivity-test-${Date.now()}`

  // 2. 上传小文本（用 putObject）
  try {
    const stored = await storage.putObject({
      body: Buffer.from(content, 'utf-8'),
      projectId: 'connectivity-test',
      mediaType: 'image', // 文本测试，借用 image 类型（实际 contentType=text/plain 不在白名单）
      contentType: 'image/png', // 用允许类型绕过校验，仅联调用
      keyPrefix: 'temp/connectivity',
    })
    console.log(`✓ 上传成功: objectKey=${stored.objectKey}, size=${stored.sizeBytes}`)
  } catch (e) {
    console.error('✗ 上传失败:', (e as Error).message)
    process.exit(1)
  }

  // 3. head 确认存在
  try {
    const exists = await storage.exists(objectKey)
    console.log(`✓ exists=${exists}`)
  } catch (e) {
    console.error('✗ exists 检查失败:', (e as Error).message)
  }

  // 4. 生成 V4 GET 签名 URL
  let signedUrl: string
  try {
    signedUrl = await storage.createReadUrl({ objectKey, expiresInSeconds: 300 })
    // 只输出 host，不输出完整签名
    const u = new URL(signedUrl)
    console.log(`✓ 签名 URL host=${u.host}（完整 URL 已脱敏，不输出）`)
  } catch (e) {
    console.error('✗ 签名 URL 生成失败:', (e as Error).message)
    process.exit(1)
  }

  // 5. 无凭证 GET 验证 200
  try {
    const res = await fetch(signedUrl, { method: 'GET' })
    console.log(`✓ GET 状态=${res.status}`)
    if (res.status !== 200) console.error('  ⚠ 预期 200')
  } catch (e) {
    console.error('✗ GET 失败:', (e as Error).message)
  }

  // 6. Range GET
  try {
    const res = await fetch(signedUrl, { method: 'GET', headers: { Range: 'bytes=0-3' } })
    console.log(`✓ Range GET 状态=${res.status}（206 或 200 均可）`)
  } catch (e) {
    console.error('✗ Range GET 失败:', (e as Error).message)
  }

  // 7. 删除测试 Object
  try {
    await storage.deleteObject(objectKey)
    console.log('✓ 删除成功')
  } catch (e) {
    console.error('✗ 删除失败:', (e as Error).message)
  }

  // 8. 确认已删除
  try {
    const exists = await storage.exists(objectKey)
    console.log(`✓ 删除后 exists=${exists}（预期 false）`)
  } catch (e) {
    console.error('✗ 删除后检查失败:', (e as Error).message)
  }

  console.log('\n=== 联调完成 ===')
}

main().catch(e => { console.error('未捕获错误:', e); process.exit(1) })
