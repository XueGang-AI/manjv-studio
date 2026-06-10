// ============================================
// Agnes Video V2.0 音频与口型同步能力探针
// 只创建 task，不等待 completed
// ============================================
import 'dotenv/config'
import fs from 'fs'

const BASE = process.env.AGNES_VIDEO_API_BASE_URL || 'https://apihub.agnes-ai.com/v1'
const KEY = process.env.AGNES_VIDEO_API_KEY || ''
const VIDEO_MODEL = process.env.AGNES_VIDEO_MODEL || 'agnes-video-v2.0'
const IMG_BASE = process.env.AGNES_IMAGE_API_BASE_URL || 'https://apihub.agnes-ai.com/v1'
const IMG_MODEL = process.env.AGNES_IMAGE_MODEL || 'agnes-image-2.0-flash'

interface CaseResult {
  case: string
  field_tested: string
  description: string
  httpStatus: number
  taskId: string | null
  error: string | null
  responseKeys: string[]
  verdict: string
}

const results: CaseResult[] = []

function record(c: CaseResult) {
  results.push(c)
  const icon = c.httpStatus === 200 && c.taskId ? '✅' : c.httpStatus === 200 ? '⚠️' : '❌'
  console.log(`${icon} [${c.case}] HTTP ${c.httpStatus} | task_id=${c.taskId || '(none)'} | ${c.verdict}`)
  if (c.error) console.log(`   error: ${c.error.substring(0, 150)}`)
  if (c.responseKeys.length) console.log(`   response keys: ${c.responseKeys.join(', ')}`)
}

