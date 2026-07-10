// ============================================
// Ark Seedance last_frame capability probe
// ============================================
// Usage:
//   npx tsx scripts/probes/probe-ark-last-frame.ts
//   npx tsx scripts/probes/probe-ark-last-frame.ts --wait
//   npx tsx scripts/probes/probe-ark-last-frame.ts --wait --timeout-minutes 10 --model <model>
//
// Purpose:
//   Verify whether the current account + video model accept first_frame + last_frame
//   content roles (aligned with ArkVideoAdapter production payload).
//
// Safety:
//   - Does NOT enable ARK_VIDEO_ENABLE_LAST_FRAME
//   - Never prints API keys / Authorization headers
//   - Writes raw JSON under scripts/output/ (gitignored)
// ============================================

import 'dotenv/config'
import fs from 'fs'
import path from 'path'
import {
  DEFAULT_ARK_API_BASE_URL,
  DEFAULT_ARK_VIDEO_MODEL,
  normalizeArkBaseUrl,
  normalizeArkModelName,
} from '../../src/server/model-adapters/model-config'

// Public Ark sample images (reachable by the remote model fetch path).
// Prefer two distinct doc samples so Case B exercises a real first→last transition.
const FIRST_FRAME_URL =
  process.env.ARK_LAST_FRAME_PROBE_FIRST_IMAGE ||
  'https://ark-project.tos-cn-beijing.volces.com/doc_image/seepro_i2v.png'
const LAST_FRAME_URL =
  process.env.ARK_LAST_FRAME_PROBE_LAST_IMAGE ||
  'https://ark-project.tos-cn-beijing.volces.com/doc_image/seedream4_imageToimage.png'
// Fallback if the configured last-frame sample is unreachable.
const LAST_FRAME_FALLBACK_URL =
  'https://ark-project.tos-cn-beijing.volces.com/doc_image/seepro_i2v.png'

const TERMINAL_OK = new Set(['completed', 'succeeded', 'success', 'done'])
const TERMINAL_FAIL = new Set(['failed', 'error', 'cancelled', 'canceled', 'timeout'])

type CaseId = 'A' | 'B' | 'C' | 'D' | 'E' | 'F'
type Verdict =
  | 'SUPPORTED'
  | 'CREATE_REJECTED'
  | 'CREATE_OK_RUN_FAILED'
  | 'INCONCLUSIVE'

type ProductionAdvice =
  | 'keep_disabled'
  | 'enable_with_match_cut_only'
  | 'enable_requires_model_upgrade'
  | 'retry_probe'

interface CliOptions {
  wait: boolean
  timeoutMinutes: number
  intervalSeconds: number
  model: string
  runCaseF: boolean
  caseFModel: string
}

interface CaseResult {
  id: CaseId
  label: string
  purpose: string
  createStatus: number
  createOk: boolean
  taskId: string
  errorSummary: string
  roles: string[]
  waited: boolean
  finalStatus?: string
  hasVideoUrl?: boolean
  waitSeconds?: number
  waitError?: string
}

interface ProbeReport {
  generatedAt: string
  model: string
  baseUrl: string
  endpoint: string
  apiKeyConfigured: boolean
  waitEnabled: boolean
  firstFrameUrl: string
  lastFrameUrl: string
  cases: CaseResult[]
  verdict: Verdict
  productionAdvice: ProductionAdvice
  notes: string[]
}

function parseArgs(argv: string[]): CliOptions {
  const has = (flag: string) => argv.includes(flag)
  const get = (flag: string, fallback: string) => {
    const idx = argv.indexOf(flag)
    return idx >= 0 && idx + 1 < argv.length ? argv[idx + 1] : fallback
  }

  const modelOverride = get('--model', '')
  const defaultModel = process.env.ARK_VIDEO_MODEL || DEFAULT_ARK_VIDEO_MODEL
  const model = normalizeArkModelName(
    'video',
    modelOverride || defaultModel,
  )

  const caseFModelRaw = get('--case-f-model', '')
  const runCaseF = has('--case-f') || !!caseFModelRaw
  const caseFModel = normalizeArkModelName(
    'video',
    caseFModelRaw || 'doubao-seedance-2-0',
  )

  return {
    wait: has('--wait'),
    timeoutMinutes: Math.max(1, parseInt(get('--timeout-minutes', '10'), 10) || 10),
    intervalSeconds: Math.max(5, parseInt(get('--interval-seconds', '10'), 10) || 10),
    model,
    runCaseF,
    caseFModel,
  }
}

