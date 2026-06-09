// ============================================
// Agnes Image Model Probe
// ============================================
import 'dotenv/config'
import fs from 'fs'

const BASE = process.env.AGNES_IMAGE_API_BASE_URL || 'https://apihub.agnes-ai.com/v1'
const KEY = process.env.AGNES_IMAGE_API_KEY || ''
const MODEL = process.env.AGNES_IMAGE_MODEL || 'agnes-image-2.0-flash'

const MODELS = [MODEL, 'Agnes-Image-2.0-Flash', 'agnes-image-2.0-flash']

async function probeGenerations(modelName: string) {
  const endpoint = `${BASE}/images/generations`
  const body = {
    model: modelName,
    prompt: 'Korean manhwa style, a young Chinese woman with long black hair, standing in rainy city street at night, cinematic lighting, vertical composition 9:16, high quality, 8k',
    n: 1,
    size: '1080x1920',
  }

  console.log(`\n📸 Testing /images/generations: ${modelName}`)
  const res = await fetch(endpoint, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${KEY}` },
    body: JSON.stringify(body),
  })
  const text = await res.text()
  console.log(`   Status: ${res.status}`)
  if (!res.ok) { console.log(`   Response: ${text.substring(0, 300)}`); return null }
  try { return JSON.parse(text) } catch { console.log(`   Raw: ${text.substring(0, 200)}`); return null }
}

async function probeWithAspectRatio(modelName: string) {
  const endpoint = `${BASE}/images/generations`
  const body = {
    model: modelName,
    prompt: 'Korean manhwa style, a young beautiful Chinese woman portrait, soft lighting, elegant, high quality',
    aspect_ratio: '9:16',
    num_outputs: 1,
  }
  console.log(`\n📸 Testing with aspect_ratio: ${modelName}`)
  const res = await fetch(endpoint, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${KEY}` },
    body: JSON.stringify(body),
  })
  const text = await res.text()
  console.log(`   Status: ${res.status}`)
  if (!res.ok) { console.log(`   Response: ${text.substring(0, 200)}`); return null }
  try { return JSON.parse(text) } catch { return null }
}

async function main() {
  console.log('🎯 Agnes Image Model Probe\n')

  for (const model of MODELS) {
    // Try standard generations endpoint
    let result = await probeGenerations(model)
    if (result) {
      console.log(`\n✅ ${model} works!`)
      console.log(`   Response keys: ${Object.keys(result).join(', ')}`)
      if (result.data?.[0]?.url) console.log(`   Image URL: ${result.data[0].url}`)
      if (result.data?.[0]?.b64_json) console.log(`   Base64 (first 50): ${result.data[0].b64_json.substring(0,50)}...`)
      // Save sample
      fs.writeFileSync('scripts/output/real-api-probes/image-response.json', JSON.stringify(result, null, 2).replace(new RegExp(KEY, 'g'), 'API_KEY_HIDDEN'))
      return
    }

    // Try with aspect_ratio
    result = await probeWithAspectRatio(model)
    if (result) {
      console.log(`\n✅ ${model} works with aspect_ratio!`)
      console.log(`   Response keys: ${Object.keys(result).join(', ')}`)
      return
    }
  }
  console.log('\n❌ All image probes failed')
}

main().catch(console.error)
