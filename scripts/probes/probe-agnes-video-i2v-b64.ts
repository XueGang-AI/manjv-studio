// ============================================
// Case C: 图生视频（使用图片 b64_json / base64 data URI）
// ============================================
import 'dotenv/config'
import fs from 'fs'

const BASE = process.env.AGNES_VIDEO_API_BASE_URL || 'https://apihub.agnes-ai.com/v1'
const KEY = process.env.AGNES_VIDEO_API_KEY || ''
const VIDEO_MODEL = process.env.AGNES_VIDEO_MODEL || 'agnes-video-v2.0'
const IMAGE_MODEL = process.env.AGNES_IMAGE_MODEL || 'agnes-image-2.0-flash'
const IMAGE_BASE = process.env.AGNES_IMAGE_API_BASE_URL || 'https://apihub.agnes-ai.com/v1'

async function main() {
  console.log('🎬 Case C: 图生视频（b64_json / data URI）\n')

  // Step 0: 生成图片（标准请求，不传 response_format）
  console.log('Step 0: 生成测试图片...')
  const imgRes = await fetch(`${IMAGE_BASE}/images/generations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${KEY}` },
    body: JSON.stringify({
      model: IMAGE_MODEL,
      prompt: 'A young Chinese woman in a modern office, Korean manhwa style, cinematic lighting, high quality, portrait',
      aspect_ratio: '9:16',
      num_outputs: 1,
      negative_prompt: 'ugly, deformed, low quality, blurry, text, watermark',
    }),
  })

  const imgData = await imgRes.json() as Record<string, unknown>
  console.log(`image API status: ${imgRes.status}`)

  if (!imgRes.ok) {
    console.log(`❌ 图片生成失败: ${JSON.stringify(imgData).substring(0, 300)}`)
    process.exit(1)
  }

  const firstImg = ((imgData.data as unknown[])?.find(Boolean) as Record<string,unknown>) || ((imgData.data as unknown[])?.[0] as Record<string,unknown>)
  console.log(`image response keys: ${Object.keys(firstImg || {}).join(', ')}`)

  // 检查是否有 b64_json
  let b64Str = ''
  if (firstImg?.b64_json) {
    b64Str = firstImg.b64_json as string
    console.log(`✅ b64_json 字段存在 (${b64Str.length} chars)`)
  } else if (firstImg?.url) {
    const imgUrl = firstImg.url as string
    console.log(`b64_json 不存在，从 URL 下载并转 base64...`)
    console.log(`  url: ${imgUrl.substring(0, 80)}...`)
    const dlRes = await fetch(imgUrl)
    const buf = Buffer.from(await dlRes.arrayBuffer())
    b64Str = buf.toString('base64')
    console.log(`  downloaded: ${buf.length} bytes → ${b64Str.length} chars base64`)
  } else {
    console.log(`❌ 无图片数据: ${JSON.stringify(firstImg).substring(0, 200)}`)
    process.exit(1)
  }

  const dataUri = `data:image/png;base64,${b64Str}`
  console.log(`data URI length: ${dataUri.length} chars`)

  // Step 1: 创建视频任务（传入 data URI）
  await testVideoWithB64(dataUri)
}

async function testVideoWithB64(dataUri: string) {
  console.log(`\nStep 1: POST /videos (i2v with data URI)`)
  const body: Record<string, unknown> = {
    model: VIDEO_MODEL,
    prompt: 'Slow push-in camera movement, cinematic lighting, no text, no watermark',
    image: dataUri,
    duration: 5,
    aspect_ratio: '9:16',
  }

  const createRes = await fetch(`${BASE}/videos`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${KEY}` },
    body: JSON.stringify(body),
  })

  console.log(`status: ${createRes.status}`)
  const createData = await createRes.json() as Record<string, unknown>
  console.log(`response: ${JSON.stringify(createData, null, 2).substring(0, 500)}`)

  if (!createRes.ok) {
    console.log(`\n❌ 视频 API 拒绝 b64/data URI 格式`)
    console.log(`error: ${JSON.stringify(createData, null, 2)}`)
    fs.writeFileSync('scripts/output/video-i2v-b64-failed.json', JSON.stringify({
      conclusion: '视频 API 不支持 data: URI 格式传图',
      error: createData,
      attempted_data_uri_length: dataUri.length,
    }, null, 2))
    process.exit(1)
  }

  const taskId = (createData.task_id || createData.id || '') as string
  if (!taskId) {
    console.log('\n❌ 无 task_id')
    process.exit(1)
  }
  console.log(`\n✅ task_id=${taskId}`)

  // Step 2: Poll
  console.log(`\n开始轮询 (最多 30 分钟)...`)
  const maxAttempts = 180
  let lastResponse: unknown = null

  for (let i = 1; i <= maxAttempts; i++) {
    await new Promise(r => setTimeout(r, 10000))
    const pollRes = await fetch(`${BASE}/videos/${taskId}`, {
      headers: { 'Authorization': `Bearer ${KEY}` },
      signal: AbortSignal.timeout(15000),
    })
    const data = await pollRes.json() as Record<string, unknown>
    lastResponse = data
    const status = (data.status || '?') as string
    process.stdout.write(`\r  poll #${i}: status=${status} | progress=${data.progress ?? '?'}%`)

    if (status === 'completed' || status === 'succeeded' || status === 'success') {
      const videoUrl = (data.video_url || data.url || data.output_url || data.remixed_from_video_id || '') as string
      console.log(`\n\n✅ Case C 完成!`)
      console.log(`task_id:   ${taskId}`)
      console.log(`status:    ${status}`)
      console.log(`video_url: ${videoUrl}`)
      fs.writeFileSync('scripts/output/video-i2v-b64-result.json', JSON.stringify({ task_id: taskId, status, video_url: videoUrl, response: data }, null, 2))
      return
    }
    if (status === 'failed' || status === 'error') {
      console.log(`\n\n❌ Case C 失败`)
      console.log(`task_id: ${taskId}`)
      console.log(`error: ${JSON.stringify(data, null, 2)}`)
      fs.writeFileSync('scripts/output/video-i2v-b64-failed.json', JSON.stringify({ task_id: taskId, error: data }, null, 2))
      process.exit(1)
    }
  }

  console.log(`\n\n⏰ Case C 轮询超时 (30 min)`)
  console.log(`task_id:       ${taskId}`)
  console.log(`最后 status:    ${(lastResponse as Record<string,unknown>)?.status}`)
  fs.writeFileSync('scripts/output/video-i2v-b64-timeout.json', JSON.stringify({ task_id: taskId, last_response: lastResponse }, null, 2))
  console.log('⚠️  结论: 图生视频(b64)任务创建成功但队列未处理。')
}

main().catch(e => { console.error('\n❌', e.message); process.exit(1) })