function truncate(text: string, max = 280): string {
  const s = text.replace(/\s+/g, ' ').trim()
  return s.length <= max ? s : `${s.slice(0, max)}…`
}

function extractTaskId(data: Record<string, unknown>): string {
  const nested = data.data as Record<string, unknown> | undefined
  return String(
    data.task_id ||
      data.id ||
      nested?.task_id ||
      nested?.id ||
      '',
  )
}

function extractVideoUrl(data: Record<string, unknown>): string {
  const content = data.content as Record<string, unknown> | undefined
  const nested = data.data as Record<string, unknown> | undefined
  return String(
    content?.video_url ||
      data.video_url ||
      data.url ||
      data.output_url ||
      nested?.video_url ||
      nested?.url ||
      '',
  )
}

function summarizeError(status: number, data: Record<string, unknown>): string {
  const err = data.error
  if (err && typeof err === 'object') {
    const e = err as Record<string, unknown>
    return truncate(
      `http=${status} code=${String(e.code || e.type || '')} message=${String(e.message || JSON.stringify(e))}`,
    )
  }
  if (typeof data.message === 'string') {
    return truncate(`http=${status} message=${data.message}`)
  }
  return truncate(`http=${status} body=${JSON.stringify(data)}`)
}

function isCreateSuccess(status: number, data: Record<string, unknown>): boolean {
  return status >= 200 && status < 300 && !!extractTaskId(data)
}

function looksLikeEnvFailure(summary: string): boolean {
  const s = summary.toLowerCase()
  return (
    s.includes('401') ||
    s.includes('403') ||
    s.includes('unauthorized') ||
    s.includes('authentication') ||
    s.includes('invalid api') ||
    s.includes('quota') ||
    s.includes('balance') ||
    s.includes('rate limit') ||
    s.includes('429') ||
    s.includes('timeout') ||
    s.includes('network') ||
    s.includes('enotfound') ||
    s.includes('fetch failed') ||
    s.includes('image') && s.includes('download')
  )
}

async function createTask(
  endpoint: string,
  apiKey: string,
  body: Record<string, unknown>,
): Promise<{ status: number; data: Record<string, unknown> }> {
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(60_000),
  })

  let data: Record<string, unknown>
  try {
    data = (await res.json()) as Record<string, unknown>
  } catch {
    data = { message: `non-json response status=${res.status}` }
  }
  return { status: res.status, data }
}

async function waitForTask(
  baseEndpoint: string,
  apiKey: string,
  taskId: string,
  timeoutMinutes: number,
  intervalSeconds: number,
): Promise<{ finalStatus: string; hasVideoUrl: boolean; waitSeconds: number; error?: string }> {
  const maxAttempts = Math.max(1, Math.floor((timeoutMinutes * 60) / intervalSeconds))
  const started = Date.now()
  let lastStatus = 'unknown'
  let lastError = ''

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const elapsed = Math.floor((Date.now() - started) / 1000)
    process.stdout.write(`\r    poll #${attempt}/${maxAttempts} elapsed=${elapsed}s status=${lastStatus}   `)

    try {
      const res = await fetch(`${baseEndpoint}/${taskId}`, {
        headers: { Authorization: `Bearer ${apiKey}` },
        signal: AbortSignal.timeout(15_000),
      })
      const data = (await res.json()) as Record<string, unknown>
      lastStatus = String(data.status || 'unknown')

      if (TERMINAL_OK.has(lastStatus.toLowerCase())) {
        process.stdout.write('\n')
        return {
          finalStatus: lastStatus,
          hasVideoUrl: !!extractVideoUrl(data),
          waitSeconds: Math.floor((Date.now() - started) / 1000),
        }
      }

      if (TERMINAL_FAIL.has(lastStatus.toLowerCase())) {
        process.stdout.write('\n')
        return {
          finalStatus: lastStatus,
          hasVideoUrl: false,
          waitSeconds: Math.floor((Date.now() - started) / 1000),
          error: summarizeError(res.status, data),
        }
      }
    } catch (err) {
      lastError = (err as Error).message
      process.stdout.write(` [net: ${truncate(lastError, 40)}]`)
    }

    await new Promise((r) => setTimeout(r, intervalSeconds * 1000))
  }

  process.stdout.write('\n')
  return {
    finalStatus: 'timeout',
    hasVideoUrl: false,
    waitSeconds: Math.floor((Date.now() - started) / 1000),
    error: lastError || `poll timeout after ${timeoutMinutes}m`,
  }
}

