// ============================================
// Case A: 纯文生视频（不传 image）
// ============================================
import 'dotenv/config'
import fs from 'fs'

const BASE = process.env.AGNES_VIDEO_API_BASE_URL || 'https://apihub.agnes-ai.com/v1'
const KEY = process.env.AGNES_VIDEO_API_KEY || ''
const MODEL = process.env.AGNES_VIDEO_MODEL || 'agnes-video-v2.0'

async function main() {
  console.log('🎬 Case A: 纯文生视频 (text-to-video)\n')
  console.log(`model:  ${MODEL}`)
  console.log(`base:   ${BASE}`)

  // Step 1: Create
  const body = {
    model: MODEL,
    prompt: 'A cinematic 5-second vertical video of rain falling on a city street at night, slow camera push-in, no text, no watermark',
    duration: 5,
    aspect_ratio: '9:16',
  }
  console.log(`\nPOST /videos`)
  console.log(`body: ${JSON.stringify(body, null, 2)}`)

  const createRes = await fetch(`${BASE}/videos`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${KEY}` },
    body: JSON.stringify(body),
  })

  console.log(`status: ${createRes.status}`)
  const createData = await createRes.json() as Record<string, unknown>
  console.log(`response: ${JSON.stringify(createData, null, 2).substring(0, 500)}`)

  if (!createRes.ok) {
    console.log(`\n❌ 创建失败: ${JSON.stringify(createData)}`)
    process.exit(1)
  }

  const taskId = (createData.task_id || createData.id || '') as string
  if (!taskId) {
    console.log('\n❌ 无 task_id')
    process.exit(1)
  }
  console.log(`\n✅ task_id=${taskId}`)

  // Step 2: Poll up to 30 min
  console.log(`\n开始轮询 (最多 30 分钟)...`)
  const maxAttempts = 180 // 30 min at 10s
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
      const videoUrl = (data.video_url || data.url || data.output_url || '') as string
      console.log(`\n\n✅ Case A 完成!`)
      console.log(`task_id:   ${taskId}`)
      console.log(`status:    ${status}`)
      console.log(`video_url: ${videoUrl}`)
      fs.writeFileSync('scripts/output/video-t2v-result.json', JSON.stringify({ task_id: taskId, status, video_url: videoUrl, response: data }, null, 2))
      return
    }
    if (status === 'failed' || status === 'error') {
      console.log(`\n\n❌ Case A 失败`)
      console.log(`task_id: ${taskId}`)
      console.log(`response: ${JSON.stringify(data, null, 2)}`)
      fs.writeFileSync('scripts/output/video-t2v-failed.json', JSON.stringify({ task_id: taskId, error: data }, null, 2))
      process.exit(1)
    }
  }

  console.log(`\n\n⏰ Case A 轮询超时 (30 min)`)
  console.log(`task_id:       ${taskId}`)
  console.log(`最后 status:    ${(lastResponse as Record<string,unknown>)?.status}`)
  fs.writeFileSync('scripts/output/video-t2v-timeout.json', JSON.stringify({ task_id: taskId, last_response: lastResponse }, null, 2))
  console.log('⚠️  结论: 纯文生视频任务创建成功但队列未处理。')
}

main().catch(e => { console.error('\n❌', e.message); process.exit(1) })
