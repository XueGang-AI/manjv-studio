// ============================================
// Case B: 图生视频（传图片 URL）
// 需要先有一个真实图片 URL，这里先创建一个图片再传给视频
// ============================================
import 'dotenv/config'
import fs from 'fs'

const BASE = process.env.AGNES_VIDEO_API_BASE_URL || 'https://apihub.agnes-ai.com/v1'
const KEY = process.env.AGNES_VIDEO_API_KEY || ''
const VIDEO_MODEL = process.env.AGNES_VIDEO_MODEL || 'agnes-video-v2.0'
const IMAGE_MODEL = process.env.AGNES_IMAGE_MODEL || 'agnes-image-2.0-flash'
const IMAGE_BASE = process.env.AGNES_IMAGE_API_BASE_URL || 'https://apihub.agnes-ai.com/v1'

async function main() {
  console.log('🎬 Case B: 图生视频（传图片 URL）\n')

  // Step 0: 先生成一张测试图片
  console.log('Step 0: 生成一张测试图片...')
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

  const imgUrl = ((imgData.data as unknown[])?.find(Boolean) as Record<string,unknown>)?.url as string
    || ((imgData.data as unknown[])?.[0] as Record<string,unknown>)?.url as string
    || (imgData as Record<string,unknown>).url as string

  if (!imgUrl) {
    console.log(`❌ 图片 URL 为空, response: ${JSON.stringify(imgData).substring(0, 300)}`)
    process.exit(1)
  }
  console.log(`image_url: ${imgUrl.substring(0, 80)}...`)

  // Step 1: 创建视频任务（传入 image URL）
  console.log(`\nStep 1: POST /videos (i2v with URL)`)
  const body = {
    model: VIDEO_MODEL,
    prompt: 'Slow push-in camera movement, rain falling, cinematic lighting, subtle hair movement, no text, no watermark',
    image: imgUrl,
    duration: 5,
    aspect_ratio: '9:16',
  }
  console.log(`body: ${JSON.stringify({ ...body, image: imgUrl.substring(0, 60) + '...' }, null, 2)}`)

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
      console.log(`\n\n✅ Case B 完成!`)
      console.log(`task_id:   ${taskId}`)
      console.log(`status:    ${status}`)
      console.log(`video_url: ${videoUrl}`)
      fs.writeFileSync('scripts/output/video-i2v-url-result.json', JSON.stringify({ task_id: taskId, status, video_url: videoUrl, input_image_url: imgUrl, response: data }, null, 2))
      return
    }
    if (status === 'failed' || status === 'error') {
      console.log(`\n\n❌ Case B 失败`)
      console.log(`task_id: ${taskId}`)
      console.log(`error: ${JSON.stringify(data, null, 2)}`)
      fs.writeFileSync('scripts/output/video-i2v-url-failed.json', JSON.stringify({ task_id: taskId, input_image_url: imgUrl, error: data }, null, 2))
      process.exit(1)
    }
  }

  console.log(`\n\n⏰ Case B 轮询超时 (30 min)`)
  console.log(`task_id:       ${taskId}`)
  console.log(`input_img_url: ${imgUrl}`)
  console.log(`最后 status:    ${(lastResponse as Record<string,unknown>)?.status}`)
  fs.writeFileSync('scripts/output/video-i2v-url-timeout.json', JSON.stringify({ task_id: taskId, input_img_url: imgUrl, last_response: lastResponse }, null, 2))
  console.log('⚠️  结论: 图生视频(URL)任务创建成功但队列未处理。')
}

main().catch(e => { console.error('\n❌', e.message); process.exit(1) })