function buildBaseBody(
  model: string,
  content: Array<Record<string, unknown>>,
): Record<string, unknown> {
  return {
    model,
    content,
    duration: 5,
    ratio: '9:16',
    resolution: process.env.ARK_VIDEO_RESOLUTION || '720p',
    watermark: false,
  }
}

function textPrompt(extra: string): Record<string, unknown> {
  return {
    type: 'text',
    text: `Cinematic slow push-in, gentle motion, keep subject identity stable. ${extra}`,
  }
}

function imageItem(url: string, role?: string): Record<string, unknown> {
  const item: Record<string, unknown> = {
    type: 'image_url',
    image_url: { url },
  }
  if (role) item.role = role
  return item
}

function collectRoles(content: Array<Record<string, unknown>>): string[] {
  return content
    .filter((c) => c.type === 'image_url')
    .map((c) => String(c.role || '(none)'))
}

function deriveVerdict(cases: CaseResult[]): { verdict: Verdict; advice: ProductionAdvice; notes: string[] } {
  const notes: string[] = []
  const byId = Object.fromEntries(cases.map((c) => [c.id, c])) as Record<CaseId, CaseResult | undefined>
  const a = byId.A
  const b = byId.B
  const f = byId.F

  if (!a) {
    return { verdict: 'INCONCLUSIVE', advice: 'retry_probe', notes: ['Case A missing'] }
  }

  if (!a.createOk) {
    notes.push('Case A (first_frame only) failed — treat as environment/account issue before judging last_frame.')
    if (looksLikeEnvFailure(a.errorSummary)) {
      return { verdict: 'INCONCLUSIVE', advice: 'retry_probe', notes }
    }
    return { verdict: 'INCONCLUSIVE', advice: 'retry_probe', notes }
  }

  if (!b) {
    return { verdict: 'INCONCLUSIVE', advice: 'retry_probe', notes: ['Case B missing'] }
  }

  if (!b.createOk) {
    notes.push('Case B create rejected — first/last frame path not accepted for this model/account.')
    if (f?.createOk) {
      notes.push('Case F succeeded — last_frame may require a different model (e.g. Seedance 2.0).')
      return {
        verdict: 'CREATE_REJECTED',
        advice: 'enable_requires_model_upgrade',
        notes,
      }
    }
    if (looksLikeEnvFailure(b.errorSummary) && !a.createOk) {
      return { verdict: 'INCONCLUSIVE', advice: 'retry_probe', notes }
    }
    // A worked but B rejected → capability/param rejection is the best label
    return {
      verdict: 'CREATE_REJECTED',
      advice: 'keep_disabled',
      notes,
    }
  }

  if (b.waited) {
    if (b.hasVideoUrl && b.finalStatus && TERMINAL_OK.has(b.finalStatus.toLowerCase())) {
      notes.push('Case B create+wait completed with video_url. Production switch still defaults to OFF; enable only after P1-2 policy decision.')
      return {
        verdict: 'SUPPORTED',
        advice: 'enable_with_match_cut_only',
        notes,
      }
    }
    notes.push('Case B create accepted but wait did not complete successfully.')
    return {
      verdict: 'CREATE_OK_RUN_FAILED',
      advice: 'keep_disabled',
      notes,
    }
  }

  notes.push('Case B create accepted (create-only mode). Run with --wait to confirm generation completion.')
  return {
    verdict: 'SUPPORTED',
    advice: 'enable_with_match_cut_only',
    notes,
  }
}

