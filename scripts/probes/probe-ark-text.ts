// ============================================
// Ark Text Model Probe
// Tests the configured Ark text model via
// POST https://ark.cn-beijing.volces.com/api/plan/v3/chat/completions
// ============================================
import 'dotenv/config'
import {
  DEFAULT_ARK_API_BASE_URL,
  DEFAULT_ARK_TEXT_MODEL,
  normalizeArkBaseUrl,
} from '../../src/server/model-adapters/model-config'

const BASE = normalizeArkBaseUrl(process.env.ARK_API_BASE_URL || DEFAULT_ARK_API_BASE_URL)
const KEY = process.env.ARK_API_KEY || ''
const MODEL = process.env.ARK_TEXT_MODEL || DEFAULT_ARK_TEXT_MODEL
const ENDPOINT = `${BASE}/chat/completions`

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
  console.log(`📋 Test: ${r.test}`)
  console.log(`   Status: ${r.status}`)
  console.log(`   Success: ${r.success ? '✅ YES' : '❌ NO'}`)
  console.log(`   Request body (no key): ${JSON.stringify(r.requestBody, null, 2).substring(0, 500)}`)
  console.log(`   Response preview: ${r.responsePreview.substring(0, 300)}`)
  console.log(`   Findings:`)
  r.findings.forEach((f) => console.log(`     - ${f}`))
}

// ============================================
// Test 1: Basic chat/completions
// ============================================
async function testBasicChat() {
  const body = {
    model: MODEL,
    messages: [
      { role: 'user', content: '你好！请用一句话介绍你自己。' },
    ],
  }

  console.log(`\n🧪 Running Test 1: Basic chat/completions`)
  console.log(`   Endpoint: ${ENDPOINT}`)
  console.log(`   Model: ${MODEL}`)

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
    const findings: string[] = []

    if (res.ok) {
      try {
        const data = JSON.parse(text)
        const content = data.choices?.[0]?.message?.content
        if (content && typeof content === 'string' && content.length > 0) {
          findings.push(`choices[0].message.content 返回了非空字符串 (${content.length} chars)`)
          findings.push(`Content: "${content.substring(0, 150)}"`)
          findings.push('model 字段返回: ' + (data.model || 'N/A'))
          findings.push('usage 字段: ' + (data.usage ? JSON.stringify(data.usage) : 'N/A'))
          findings.push('finish_reason: ' + (data.choices?.[0]?.finish_reason || 'N/A'))
        } else {
          findings.push('⚠️ choices[0].message.content 为空或不存在')
        }
      } catch {
        findings.push('❌ 响应不是有效的 JSON')
        findings.push('Raw: ' + text.substring(0, 200))
      }
    } else {
      findings.push(`❌ HTTP ${res.status}`)
      findings.push('Body: ' + text.substring(0, 200))
    }

    const result: TestResult = {
      test: 'Basic chat/completions',
      status: res.status,
      success: res.ok,
      findings,
      requestBody: body,
      responsePreview: text.substring(0, 500),
    }
    results.push(result)
    logResult(result)
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    const result: TestResult = {
      test: 'Basic chat/completions',
      status: 0,
      success: false,
      findings: [`Network/fetch error: ${msg}`],
      requestBody: body,
      responsePreview: '',
    }
    results.push(result)
    logResult(result)
  }
}

