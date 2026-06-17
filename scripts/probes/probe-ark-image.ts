// ============================================
// Ark Image Model Probe
// Tests doubao-seedream-5-0-260128 via
// POST https://ark.cn-beijing.volces.com/api/v3/images/generations
// ============================================
import { config } from 'dotenv'
config()

const BASE = process.env.ARK_API_BASE_URL || 'https://ark.cn-beijing.volces.com/api/v3'
const KEY = process.env.ARK_API_KEY || ''
const MODEL = process.env.ARK_IMAGE_MODEL || 'doubao-seedream-5-0-260128'
const ENDPOINT = `${BASE}/images/generations`

const TEST_IMAGE_URL = 'https://ark-project.tos-cn-beijing.volces.com/doc_image/seepro_i2v.png'

interface TestResult {
  test: string
  status: number
  success: boolean
  findings: string[]
  requestBody: unknown
  responsePreview: string
}

const results: TestResult[] = []

function logResult(r: TestResult) {
  console.log(`\n${'='.repeat(60)}`)
  console.log(`Test: ${r.test}`)
  console.log(`   Status: ${r.status}`)
  console.log(`   Success: ${r.success ? 'YES' : 'NO'}`)
  console.log(`   Request body (no key): ${JSON.stringify(r.requestBody, null, 2).substring(0, 500)}`)
  console.log(`   Response preview: ${r.responsePreview.substring(0, 400)}`)
  console.log(`   Findings:`)
  r.findings.forEach((f) => console.log(`     - ${f}`))
}

function sanitizeBody(body: Record<string, unknown>): Record<string, unknown> {
  const s = { ...body }
  if (s.prompt && typeof s.prompt === 'object') {
    s.prompt = '[multimodal prompt array]'
  }
  return s
}

