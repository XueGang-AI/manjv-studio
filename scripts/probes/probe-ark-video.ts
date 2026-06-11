// ============================================
// Ark Video Model Probe — Create Video Tasks
// Model: doubao-seedance-1-5-pro-251215
// Usage: npx tsx scripts/probes/probe-ark-video.ts
// ============================================
import 'dotenv/config'
import fs from 'fs'

const BASE = 'https://ark.cn-beijing.volces.com/api/v3/contents/generations/tasks'
const MODEL = 'doubao-seedance-1-5-pro-251215'
const KEY = process.env.ARK_API_KEY || ''
const TEST_IMAGE_URL = 'https://ark-project.tos-cn-beijing.volces.com/doc_image/seepro_i2v.png'

const reportPath = 'docs/ARK_VIDEO_PARAMS_PROBE_REPORT.md'
const results: string[] = []
let successfulTaskId = ''

function log(msg: string) {
  console.log(msg)
  results.push(msg)
}

function separator(title: string) {
  const line = `\n${'='.repeat(60)}\n  ${title}\n${'='.repeat(60)}`
  log(line)
}

async function apiCall(body: Record<string, unknown>, label: string): Promise<{ status: number; data: Record<string, unknown> }> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }
  if (KEY) {
    headers['Authorization'] = `Bearer ${KEY}`
  } else {
    log('⚠️  未设置 ARK_API_KEY，请设置后重试')
    process.exit(1)
  }

  log(`\n--- ${label} ---`)
  log(`POST ${BASE}`)
  log(`Headers: ${JSON.stringify(headers, null, 2)}`)
  log(`Body: ${JSON.stringify(body, (key, value) => {
    if (key === 'api_key') return '***'
    return value
  }, 2)}`)

  const res = await fetch(BASE, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30000),
  })

  const data = await res.json() as Record<string, unknown>
  log(`Status: ${res.status}`)
  log(`Response: ${JSON.stringify(data, null, 2)}`)

  return { status: res.status, data }
}

function extractTaskId(data: Record<string, unknown>): string {
  // Try all possible locations for task_id in the response
  const id = (data.task_id
    || data.id
    || (data.data as Record<string, unknown>)?.task_id
    || (data.data as Record<string, unknown>)?.id
    || '') as string
  return id
}

function isSuccess(status: number, data: Record<string, unknown>): boolean {
  return status >= 200 && status < 300 && (!!data.task_id || !!data.id || !!(data.data as Record<string, unknown>)?.task_id || !!(data.data as Record<string, unknown>)?.id)
}