// ============================================
// Test 2: response_format json_object
// ============================================
async function testJsonObjectFormat() {
  const body = {
    model: MODEL,
    messages: [
      {
        role: 'system',
        content: '你是一个 JSON 输出助手。只输出有效的 JSON，不要包含 markdown 代码块或任何解释。',
      },
      {
        role: 'user',
        content:
          '请返回一个 JSON 对象，包含以下字段：name（字符串"张三"）、age（数字25）、city（字符串"北京"）。只输出 JSON。',
      },
    ],
    response_format: { type: 'json_object' },
  }

  console.log(`\n🧪 Running Test 2: response_format json_object`)

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
    const findings: string[] = []

    if (res.ok) {
      try {
        const data = JSON.parse(text)
        const content = data.choices?.[0]?.message?.content || ''
        findings.push(`原始 content: "${content.substring(0, 200)}"`)

        // Try to parse the content as JSON
        let jsonStr = content.trim()
        // Strip markdown fences if present
        const fenceMatch = jsonStr.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/)
        if (fenceMatch) {
          jsonStr = fenceMatch[1].trim()
          findings.push('检测到 markdown 代码块，已自动剥离')
        }

        try {
          const parsed = JSON.parse(jsonStr)
          findings.push('✅ content 是有效的 JSON')
          findings.push(`Parsed: ${JSON.stringify(parsed)}`)
        } catch {
          findings.push('❌ content 不是有效的 JSON')
          findings.push(`无法解析: "${jsonStr.substring(0, 200)}"`)
        }

        findings.push('response_format json_object 参数被接受')
      } catch {
        findings.push('❌ 响应本身不是有效 JSON')
      }
    } else {
      findings.push(`❌ HTTP ${res.status}`)
      findings.push('Body: ' + text.substring(0, 200))
    }

    const result: TestResult = {
      test: 'response_format json_object',
      status: res.status,
      success: res.ok,
      findings,
      requestBody: body,
      responsePreview: text.substring(0, 500),
    }
    results.push(result)
    logResult(result)
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    const result: TestResult = {
      test: 'response_format json_object',
      status: 0,
      success: false,
      findings: [`Network/fetch error: ${msg}`],
      requestBody: body,
      responsePreview: '',
    }
    results.push(result)
    logResult(result)
  }
}

// ============================================
// Test 3: Tools / function calling
// ============================================
async function testToolsFunctionCalling() {
  const body = {
    model: MODEL,
    messages: [
      { role: 'user', content: '北京今天的天气怎么样？' },
    ],
    tools: [
      {
        type: 'function',
        function: {
          name: 'get_weather',
          description: '获取指定城市的天气信息',
          parameters: {
            type: 'object',
            properties: {
              city: {
                type: 'string',
                description: '城市名称，如 北京、上海',
              },
              unit: {
                type: 'string',
                enum: ['celsius', 'fahrenheit'],
                description: '温度单位',
              },
            },
            required: ['city'],
          },
        },
      },
    ],
    tool_choice: 'auto',
  }

  console.log(`\n🧪 Running Test 3: Tools / function calling`)

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
    const findings: string[] = []

    if (res.ok) {
      try {
        const data = JSON.parse(text)
        const choice = data.choices?.[0]

        if (choice?.message?.tool_calls) {
          findings.push('✅ 模型返回了 tool_calls')
          findings.push(`Tool calls count: ${choice.message.tool_calls.length}`)
          choice.message.tool_calls.forEach((tc: unknown, i: number) => {
            const tcObj = tc as Record<string, unknown>
            findings.push(
              `  [${i}] function: ${tcObj.function?.name || 'N/A'}, args: ${JSON.stringify(tcObj.function?.arguments || 'N/A').substring(0, 150)}`
            )
          })
          findings.push('finish_reason: ' + (choice.finish_reason || 'N/A'))
        } else if (choice?.message?.content) {
          findings.push('⚠️ 模型返回了文本而非 tool_calls')
          findings.push(`Content: "${choice.message.content.substring(0, 200)}"`)
          findings.push('tools 参数被接受但模型选择了直接回复')
        } else {
          findings.push('⚠️ 既无 tool_calls 也无 content')
        }

        findings.push('tools 参数格式（OpenAI 兼容）被接受')
      } catch {
        findings.push('❌ 响应不是有效 JSON')
      }
    } else {
      findings.push(`❌ HTTP ${res.status}`)
      findings.push('Body: ' + text.substring(0, 300))
    }

    const result: TestResult = {
      test: 'Tools / function calling',
      status: res.status,
      success: res.ok,
      findings,
      requestBody: {
        ...body,
        tools: '[1 function tool: get_weather]',
      },
      responsePreview: text.substring(0, 500),
    }
    results.push(result)
    logResult(result)
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    const result: TestResult = {
      test: 'Tools / function calling',
      status: 0,
      success: false,
      findings: [`Network/fetch error: ${msg}`],
      requestBody: { ...body, tools: '[1 function tool: get_weather]' },
      responsePreview: '',
    }
    results.push(result)
    logResult(result)
  }
}