async function probe(caseName: string, fieldTested: string, description: string, extraFields: Record<string, unknown>) {
  const body: Record<string, unknown> = {
    model: VIDEO_MODEL,
    prompt: 'A young Chinese woman speaking gently, Korean manhwa style, slow push-in camera, cinematic lighting, high quality, no watermark',
    duration: 5,
    aspect_ratio: '9:16',
    image: TEST_IMAGE_URL,
    ...extraFields,
  }

  try {
    const res = await fetch(`${BASE}/videos`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${KEY}` },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30000),
    })
    const text = await res.text()
    let data: Record<string, unknown> = {}
    let taskId: string | null = null
    let error: string | null = null
    let keys: string[] = []

    try {
      data = JSON.parse(text)
      keys = Object.keys(data)
      taskId = (data.task_id || data.id || null) as string | null
    } catch {
      error = text.substring(0, 300)
    }

    if (!res.ok && !error) {
      error = JSON.stringify(data).substring(0, 300)
    }

    const verdict = res.ok && taskId
      ? '创建任务阶段接受字段'
      : res.ok && !taskId
        ? '200 但无 task_id'
        : `拒绝: ${res.status}`

    record({
      case: caseName, field_tested: fieldTested, description,
      httpStatus: res.status, taskId, error,
      responseKeys: keys, verdict,
    })
  } catch (e) {
    record({
      case: caseName, field_tested: fieldTested, description,
      httpStatus: 0, taskId: null,
      error: (e as Error).message, responseKeys: [],
      verdict: '网络错误',
    })
  }
}

let TEST_IMAGE_URL = ''

async function main() {
  console.log('🎤 Agnes Video V2.0 音频与口型同步探针\n')
  console.log(`Model: ${VIDEO_MODEL}`)
  console.log(`Base:  ${BASE}\n`)

  // Step 0: 生成一张测试图片
  console.log('📷 Step 0: 生成测试图片...')
  const imgRes = await fetch(`${IMG_BASE}/images/generations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `${KEY}` },
    body: JSON.stringify({
      model: IMG_MODEL,
      prompt: 'A young Chinese woman with long black hair, front view portrait, gentle expression, Korean manhwa style, high quality, plain background',
      aspect_ratio: '9:16',
      num_outputs: 1,
      negative_prompt: 'ugly, deformed, low quality, blurry, text, watermark',
    }),
  })
  const imgData = await imgRes.json() as Record<string, unknown>
  TEST_IMAGE_URL = ((imgData.data as unknown[])?.[0] as Record<string, unknown>)?.url as string || ''
  if (!TEST_IMAGE_URL) {
    console.log('❌ 无法获取测试图片 URL'); process.exit(1)
  }
  console.log(`✅ image_url: ${TEST_IMAGE_URL.substring(0, 60)}...\n`)

  // ================================================================
  console.log('='.repeat(60))
  console.log('开始探针测试（仅创建 task）')
  console.log('='.repeat(60) + '\n')

  // Case 1: baseline
  await probe(
    '01_baseline', '-',
    '标准 i2v 请求作为基线',
    {}
  )
  await delay(2000)

  // Case 2: dialogue (text dialogue)
  await probe(
    '02_dialogue', 'dialogue',
    '传入对话文本',
    { dialogue: '你好，今天天气真不错，我们去散步吧。' }
  )
  await delay(2000)

  // Case 3: voice_text
  await probe(
    '03_voice_text', 'voice_text',
    '传入语音文本',
    { voice_text: '你好，今天天气真不错，我们去散步吧。' }
  )
  await delay(2000)

  // Case 4: audio_url
  await probe(
    '04_audio_url', 'audio_url',
    '传入音频 URL（使用公开测试音频）',
    { audio_url: 'https://www.w3schools.com/html/horse.mp3' }
  )
  await delay(2000)

  // Case 5: voice_id
  await probe(
    '05_voice_id', 'voice_id',
    '传入音色 ID',
    { voice_id: 'zh_female_gentle_01' }
  )
  await delay(2000)

  // Case 6: lip_sync flag + audio_url
  await probe(
    '06_lip_sync', 'lip_sync, audio_url',
    '传入 lip_sync=true + audio_url',
    { audio_url: 'https://www.w3schools.com/html/horse.mp3', lip_sync: true }
  )
  await delay(2000)

  // Case 7: generate_audio flag
  await probe(
    '07_generate_audio', 'generate_audio',
    '传入 generate_audio=true',
    { generate_audio: true }
  )
  await delay(2000)

  // ================================================================
  // 报告
  console.log('\n' + '='.repeat(60))
  console.log('📊 探针结果汇总')
  console.log('='.repeat(60) + '\n')

  // Markdown table
  let md = `# Agnes Video V2.0 音频与口型同步探针报告\n\n`
  md += `> 测试时间: ${new Date().toISOString()}\n`
  md += `> 模型: ${VIDEO_MODEL}\n`
  md += `> API Base: ${BASE}\n`
  md += `> 测试图片: ${TEST_IMAGE_URL.substring(0, 60)}...\n\n`
  md += `## 测试结果\n\n`
  md += `| Case | 字段 | HTTP | task_id | 结论 |\n`
  md += `|------|------|------|---------|------|\n`

  for (const r of results) {
    const taskStr = r.taskId ? r.taskId.substring(0, 20) + '...' : '(none)'
    md += `| ${r.case} | \`${r.field_tested}\` | ${r.httpStatus} | ${taskStr} | ${r.verdict} |\n`
  }

  md += `\n## 详细响应\n\n`
  for (const r of results) {
    md += `### ${r.case}: ${r.description}\n\n`
    md += `- **字段**: \`${r.field_tested}\`\n`
    md += `- **HTTP Status**: ${r.httpStatus}\n`
    md += `- **task_id**: \`${r.taskId || '(none)'}\`\n`
    md += `- **结论**: ${r.verdict}\n`
    if (r.error) md += `- **错误**: \`${r.error}\`\n`
    md += `- **响应字段**: ${r.responseKeys.join(', ') || '(none)'}\n\n`
  }

  md += `## 分析\n\n`
  const accepted = results.filter(r => r.httpStatus === 200 && r.taskId)
  const rejected = results.filter(r => r.httpStatus !== 200 || !r.taskId)

  md += `### 被接受的字段 (${accepted.length}/${results.length})\n\n`
  if (accepted.length > 0) {
    md += `| Case | 字段 |\n|------|------|\n`
    for (const r of accepted) {
      md += `| ${r.case} | \`${r.field_tested}\` |\n`
    }
  } else {
    md += `无\n`
  }

  md += `\n### 被拒绝的字段 (${rejected.length}/${results.length})\n\n`
  if (rejected.length > 0) {
    md += `| Case | 字段 | HTTP | 错误 |\n|------|------|------|------|\n`
    for (const r of rejected) {
      md += `| ${r.case} | \`${r.field_tested}\` | ${r.httpStatus} | ${(r.error || '').substring(0, 80)} |\n`
    }
  } else {
    md += `无\n`
  }

  md += `\n## 结论\n\n`
  md += `> ⚠️ 探针仅验证 API 是否**接受**参数（HTTP 200 + 返回 task_id）。\n`
  md += `> **不代表**音频生成成功或口型同步有效。\n`
  md += `> 确认口型同步需要在 task completed 后，通过 ffprobe 检测音频轨 + 人工观看验证。\n\n`

  const audioFields = results.filter(r => r.httpStatus === 200 && r.taskId && r.field_tested !== '-')
  if (audioFields.length > 0) {
    md += `API 额外接受 ${audioFields.length} 个音频/口型相关字段：${audioFields.map(r => '`' + r.field_tested + '`').join(', ')}。\n`
  }
  if (rejected.length > 0) {
    md += `API 拒绝了 ${rejected.length} 个字段：${rejected.map(r => '`' + r.field_tested + '`').join(', ')}。\n`
  }

  fs.writeFileSync('docs/AGNES_VIDEO_AUDIO_LIPSYNC_PROBE_REPORT.md', md)
  console.log('✅ 报告已保存到 docs/AGNES_VIDEO_AUDIO_LIPSYNC_PROBE_REPORT.md\n')

  // Print summary
  console.log(`接受: ${accepted.length}/${results.length}  |  拒绝: ${rejected.length}/${results.length}`)
  for (const r of accepted) {
    console.log(`  ✅ ${r.case}: task_id=${r.taskId?.substring(0, 24)}...`)
  }
  for (const r of rejected) {
    console.log(`  ❌ ${r.case}: HTTP ${r.httpStatus} ${(r.error || '').substring(0, 60)}`)
  }
}

function delay(ms: number) { return new Promise(r => setTimeout(r, ms)) }

main().catch(e => { console.error('❌ Fatal:', e.message); process.exit(1) })
