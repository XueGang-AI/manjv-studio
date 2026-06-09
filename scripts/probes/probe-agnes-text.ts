// ============================================
// Agnes Text Model Probe
// ============================================
import 'dotenv/config'

const BASE = process.env.AGNES_TEXT_API_BASE_URL || 'https://apihub.agnes-ai.com/v1'
const KEY = process.env.AGNES_TEXT_API_KEY || ''
const MODEL = process.env.AGNES_TEXT_MODEL || 'agnes-2.0-flash'
const MODELS_TO_TEST = [MODEL, 'Agnes-2.0-Flash', 'agnes-2.0-flash']

async function probe(modelName: string) {
  const endpoint = `${BASE}/chat/completions`
  const body = {
    model: modelName,
    messages: [
      { role: 'system', content: '你是一个严格输出 JSON 的助手。请只输出 JSON，不要输出 markdown 或解释。' },
      { role: 'user', content: '请返回 {"ok": true, "message": "hello from agnes text model", "timestamp": "' + new Date().toISOString() + '"}，不要输出其他任何内容。' },
    ],
    temperature: 0.2,
    max_tokens: 256,
  }

  console.log(`\n📡 Testing: ${modelName}`)
  console.log(`   Endpoint: ${endpoint}`)

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${KEY}` },
    body: JSON.stringify(body),
  })

  const text = await res.text()
  console.log(`   Status: ${res.status}`)

  if (res.ok) {
    try {
      const data = JSON.parse(text)
      const content = data.choices?.[0]?.message?.content || ''
      console.log(`   Content preview: ${content.substring(0, 200)}`)
      // Try parsing content as JSON
      try {
        let jsonStr = content.trim()
        const m = jsonStr.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/)
        if (m) jsonStr = m[1].trim()
        const parsed = JSON.parse(jsonStr)
        console.log(`   ✅ JSON parsed: ${JSON.stringify(parsed)}`)
        return { success: true, model: modelName, content, parsed }
      } catch {
        console.log(`   ⚠️ Content is not valid JSON`)
        return { success: true, model: modelName, content, parsed: null }
      }
    } catch { return { success: false, error: 'Failed to parse response: ' + text.substring(0, 200) } }
  } else {
    console.log(`   ❌ Error: ${text.substring(0, 300)}`)
    return { success: false, error: text.substring(0, 300) }
  }
}

async function main() {
  console.log('🎯 Agnes Text Model Probe\n')
  console.log(`Base: ${BASE}`)
  console.log(`Key: ${KEY.substring(0, 10)}...`)

  for (const model of MODELS_TO_TEST) {
    const result = await probe(model)
    if (result.success) {
      console.log(`\n✅ ${model} works!`)
      break
    }
  }
}

main().catch(console.error)