// ============================================
// Test 4: temperature and max_tokens
// ============================================
async function testTemperatureAndMaxTokens() {
  const body = {
    model: MODEL,
    messages: [
      { role: 'user', content: '说"hello"' },
    ],
    temperature: 0.1,
    max_tokens: 50,
  }

  console.log(`\n🧪 Running Test 4: temperature and max_tokens`)

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
    const findings: string[] = []

    if (res.ok) {
      try {
        const data = JSON.parse(text)
        const content = data.choices?.[0]?.message?.content || ''
        const usage = data.usage || {}
        findings.push(`Content: "${content.substring(0, 100)}"`)
        findings.push(`Content length: ${content.length} chars`)
        findings.push(`Usage: ${JSON.stringify(usage)}`)
        findings.push(`temperature=0.1 被接受`)
        findings.push(`max_tokens=50 被接受`)

        // Check if output was roughly bounded by max_tokens
        const completionTokens = usage.completion_tokens || 0
        if (completionTokens > 0 && completionTokens <= 60) {
          findings.push(`✅ completion_tokens (${completionTokens}) 在 max_tokens=50 附近，限制生效`)
        } else if (completionTokens > 60) {
          findings.push(`⚠️ completion_tokens=${completionTokens} 超过 max_tokens=50，限制可能未生效`)
        }
      } catch {
        findings.push('❌ 响应不是有效 JSON')
      }
    } else {
      findings.push(`❌ HTTP ${res.status}`)
      findings.push('Body: ' + text.substring(0, 200))
    }

    const result: TestResult = {
      test: 'temperature and max_tokens',
      status: res.status,
      success: res.ok,
      findings,
      requestBody: body,
      responsePreview: text.substring(0, 500),
    }
    results.push(result)
    logResult(result)
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    const result: TestResult = {
      test: 'temperature and max_tokens',
      status: 0,
      success: false,
      findings: [`Network/fetch error: ${msg}`],
      requestBody: body,
      responsePreview: '',
    }
    results.push(result)
    logResult(result)
  }
}

// ============================================
// Test 5: JSON output via prompt constraint only
// ============================================
async function testJsonViaPromptOnly() {
  const body = {
    model: MODEL,
    messages: [
      {
        role: 'system',
        content: '你是一个严格的 JSON 输出助手。你的回复必须是纯 JSON，不要包含任何 markdown、代码块标记或解释文字。',
      },
      {
        role: 'user',
        content:
          '请生成一个 JSON 对象，包含以下字段：{"status": "ok", "count": 42, "items": ["apple", "banana", "cherry"]}。只输出 JSON，不要输出其他任何内容。',
      },
    ],
  }

  console.log(`\n🧪 Running Test 5: JSON via prompt constraint only (no response_format)`)

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
    const findings: string[] = []

    if (res.ok) {
      try {
        const data = JSON.parse(text)
        const content = data.choices?.[0]?.message?.content || ''
        findings.push(`原始 content: "${content.substring(0, 200)}"`)

        let jsonStr = content.trim()
        const fenceMatch = jsonStr.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/)
        if (fenceMatch) {
          jsonStr = fenceMatch[1].trim()
          findings.push('⚠️ 检测到 markdown 代码块，模型未完全遵从纯 JSON 指令')
        }

        try {
          const parsed = JSON.parse(jsonStr)
          findings.push('✅ content 是有效的 JSON')
          findings.push(`Parsed: ${JSON.stringify(parsed)}`)
        } catch {
          findings.push('❌ content 不是有效的 JSON（仅通过 prompt 约束）')
        }

        findings.push('未使用 response_format，仅靠 prompt 指令')
      } catch {
        findings.push('❌ 响应本身不是有效 JSON')
      }
    } else {
      findings.push(`❌ HTTP ${res.status}`)
      findings.push('Body: ' + text.substring(0, 200))
    }

    const result: TestResult = {
      test: 'JSON via prompt constraint only',
      status: res.status,
      success: res.ok,
      findings,
      requestBody: body,
      responsePreview: text.substring(0, 500),
    }
    results.push(result)
    logResult(result)
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    const result: TestResult = {
      test: 'JSON via prompt constraint only',
      status: 0,
      success: false,
      findings: [`Network/fetch error: ${msg}`],
      requestBody: body,
      responsePreview: '',
    }
    results.push(result)
    logResult(result)
  }
}