async function main() {
  log('🎬 Ark Video Model Probe — Create Video Tasks')
  log(`Model: ${MODEL}`)
  log(`Endpoint: ${BASE}`)
  log(`Test Image: ${TEST_IMAGE_URL}`)
  log(`Time: ${new Date().toISOString()}`)

  // ============================================================
  // TEST 1: TASK CREATION FORMAT — Case A (content array format)
  // ============================================================
  separator('TEST 1A: content array format')

  const body1A = {
    model: MODEL,
    content: [
      { type: 'text', text: 'A young woman walking through a rainy city street at night, cinematic lighting, slow push-in camera movement' },
      { type: 'image_url', image_url: { url: TEST_IMAGE_URL } },
    ],
  }
  const res1A = await apiCall(body1A, 'Case A: content array')
  const taskId1A = extractTaskId(res1A.data)
  if (isSuccess(res1A.status, res1A.data)) {
    log(`✅ Case A (content array) SUCCEEDED. task_id found at: ${res1A.data.task_id ? 'data.task_id' : res1A.data.id ? 'data.id' : 'data.data.task_id'}`)
    log(`task_id: ${taskId1A}`)
    if (!successfulTaskId) successfulTaskId = taskId1A
  } else {
    log(`❌ Case A (content array) FAILED (status ${res1A.status})`)
  }

  // ============================================================
  // TEST 1: TASK CREATION FORMAT — Case B (prompt + images format)
  // ============================================================
  separator('TEST 1B: prompt + images format')

  const body1B = {
    model: MODEL,
    prompt: 'A young woman walking through a rainy city street at night, cinematic lighting, slow push-in camera movement',
    images: [TEST_IMAGE_URL],
  }
  const res1B = await apiCall(body1B, 'Case B: prompt + images')
  const taskId1B = extractTaskId(res1B.data)
  if (isSuccess(res1B.status, res1B.data)) {
    log(`✅ Case B (prompt + images) SUCCEEDED. task_id found at: ${res1B.data.task_id ? 'data.task_id' : res1B.data.id ? 'data.id' : 'data.data.task_id'}`)
    log(`task_id: ${taskId1B}`)
    if (!successfulTaskId) successfulTaskId = taskId1B
  } else {
    log(`❌ Case B (prompt + images) FAILED (status ${res1B.status})`)
  }

  // Determine which format works
  const workingFormat = isSuccess(res1A.status, res1A.data) ? 'content_array' : isSuccess(res1B.status, res1B.data) ? 'prompt_images' : 'none'
  log(`\n🔍 WORKING FORMAT: ${workingFormat}`)

  if (workingFormat === 'none') {
    log('❌ Neither format works. Aborting remaining tests.')
    writeReport()
    return
  }

  // Build base body using working format
  const buildBody = (overrides: Record<string, unknown>): Record<string, unknown> => {
    if (workingFormat === 'content_array') {
      return {
        model: MODEL,
        content: [
          { type: 'text', text: 'A young woman walking through a rainy city street at night, cinematic lighting, slow push-in camera movement' },
          { type: 'image_url', image_url: { url: TEST_IMAGE_URL } },
        ],
        ...overrides,
      }
    } else {
      return {
        model: MODEL,
        prompt: 'A young woman walking through a rainy city street at night, cinematic lighting, slow push-in camera movement',
        images: [TEST_IMAGE_URL],
        ...overrides,
      }
    }
  }

  // ============================================================
  // TEST 2: VIDEO PARAMS — Test individual parameters
  // ============================================================
  separator('TEST 2: VIDEO PARAMETERS')

  const paramTests: Array<{ label: string; params: Record<string, unknown> }> = [
    { label: 'duration=5', params: { duration: 5 } },
    { label: 'ratio="9:16"', params: { ratio: '9:16' } },
    { label: 'resolution="480p"', params: { resolution: '480p' } },
    { label: 'fps=24', params: { fps: 24 } },
    { label: 'watermark=false', params: { watermark: false } },
    { label: 'camerafixed=true', params: { camerafixed: true } },
    { label: 'camerafixed=false', params: { camerafixed: false } },
    { label: 'seed=42', params: { seed: 42 } },
  ]

  const acceptedParams: string[] = []
  const rejectedParams: string[] = []

  for (const test of paramTests) {
    const body = buildBody(test.params)
    const res = await apiCall(body, `Param test: ${test.label}`)
    if (isSuccess(res.status, res.data)) {
      const tid = extractTaskId(res.data)
      log(`✅ ${test.label} ACCEPTED (task_id: ${tid})`)
      acceptedParams.push(test.label)
      if (!successfulTaskId) successfulTaskId = tid
    } else {
      log(`❌ ${test.label} REJECTED`)
      rejectedParams.push(test.label)
    }
  }

  log(`\n📋 ACCEPTED params: ${acceptedParams.join(', ') || '(none)'}`)
  log(`📋 REJECTED params: ${rejectedParams.join(', ') || '(none)'}`)

  // ============================================================
  // TEST 3: AUDIO — Test generate_audio: true
  // ============================================================
  separator('TEST 3: AUDIO (generate_audio=true)')

  const body3 = buildBody({ generate_audio: true })
  const res3 = await apiCall(body3, 'generate_audio=true')
  if (isSuccess(res3.status, res3.data)) {
    const tid = extractTaskId(res3.data)
    log(`✅ generate_audio=true ACCEPTED (task_id: ${tid})`)
    acceptedParams.push('generate_audio=true')
    if (!successfulTaskId) successfulTaskId = tid
  } else {
    log(`❌ generate_audio=true REJECTED`)
    rejectedParams.push('generate_audio=true')
  }

  // ============================================================
  // TEST 4: ERROR HANDLING — Send invalid request
  // ============================================================
  separator('TEST 4: ERROR HANDLING')

  const invalidBody = {
    model: MODEL,
    // Missing both content and prompt — should trigger an error
  }
  const res4 = await apiCall(invalidBody, 'Invalid request (no content/prompt)')
  log(`\n📋 Error status: ${res4.status}`)
  log(`📋 Error body structure: ${JSON.stringify(Object.keys(res4.data))}`)
  if (res4.data.error) {
    log(`📋 Error detail: ${JSON.stringify(res4.data.error)}`)
  }
  log(`📋 Full error format logged above`)

  // ============================================================
  // TEST 5: ALL PARAMS COMBINED (best-effort creation)
  // ============================================================
  separator('TEST 5: ALL ACCEPTED PARAMS COMBINED')

  const allParams: Record<string, unknown> = {
    duration: 5,
    ratio: '9:16',
    resolution: '480p',
    fps: 24,
    watermark: false,
    seed: 42,
    generate_audio: true,
  }
  // Only include params that were individually accepted
  const combinedParams: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(allParams)) {
    if (acceptedParams.some(ap => ap.startsWith(key))) {
      combinedParams[key] = value
    }
  }
  // Add camerafixed if accepted
  if (acceptedParams.some(ap => ap.startsWith('camerafixed'))) {
    combinedParams['camerafixed'] = true
  }

  const body5 = buildBody(combinedParams)
  const res5 = await apiCall(body5, 'All accepted params combined')
  if (isSuccess(res5.status, res5.data)) {
    const tid = extractTaskId(res5.data)
    log(`✅ Combined params SUCCEEDED (task_id: ${tid})`)
    successfulTaskId = tid
  } else {
    log(`❌ Combined params FAILED`)
  }

  // ============================================================
  // FINAL: SAVE TASK ID
  // ============================================================
  separator('RESULT: Task ID for Polling')

  if (successfulTaskId) {
    log(`✅ SUCCESSFUL TASK ID: ${successfulTaskId}`)
    log(`\nTo poll this task:`)
    log(`  npx tsx scripts/probes/poll-ark-video-task.ts --task-id ${successfulTaskId}`)

    // Save task_id to file for polling
    const outputDir = 'scripts/output'
    fs.mkdirSync(outputDir, { recursive: true })
    fs.writeFileSync(
      `${outputDir}/ark-video-task.json`,
      JSON.stringify({
        task_id: successfulTaskId,
        model: MODEL,
        working_format: workingFormat,
        created_at: new Date().toISOString(),
      }, null, 2)
    )
    log(`\nSaved task_id to scripts/output/ark-video-task.json`)
  } else {
    log('❌ No successful task created. Cannot proceed to polling.')
  }

  // Write the probe report
  writeReport()
}

function writeReport() {
  const now = new Date().toISOString()
  const reportContent = `# Ark Video Model Parameter Probe Report

**Date:** ${now}
**Model:** ${MODEL}
**Endpoint:** ${BASE}
**Test Image:** ${TEST_IMAGE_URL}

---

## Probe Results (Raw Log)

\`\`\`
${results.join('\n')}
\`\`\`

---

## Summary

- **Successful Task ID:** ${successfulTaskId || '(none created)'}
- **Working Format:** See log above for which of Case A (content array) or Case B (prompt + images) succeeded.

For detailed per-parameter acceptance/rejection, see the probe log above.
`

  const docsDir = 'docs'
  fs.mkdirSync(docsDir, { recursive: true })
  fs.writeFileSync(reportPath, reportContent)
  log(`\n📄 Report written to ${reportPath}`)
}

main().catch(e => {
  log(`\n❌ ${e.message}`)
  console.error(e)
  writeReport()
  process.exit(1)
})
