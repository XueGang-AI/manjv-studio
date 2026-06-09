// ============================================
// Agnes Video Model Probe
// ============================================
import 'dotenv/config'
import fs from 'fs'

const BASE = process.env.AGNES_VIDEO_API_BASE_URL || 'https://apihub.agnes-ai.com/v1'
const KEY = process.env.AGNES_VIDEO_API_KEY || ''
const MODEL = process.env.AGNES_VIDEO_MODEL || 'agnes-video-v2.0'

const MODELS = [MODEL, 'Agnes-Video-2.0', 'agnes-video-v2.0']

async function probeTextToVideo(modelName: string) {
  const endpoint = `${BASE}/videos`
  const body = {
    model: modelName,
    prompt: 'A young Chinese woman standing in a rainy city street at night, slow push-in camera movement, cinematic lighting, Korean manhwa style, high quality',
    duration: 5,
    aspect_ratio: '9:16',
  }
  console.log(`\n🎬 Testing /videos (text-to-video): ${modelName}`)
  const res = await fetch(endpoint, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${KEY}` },
    body: JSON.stringify(body),
  })
  const text = await res.text()
  console.log(`   Status: ${res.status}`)
  if (res.ok) {
    try {
      const data = JSON.parse(text)
      console.log(`   Response keys: ${Object.keys(data).join(', ')}`)
      if (data.id || data.task_id) console.log(`   Task ID: ${data.id || data.task_id}`)
      return { success: true, data }
    } catch { return { success: false, error: text.substring(0, 200) } }
  }
  console.log(`   Response: ${text.substring(0, 300)}`)
  return null
}

async function probeVideoGenerations(modelName: string) {
  const endpoint = `${BASE}/videos/generations`
  const body = {
    model: modelName,
    prompt: 'Slow push-in camera movement, gentle hair motion, cinematic lighting, Korean manhwa style',
    duration: 5,
    aspect_ratio: '9:16',
  }
  console.log(`\n🎬 Testing /videos/generations: ${modelName}`)
  const res = await fetch(endpoint, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${KEY}` },
    body: JSON.stringify(body),
  })
  const text = await res.text()
  console.log(`   Status: ${res.status}`)
  if (res.ok) {
    try {
      const data = JSON.parse(text)
      console.log(`   Response keys: ${Object.keys(data).join(', ')}`)
      return { success: true, data }
    } catch { return null }
  }
  console.log(`   Response: ${text.substring(0, 200)}`)
  return null
}

async function main() {
  console.log('🎯 Agnes Video Model Probe\n')
  console.log(`Base: ${BASE}`)

  for (const model of MODELS) {
    let result = await probeTextToVideo(model)
    if (result?.success) {
      console.log(`\n✅ ${model} /videos works!`)
      fs.writeFileSync('scripts/output/real-api-probes/video-response.json', JSON.stringify(result.data, null, 2).replace(new RegExp(KEY, 'g'), 'API_KEY_HIDDEN'))
      return
    }
    result = await probeVideoGenerations(model)
    if (result?.success) {
      console.log(`\n✅ ${model} /videos/generations works!`)
      return
    }
  }
  console.log('\n❌ All video probes failed')
}

main().catch(console.error)