function renderMarkdown(report: ProbeReport): string {
  const caseRows = report.cases
    .map((c) => {
      const waitCol = c.waited
        ? `${c.finalStatus || '-'} / video=${c.hasVideoUrl ? 'yes' : 'no'} / ${c.waitSeconds ?? '-'}s`
        : '(not waited)'
      return `| ${c.id} | ${c.label} | ${c.createOk ? 'yes' : 'no'} | ${c.createStatus} | ${c.taskId ? `\`${c.taskId.slice(0, 12)}…\`` : '-'} | ${waitCol} | ${c.errorSummary || '-'} |`
    })
    .join('\n')

  return `# Ark Seedance last_frame Probe Report

**Generated:** ${report.generatedAt}  
**Model:** \`${report.model}\`  
**Endpoint:** \`${report.endpoint}\`  
**API key configured:** ${report.apiKeyConfigured ? 'yes' : 'no'}  
**Wait mode:** ${report.waitEnabled ? 'yes' : 'no (create-only)'}  

## 中文结论（P0-1）

- **结论：\`${report.verdict}\`**
- **生产建议：\`${report.productionAdvice}\`**
- 生产默认开关仍关闭；即使 SUPPORTED 也不自动设置 \`ARK_VIDEO_ENABLE_LAST_FRAME=true\`。
- 完整 case 表见下文；可复跑：\`npm run probe:ark:video:last-frame -- --wait\`。

## Images

- first_frame: \`${report.firstFrameUrl}\`
- last_frame: \`${report.lastFrameUrl}\`

## Verdict

| Field | Value |
|-------|--------|
| verdict | **${report.verdict}** |
| production_advice | **${report.productionAdvice}** |

> Production default remains **disabled**. Do not set \`ARK_VIDEO_ENABLE_LAST_FRAME=true\` until P1-2 policy review, even if verdict is SUPPORTED.

## Cases

| ID | Label | create_ok | http | task_id | wait | error |
|----|-------|-----------|------|---------|------|-------|
${caseRows}

## Notes

${report.notes.map((n) => `- ${n}`).join('\n') || '- (none)'}

## Code path alignment

| Production path | Expectation after probe |
|-----------------|-------------------------|
| \`ArkVideoAdapter\` sends \`role: last_frame\` only when env flag + \`lastImage\` | Confirmed by Case B payload shape |
| \`reference_image\` not mixed with first/last frame | Case D checks mutual exclusion |
| \`shot-videos.handler\` only fills last frame on \`match_cut\` | Unchanged by this probe |
| Default env | Keep \`ARK_VIDEO_ENABLE_LAST_FRAME\` unset/false |

## How to re-run

\`\`\`bash
npm run probe:ark:video:last-frame
npm run probe:ark:video:last-frame -- --wait
npm run probe:ark:video:last-frame -- --wait --case-f --case-f-model doubao-seedance-2-0
\`\`\`

## Decision matrix

| Result | Advice |
|--------|--------|
| SUPPORTED (+ optional wait ok) | \`enable_with_match_cut_only\` after product decision; still explicit env |
| CREATE_REJECTED | \`keep_disabled\`; consider export-tail-frame alternative in P1-2 |
| CREATE_OK_RUN_FAILED | \`keep_disabled\`; inspect wait error / content policy / image fetch |
| INCONCLUSIVE | \`retry_probe\` after fixing key/network/quota |
`
}

async function main() {
  const opts = parseArgs(process.argv.slice(2))
  const apiKey = process.env.ARK_API_KEY || ''
  const baseUrl = normalizeArkBaseUrl(
    process.env.ARK_VIDEO_API_BASE_URL || process.env.ARK_API_BASE_URL || DEFAULT_ARK_API_BASE_URL,
  )
  const endpoint = `${baseUrl}/contents/generations/tasks`

  console.log('🎬 Ark Seedance last_frame probe')
  console.log(`model:     ${opts.model}`)
  console.log(`endpoint:  ${endpoint}`)
  console.log(`wait:      ${opts.wait}`)
  console.log(`first:     ${FIRST_FRAME_URL}`)
  console.log(`last:      ${LAST_FRAME_URL}`)
  console.log(`time:      ${new Date().toISOString()}`)
  console.log()

  if (!apiKey) {
    console.error('❌ ARK_API_KEY is not set. Add it to .env and retry.')
    process.exit(1)
  }

  // Resolve last-frame image: try preferred URL HEAD; on failure use fallback.
  let lastFrameUrl = LAST_FRAME_URL
  try {
    const head = await fetch(LAST_FRAME_URL, { method: 'HEAD', signal: AbortSignal.timeout(10_000) })
    if (!head.ok) {
      console.log(`⚠️  Preferred last-frame image HTTP ${head.status}, falling back.`)
      lastFrameUrl = LAST_FRAME_FALLBACK_URL
    }
  } catch {
    console.log('⚠️  Preferred last-frame image unreachable, falling back.')
    lastFrameUrl = LAST_FRAME_FALLBACK_URL
  }
  console.log(`last used: ${lastFrameUrl}`)
  console.log()

  type CaseDef = {
    id: CaseId
    label: string
    purpose: string
    model: string
    content: Array<Record<string, unknown>>
    shouldWait: boolean
  }

  const cases: CaseDef[] = [
    {
      id: 'A',
      label: 'first_frame only (baseline)',
      purpose: 'Environment sanity: image-to-video without last_frame',
      model: opts.model,
      content: [
        textPrompt('baseline first frame only'),
        imageItem(FIRST_FRAME_URL, 'first_frame'),
      ],
      shouldWait: opts.wait,
    },
    {
      id: 'B',
      label: 'first_frame + last_frame (core)',
      purpose: 'Core capability: roles match production adapter',
      model: opts.model,
      content: [
        textPrompt('transition toward the last frame composition'),
        imageItem(FIRST_FRAME_URL, 'first_frame'),
        imageItem(lastFrameUrl, 'last_frame'),
      ],
      shouldWait: opts.wait,
    },
    {
      id: 'C',
      label: 'first_frame + last_frame same URL',
      purpose: 'Whether identical first/last URLs are accepted',
      model: opts.model,
      content: [
        textPrompt('same image as first and last frame'),
        imageItem(FIRST_FRAME_URL, 'first_frame'),
        imageItem(FIRST_FRAME_URL, 'last_frame'),
      ],
      shouldWait: false,
    },
    {
      id: 'D',
      label: 'first + last + reference_image (mutex)',
      purpose: 'Confirm multimodal modes are mutually exclusive',
      model: opts.model,
      content: [
        textPrompt('should reject mixed modes'),
        imageItem(FIRST_FRAME_URL, 'first_frame'),
        imageItem(lastFrameUrl, 'last_frame'),
        imageItem(lastFrameUrl, 'reference_image'),
      ],
      shouldWait: false,
    },
    {
      id: 'E',
      label: 'two image_url without roles',
      purpose: 'Contrast against role-based content format',
      model: opts.model,
      content: [
        textPrompt('images without roles'),
        imageItem(FIRST_FRAME_URL),
        imageItem(lastFrameUrl),
      ],
      shouldWait: false,
    },
  ]

  if (opts.runCaseF) {
    cases.push({
      id: 'F',
      label: `first+last on alternate model (${opts.caseFModel})`,
      purpose: 'Separate model support from account/package limits',
      model: opts.caseFModel,
      content: [
        textPrompt('case F alternate model first+last'),
        imageItem(FIRST_FRAME_URL, 'first_frame'),
        imageItem(lastFrameUrl, 'last_frame'),
      ],
      shouldWait: false,
    })
  }

  const results: CaseResult[] = []

  for (const def of cases) {
    console.log(`${'='.repeat(60)}`)
    console.log(`Case ${def.id}: ${def.label}`)
    console.log(`  purpose: ${def.purpose}`)
    console.log(`  model:   ${def.model}`)
    console.log(`  roles:   ${collectRoles(def.content).join(', ')}`)

    const body = buildBaseBody(def.model, def.content)
    const roles = collectRoles(def.content)

    let createStatus = 0
    let data: Record<string, unknown> = {}
    try {
      const res = await createTask(endpoint, apiKey, body)
      createStatus = res.status
      data = res.data
    } catch (err) {
      createStatus = 0
      data = { message: (err as Error).message }
    }

    const createOk = isCreateSuccess(createStatus, data)
    const taskId = extractTaskId(data)
    const errorSummary = createOk ? '' : summarizeError(createStatus, data)

    console.log(`  create:  ${createOk ? '✅' : '❌'} http=${createStatus} task_id=${taskId || '(none)'}`)
    if (!createOk) console.log(`  error:   ${errorSummary}`)

    const result: CaseResult = {
      id: def.id,
      label: def.label,
      purpose: def.purpose,
      createStatus,
      createOk,
      taskId,
      errorSummary,
      roles,
      waited: false,
    }

    if (def.shouldWait && createOk && taskId) {
      console.log('  waiting for terminal status…')
      const waited = await waitForTask(
        endpoint,
        apiKey,
        taskId,
        opts.timeoutMinutes,
        opts.intervalSeconds,
      )
      result.waited = true
      result.finalStatus = waited.finalStatus
      result.hasVideoUrl = waited.hasVideoUrl
      result.waitSeconds = waited.waitSeconds
      result.waitError = waited.error
      console.log(
        `  wait:    status=${waited.finalStatus} video_url=${waited.hasVideoUrl ? 'yes' : 'no'} (${waited.waitSeconds}s)`,
      )
      if (waited.error) console.log(`  wait_err:${waited.error}`)
    }

    results.push(result)
    console.log()
  }

  const { verdict, advice, notes } = deriveVerdict(results)

  // Extra notes from mutex / same-url cases
  const d = results.find((c) => c.id === 'D')
  if (d) {
    notes.push(
      d.createOk
        ? 'Case D accepted mixed first/last + reference_image — re-check adapter mutex assumption against this account/model.'
        : 'Case D rejected mixed modes — aligns with production first/last vs reference_image mutual exclusion.',
    )
  }
  const c = results.find((x) => x.id === 'C')
  if (c) {
    notes.push(
      c.createOk
        ? 'Case C accepted identical first/last URL.'
        : 'Case C rejected identical first/last URL — last frame should be a distinct image when enabling.',
    )
  }

  const report: ProbeReport = {
    generatedAt: new Date().toISOString(),
    model: opts.model,
    baseUrl,
    endpoint,
    apiKeyConfigured: true,
    waitEnabled: opts.wait,
    firstFrameUrl: FIRST_FRAME_URL,
    lastFrameUrl: lastFrameUrl,
    cases: results,
    verdict,
    productionAdvice: advice,
    notes,
  }

  const outputDir = path.join('scripts', 'output')
  fs.mkdirSync(outputDir, { recursive: true })
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const jsonPath = path.join(outputDir, `ark-last-frame-probe-${stamp}.json`)
  fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2))

  const md = renderMarkdown(report)
  const mdPath = path.join('docs', 'ARK_LAST_FRAME_PROBE_REPORT.md')
  fs.writeFileSync(mdPath, md)

  console.log(`${'='.repeat(60)}`)
  console.log('📊 Summary')
  console.log(`  verdict:             ${verdict}`)
  console.log(`  production_advice:   ${advice}`)
  console.log(`  json:                ${jsonPath}`)
  console.log(`  markdown report:     ${mdPath}`)
  console.log()
  console.log('Production default remains DISABLED (ARK_VIDEO_ENABLE_LAST_FRAME not set by this probe).')
  for (const n of notes) console.log(`  - ${n}`)

  // Exit codes: 0 ok probe completed; 2 inconclusive env; 3 capability rejected/failed
  if (verdict === 'INCONCLUSIVE') process.exitCode = 2
  else if (verdict === 'CREATE_REJECTED' || verdict === 'CREATE_OK_RUN_FAILED') process.exitCode = 3
  else process.exitCode = 0
}

main().catch((err) => {
  console.error('❌ probe crashed:', (err as Error).message)
  process.exit(1)
})