// ============================================
// Generate Markdown Report
// ============================================
function generateReport(): string {
  const lines: string[] = []
  lines.push('# Ark Text Model Probe Report')
  lines.push('')
  lines.push(`**Date:** ${new Date().toISOString().split('T')[0]}`)
  lines.push(`**Model:** ${MODEL}`)
  lines.push(`**Endpoint:** ${ENDPOINT}`)
  lines.push(`**API Base:** ${BASE}`)
  lines.push('')
  lines.push('## Summary Table')
  lines.push('')
  lines.push('| # | Test | Status | Success | Key Findings |')
  lines.push('|---|------|--------|---------|-------------|')

  results.forEach((r, i) => {
    const statusEmoji = r.status === 0 ? 'NET_ERR' : r.status.toString()
    const successIcon = r.success ? '✅' : '❌'
    const keyFinding = r.findings[0] || 'N/A'
    lines.push(`| ${i + 1} | ${r.test} | ${statusEmoji} | ${successIcon} | ${keyFinding} |`)
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
    lines.push('```')
    lines.push(r.responsePreview.substring(0, 1000))
    lines.push('```')
    lines.push('')
  })

  lines.push('## Overall Assessment')
  lines.push('')
  const allHttpOk = results.every((r) => r.status >= 200 && r.status < 300)
  const allSuccess = results.every((r) => r.success)
  lines.push(`- All HTTP requests successful: ${allHttpOk ? '✅ Yes' : '❌ No'}`)
  lines.push(`- All tests passed: ${allSuccess ? '✅ Yes' : '❌ No'}`)
  lines.push(`- Tests run: ${results.length}`)
  lines.push(`- Tests passed: ${results.filter((r) => r.success).length}`)
  lines.push(`- Tests failed: ${results.filter((r) => !r.success).length}`)
  lines.push('')

  return lines.join('\n')
}

// ============================================
// Main
// ============================================
async function main() {
  console.log('🎯 Ark Text Model Probe')
  console.log(`   Model: ${MODEL}`)
  console.log(`   Endpoint: ${ENDPOINT}`)
  console.log(`   API Key: ${KEY ? 'SET' : 'NOT SET'}`)
  console.log('')

  if (!KEY) {
    console.error('❌ ARK_API_KEY is not set in environment. Aborting.')
    process.exit(1)
  }

  await testBasicChat()
  await testJsonObjectFormat()
  await testToolsFunctionCalling()
  await testTemperatureAndMaxTokens()
  await testJsonViaPromptOnly()

  // Generate and save report
  const report = generateReport()
  const fs = await import('fs')
  const reportDir = '/Users/xuegang/Desktop/My Project/manjv-studio/docs'
  fs.mkdirSync(reportDir, { recursive: true })
  const reportPath = `${reportDir}/ARK_TEXT_PARAMS_PROBE_REPORT.md`
  fs.writeFileSync(reportPath, report, 'utf-8')

  console.log(`\n${'='.repeat(60)}`)
  console.log(`📄 Report saved to: ${reportPath}`)
  console.log(`\n📊 Summary:`)
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