async function doFetch(body: Record<string, unknown>, testName: string): Promise<TestResult> {
  console.log(`\nRunning: ${testName}`)
  console.log(`   Endpoint: ${ENDPOINT}`)
  console.log(`   Model: ${MODEL}`)

  const sanitizedBody = sanitizeBody(body)
  const findings: string[] = []

  try {
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${KEY}`,
      },
      body: JSON.stringify(body),
    })

    const text = await res.text()
    let data: Record<string, unknown> | null = null

    try {
      data = JSON.parse(text)
    } catch {
      findings.push('Response is not valid JSON')
    }

    if (res.ok && data) {
      findings.push(`Response keys: ${Object.keys(data).join(', ')}`)

      // Check data array
      if (Array.isArray(data.data)) {
        findings.push(`data[] length: ${data.data.length}`)
        data.data.forEach((item: Record<string, unknown>, i: number) => {
          if (item.url) findings.push(`data[${i}].url: ${String(item.url).substring(0, 120)}`)
          if (item.b64_json) findings.push(`data[${i}].b64_json present, length: ${String(item.b64_json).length}`)
          if (item.seed !== undefined) findings.push(`data[${i}].seed: ${item.seed}`)
          const extraKeys = Object.keys(item).filter(k => !['url', 'b64_json', 'seed', 'revised_prompt'].includes(k))
          if (extraKeys.length > 0) findings.push(`data[${i}] extra keys: ${extraKeys.join(', ')}`)
        })
      } else {
        findings.push(`data is not an array, type: ${typeof data.data}`)
      }

      // Check for seed at top level
      if (data.seed !== undefined) findings.push(`Top-level seed: ${data.seed}`)
      if (data.created) findings.push(`created: ${data.created}`)
    } else if (data) {
      findings.push(`HTTP ${res.status}: ${JSON.stringify(data).substring(0, 300)}`)
    } else {
      findings.push(`HTTP ${res.status}: ${text.substring(0, 300)}`)
    }

    const result: TestResult = {
      test: testName,
      status: res.status,
      success: res.ok,
      findings,
      requestBody: sanitizedBody,
      responsePreview: text.substring(0, 800),
    }
    results.push(result)
    logResult(result)
    return result
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    const result: TestResult = {
      test: testName,
      status: 0,
      success: false,
      findings: [`Network/fetch error: ${msg}`],
      requestBody: sanitizedBody,
      responsePreview: '',
    }
    results.push(result)
    logResult(result)
    return result
  }
}

// ============================================
// Test 1: MULTI-IMAGE PARAM
// Which one returns multiple images?
// ============================================
async function testMultiImageParam() {
  const baseBody = {
    model: MODEL,
    prompt: 'A cute cat sitting on a table, digital art style',
  }

  // Case A: n=4
  await doFetch({ ...baseBody, n: 4 }, '1A: Multi-image with n=4')

  // Case B: num_outputs=4
  await doFetch({ ...baseBody, num_outputs: 4 }, '1B: Multi-image with num_outputs=4')

  // Case C: sequential_image_generation
  await doFetch({
    ...baseBody,
    sequential_image_generation: 'auto',
    sequential_image_generation_options: { max_images: 4 },
  }, '1C: Multi-image with sequential_image_generation')
}

// ============================================
// Test 2: REFERENCE IMAGE FIELD
// Which format works for reference images?
// ============================================
async function testReferenceImageField() {
  const baseBody = {
    model: MODEL,
    prompt: 'A cat in the same style as the reference, sitting on a table',
  }

  // Case A: image as string
  await doFetch({ ...baseBody, image: TEST_IMAGE_URL }, '2A: Reference image as string (image)')

  // Case B: image as array
  await doFetch({ ...baseBody, image: [TEST_IMAGE_URL] }, '2B: Reference image as array (image)')

  // Case C: reference_images as array
  await doFetch({ ...baseBody, reference_images: [TEST_IMAGE_URL] }, '2C: Reference image as reference_images array')

  // Case D: multimodal prompt with image_url
  await doFetch({
    ...baseBody,
    prompt: [
      { type: 'text', text: 'A cat in the same style as the reference, sitting on a table' },
      { type: 'image_url', image_url: { url: TEST_IMAGE_URL } },
    ],
  }, '2D: Reference image via multimodal prompt')
}

// ============================================
// Test 3: REFERENCE + MULTI
// When passing a reference image AND asking for multiple outputs,
// do you still get multiple images? Or only 1?
// ============================================
async function testReferencePlusMulti() {
  // Use whichever reference format worked (reference_images) + num_outputs=4
  await doFetch({
    model: MODEL,
    prompt: 'A cat sitting on a table, digital art style',
    reference_images: [TEST_IMAGE_URL],
    num_outputs: 4,
  }, '3A: reference_images + num_outputs=4')

  // Also try with n=4
  await doFetch({
    model: MODEL,
    prompt: 'A cat sitting on a table, digital art style',
    reference_images: [TEST_IMAGE_URL],
    n: 4,
  }, '3B: reference_images + n=4')

  // Try with sequential
  await doFetch({
    model: MODEL,
    prompt: 'A cat sitting on a table, digital art style',
    reference_images: [TEST_IMAGE_URL],
    sequential_image_generation: 'auto',
    sequential_image_generation_options: { max_images: 4 },
  }, '3C: reference_images + sequential_image_generation')
}

// ============================================
// Test 4: SIZE / ASPECT_RATIO
// Which ones work?
// ============================================
async function testSizeAndAspectRatio() {
  const baseBody = {
    model: MODEL,
    prompt: 'A cute cat sitting on a table, digital art style',
  }

  await doFetch({ ...baseBody, size: '2K' }, '4A: size="2K"')

  await doFetch({ ...baseBody, size: '1080x1920' }, '4B: size="1080x1920"')

  await doFetch({ ...baseBody, aspect_ratio: '9:16' }, '4C: aspect_ratio="9:16"')
}

// ============================================
// Test 5: NEGATIVE_PROMPT
// Accepted or rejected?
// ============================================
async function testNegativePrompt() {
  await doFetch({
    model: MODEL,
    prompt: 'A cute cat sitting on a table, digital art style',
    negative_prompt: 'ugly, deformed, blurry, low quality',
  }, '5: negative_prompt field')

  // Also try without negative_prompt to compare
  await doFetch({
    model: MODEL,
    prompt: 'A cute cat sitting on a table, digital art style',
  }, '5b: Baseline (no negative_prompt) for comparison')
}

// ============================================
// Test 6: RESPONSE FORMAT
// Where is image URL? data[].url? Is there a seed field?
// ============================================
async function testResponseFormat() {
  // This test re-uses data from previous tests; we'll analyze in the report
  // But also make a dedicated call with response_format=b64_json to see if both are returned
  await doFetch({
    model: MODEL,
    prompt: 'A cute cat sitting on a table, digital art style',
    response_format: 'b64_json',
    n: 1,
  }, '6A: response_format=b64_json (check url + b64_json)')

  await doFetch({
    model: MODEL,
    prompt: 'A cute cat sitting on a table, digital art style',
    response_format: 'url',
    n: 1,
  }, '6B: response_format=url (default)')
}

// ============================================
// Generate Markdown Report
// ============================================
function generateReport(): string {
  const lines: string[] = []
  lines.push('# Ark Image Model Probe Report')
  lines.push('')
  lines.push(`**Date:** ${new Date().toISOString().split('T')[0]}`)
  lines.push(`**Model:** ${MODEL}`)
  lines.push(`**Endpoint:** ${ENDPOINT}`)
  lines.push(`**API Base:** ${BASE}`)
  lines.push('')
  lines.push('## Summary Table')
  lines.push('')
  lines.push('| # | Test | Status | Success | Key Finding |')
  lines.push('|---|------|--------|---------|-------------|')

  results.forEach((r, i) => {
    const statusStr = r.status === 0 ? 'NET_ERR' : r.status.toString()
    const successIcon = r.success ? 'YES' : 'NO'
    const keyFinding = r.findings[0] || 'N/A'
    lines.push(`| ${i + 1} | ${r.test} | ${statusStr} | ${successIcon} | ${keyFinding} |`)
  })

  lines.push('')
  lines.push('## Detailed Findings')
  lines.push('')

  results.forEach((r, i) => {
    lines.push(`### ${i + 1}. ${r.test}`)
    lines.push('')
    lines.push(`- **HTTP Status:** ${r.status === 0 ? 'Network Error' : r.status}`)
    lines.push(`- **Success:** ${r.success ? 'Yes' : 'No'}`)
    lines.push('')
    lines.push('**Findings:**')
    r.findings.forEach((f) => lines.push(`- ${f}`))
    lines.push('')
    lines.push('**Request Body (sanitized):**')
    lines.push('```json')
    lines.push(JSON.stringify(r.requestBody, null, 2))
    lines.push('```')
    lines.push('')
    lines.push('**Response Preview:**')
    lines.push('```json')
    lines.push(r.responsePreview.substring(0, 1000))
    lines.push('```')
    lines.push('')
  })

  lines.push('## Overall Assessment')
  lines.push('')

  const allHttpOk = results.every((r) => r.status >= 200 && r.status < 300)
  const allSuccess = results.every((r) => r.success)
  lines.push(`- All HTTP requests successful: ${allHttpOk ? 'Yes' : 'No'}`)
  lines.push(`- All tests passed: ${allSuccess ? 'Yes' : 'No'}`)
  lines.push(`- Tests run: ${results.length}`)
  lines.push(`- Tests passed: ${results.filter((r) => r.success).length}`)
  lines.push(`- Tests failed: ${results.filter((r) => !r.success).length}`)
  lines.push('')

  lines.push('## Key Conclusions')
  lines.push('')

  // Analyze results for conclusions
  const test1A = results.find(r => r.test === '1A: Multi-image with n=4')
  const test1B = results.find(r => r.test === '1B: Multi-image with num_outputs=4')
  const test1C = results.find(r => r.test === '1C: Multi-image with sequential_image_generation')
  const test2A = results.find(r => r.test === '2A: Reference image as string (image)')
  const test2B = results.find(r => r.test === '2B: Reference image as array (image)')
  const test2C = results.find(r => r.test === '2C: Reference image as reference_images array')
  const test2D = results.find(r => r.test === '2D: Reference image via multimodal prompt')
  const test3A = results.find(r => r.test === '3A: reference_images + num_outputs=4')
  const test3B = results.find(r => r.test === '3B: reference_images + n=4')
  const test3C = results.find(r => r.test === '3C: reference_images + sequential_image_generation')
  const test4A = results.find(r => r.test === '4A: size="2K"')
  const test4B = results.find(r => r.test === '4B: size="1080x1920"')
  const test4C = results.find(r => r.test === '4C: aspect_ratio="9:16"')
  const test5 = results.find(r => r.test === '5: negative_prompt field')
  const test6A = results.find(r => r.test === '6A: response_format=b64_json (check url + b64_json)')
  const test6B = results.find(r => r.test === '6B: response_format=url (default)')

  // 1. Multi-image param
  const nWorks = test1A?.findings.some(f => f.includes('length:') && !f.includes('length: 1'))
  const numOutputsWorks = test1B?.findings.some(f => f.includes('length:') && !f.includes('length: 1'))
  const seqWorks = test1C?.findings.some(f => f.includes('length:') && !f.includes('length: 1'))

  lines.push('### 1. Multi-Image Parameter')
  if (test1A?.success) {
    const dataLen = test1A.findings.find(f => f.startsWith('data[] length:'))
    lines.push(`- **n=4**: ${dataLen || 'unknown'} — ${nWorks ? 'Returns multiple images' : 'Only returns 1 image'}`)
  } else {
    lines.push(`- **n=4**: Failed (HTTP ${test1A?.status}) — ${test1A?.findings.find(f => f.includes('HTTP')) || 'unknown error'}`)
  }
  if (test1B?.success) {
    const dataLen = test1B.findings.find(f => f.startsWith('data[] length:'))
    lines.push(`- **num_outputs=4**: ${dataLen || 'unknown'} — ${numOutputsWorks ? 'Returns multiple images' : 'Only returns 1 image'}`)
  } else {
    lines.push(`- **num_outputs=4**: Failed (HTTP ${test1B?.status}) — ${test1B?.findings.find(f => f.includes('HTTP')) || 'unknown error'}`)
  }
  if (test1C?.success) {
    const dataLen = test1C.findings.find(f => f.startsWith('data[] length:'))
    lines.push(`- **sequential_image_generation**: ${dataLen || 'unknown'} — ${seqWorks ? 'Returns multiple images' : 'Only returns 1 image'}`)
  } else {
    lines.push(`- **sequential_image_generation**: Failed (HTTP ${test1C?.status}) — ${test1C?.findings.find(f => f.includes('HTTP')) || 'unknown error'}`)
  }

  // 2. Reference image field
  lines.push('')
  lines.push('### 2. Reference Image Field')
  const refResults = [
    { label: 'image (string)', test: test2A },
    { label: 'image (array)', test: test2B },
    { label: 'reference_images (array)', test: test2C },
    { label: 'multimodal prompt', test: test2D },
  ]
  refResults.forEach(({ label, test }) => {
    if (test?.success) {
      lines.push(`- **${label}**: Works (HTTP ${test.status})`)
    } else {
      const errMsg = test?.findings.find(f => f.includes('HTTP')) || 'unknown error'
      lines.push(`- **${label}**: Failed (HTTP ${test?.status}) — ${errMsg}`)
    }
  })

  // 3. Reference + Multi
  lines.push('')
  lines.push('### 3. Reference + Multiple Outputs')
  if (test3A?.success) {
    const dataLen = test3A.findings.find(f => f.startsWith('data[] length:'))
    lines.push(`- **reference_images + num_outputs=4**: ${dataLen || 'unknown'}`)
  } else {
    lines.push(`- **reference_images + num_outputs=4**: Failed (HTTP ${test3A?.status})`)
  }
  if (test3B?.success) {
    const dataLen = test3B.findings.find(f => f.startsWith('data[] length:'))
    lines.push(`- **reference_images + n=4**: ${dataLen || 'unknown'}`)
  } else {
    lines.push(`- **reference_images + n=4**: Failed (HTTP ${test3B?.status})`)
  }
  if (test3C?.success) {
    const dataLen = test3C.findings.find(f => f.startsWith('data[] length:'))
    lines.push(`- **reference_images + sequential**: ${dataLen || 'unknown'}`)
  } else {
    lines.push(`- **reference_images + sequential**: Failed (HTTP ${test3C?.status})`)
  }

  // 4. Size / Aspect Ratio
  lines.push('')
  lines.push('### 4. Size / Aspect Ratio')
  if (test4A?.success) lines.push(`- **size="2K"**: Works`)
  else lines.push(`- **size="2K"**: Failed (HTTP ${test4A?.status}) — ${test4A?.findings.find(f => f.includes('HTTP')) || ''}`)
  if (test4B?.success) lines.push(`- **size="1080x1920"**: Works`)
  else lines.push(`- **size="1080x1920"**: Failed (HTTP ${test4B?.status}) — ${test4B?.findings.find(f => f.includes('HTTP')) || ''}`)
  if (test4C?.success) lines.push(`- **aspect_ratio="9:16"**: Works`)
  else lines.push(`- **aspect_ratio="9:16"**: Failed (HTTP ${test4C?.status}) — ${test4C?.findings.find(f => f.includes('HTTP')) || ''}`)

  // 5. Negative prompt
  lines.push('')
  lines.push('### 5. Negative Prompt')
  if (test5?.success) {
    lines.push(`- **negative_prompt**: Accepted (HTTP ${test5.status})`)
  } else {
    lines.push(`- **negative_prompt**: Rejected (HTTP ${test5.status}) — ${test5?.findings.find(f => f.includes('HTTP')) || ''}`)
  }

  // 6. Response format
  lines.push('')
  lines.push('### 6. Response Format')
  const allImageResults = results.filter(r => r.success && r.findings.some(f => f.includes('data[]')))
  const hasUrl = allImageResults.some(r => r.findings.some(f => f.includes('.url:')))
  const hasB64 = allImageResults.some(r => r.findings.some(f => f.includes('b64_json')))
  const hasSeed = allImageResults.some(r => r.findings.some(f => f.includes('.seed:') || f.includes('Top-level seed')))

  lines.push(`- **Image URL field**: ${hasUrl ? 'data[].url — present' : 'NOT in data[].url'}`)
  lines.push(`- **Base64 field**: ${hasB64 ? 'data[].b64_json — present when requested' : 'NOT in data[].b64_json'}`)
  lines.push(`- **Seed field**: ${hasSeed ? 'Present (check detailed findings for location)' : 'NOT present'}`)

  if (test6A?.success) {
    lines.push(`- **response_format=b64_json**: Works, check detailed findings for fields`)
  }
  if (test6B?.success) {
    lines.push(`- **response_format=url**: Works, check detailed findings for fields`)
  }

  lines.push('')

  return lines.join('\n')
}

// ============================================
// Main
// ============================================
async function main() {
  console.log('Ark Image Model Probe')
  console.log(`   Model: ${MODEL}`)
  console.log(`   Endpoint: ${ENDPOINT}`)
  console.log(`   API Key: ${KEY ? KEY.substring(0, 15) + '...' : 'NOT SET'}`)
  console.log('')

  if (!KEY) {
    console.error('ARK_API_KEY is not set in environment. Aborting.')
    process.exit(1)
  }

  // Run all tests in sequence
  await testMultiImageParam()
  await testReferenceImageField()
  await testReferencePlusMulti()
  await testSizeAndAspectRatio()
  await testNegativePrompt()
  await testResponseFormat()

  // Generate and save report
  const report = generateReport()
  const fs = await import('fs')
  const reportDir = '/Users/xuegang/Desktop/My Project/manjv-studio/docs'
  fs.mkdirSync(reportDir, { recursive: true })
  const reportPath = `${reportDir}/ARK_IMAGE_PARAMS_PROBE_REPORT.md`
  fs.writeFileSync(reportPath, report, 'utf-8')

  console.log(`\n${'='.repeat(60)}`)
  console.log(`Report saved to: ${reportPath}`)
  console.log(`\nSummary:`)
  console.log(`   Total tests: ${results.length}`)
  console.log(`   Passed: ${results.filter((r) => r.success).length}`)
  console.log(`   Failed: ${results.filter((r) => !r.success).length}`)

  console.log(`\n${'='.repeat(60)}`)
  console.log('REPORT:')
  console.log(report)
}

main().catch((err) => {
  console.error('Fatal error:', err)
  process.exit(1)
})
