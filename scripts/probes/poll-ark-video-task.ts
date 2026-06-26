// ============================================
// Ark Video Model Probe — Poll Task by ID
// Model: doubao-seedance-2-0-260128
// Usage: npx tsx scripts/probes/poll-ark-video-task.ts --task-id <id>
// ============================================
import 'dotenv/config'
import fs from 'fs'

const BASE = 'https://ark.cn-beijing.volces.com/api/v3/contents/generations/tasks'
const KEY = process.env.ARK_API_KEY || ''

function parseArgs(): { taskId: string; timeoutMinutes: number; intervalSeconds: number } {
  const args = process.argv.slice(2)
  const getArg = (key: string, fallback: string) => {
    const idx = args.indexOf(`--${key}`)
    return idx >= 0 && idx + 1 < args.length ? args[idx + 1] : fallback
  }
  const taskId = getArg('task-id', '')
  if (!taskId) {
    console.error('❌ 缺少 --task-id 参数')
    console.error('用法: npx tsx scripts/probes/poll-ark-video-task.ts --task-id <id> --timeout-minutes 5 --interval-seconds 10')
    process.exit(1)
  }
  return {
    taskId,
    timeoutMinutes: parseInt(getArg('timeout-minutes', '5'), 10),
    intervalSeconds: parseInt(getArg('interval-seconds', '10'), 10),
  }
}

async function main() {
  const { taskId, timeoutMinutes, intervalSeconds } = parseArgs()

  if (!KEY) {
    console.error('❌ 未设置 ARK_API_KEY，请在 .env 中设置后重试')
    process.exit(1)
  }

  console.log('🔍 Ark Video Task Poller\n')
  console.log(`task_id:          ${taskId}`)
  console.log(`endpoint:         ${BASE}/{task_id}`)
  console.log(`timeout_minutes:  ${timeoutMinutes}`)
  console.log(`interval_seconds: ${intervalSeconds}`)
  console.log(`max_attempts:     ${Math.floor((timeoutMinutes * 60) / intervalSeconds)}`)
  console.log()

  const maxAttempts = Math.floor((timeoutMinutes * 60) / intervalSeconds)
  let lastResponse: unknown = null
  const outputDir = 'scripts/output'
  fs.mkdirSync(outputDir, { recursive: true })

  const startTime = Date.now()

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(0)
    process.stdout.write(`\r[poll #${attempt}] elapsed=${elapsed}s | fetching...`)

    try {
      const res = await fetch(`${BASE}/${taskId}`, {
        headers: { 'Authorization': `Bearer ${KEY}` },
        signal: AbortSignal.timeout(15000),
      })
      const data = await res.json() as Record<string, unknown>
      lastResponse = data

      const status = (data.status || 'unknown') as string
      const progress = data.progress ?? '?'

      process.stdout.write(
        `\r[poll #${attempt}] elapsed=${elapsed}s | status=${status} | progress=${progress}%`
      )

      // —— COMPLETED ——
      if (status === 'completed' || status === 'succeeded' || status === 'success' || status === 'done') {
        const videoUrl = (data.video_url || data.url || data.output_url || (data.data as Record<string, unknown>)?.video_url || (data.data as Record<string, unknown>)?.url || '') as string
        console.log(`\n\n✅ 视频生成完成!`)
        console.log(`video_url:        ${videoUrl}`)
        console.log(`完整响应: ${JSON.stringify(data, null, 2).substring(0, 1000)}`)
        fs.writeFileSync(
          `${outputDir}/ark-video-task-completed-${taskId}.json`,
          JSON.stringify({ task_id: taskId, completed: true, video_url: videoUrl, response: data }, null, 2)
        )
        reportResult({ taskId, completed: true, status, videoUrl, lastResponse: data, totalSeconds: parseInt(elapsed) })
        return
      }

      // —— FAILED ——
      if (status === 'failed' || status === 'error') {
        console.log(`\n\n❌ 视频生成失败`)
        console.log(`完整响应: ${JSON.stringify(data, null, 2)}`)
        fs.writeFileSync(
          `${outputDir}/ark-video-task-failed-${taskId}.json`,
          JSON.stringify({ task_id: taskId, failed: true, response: data }, null, 2)
        )
        reportResult({ taskId, completed: false, status, videoUrl: '', lastResponse: data, totalSeconds: parseInt(elapsed) })
        return
      }

    } catch (e) {
      process.stdout.write(` [网络错误: ${(e as Error).message.substring(0, 60)}]`)
    }

    await new Promise(r => setTimeout(r, intervalSeconds * 1000))
  }

  // —— TIMEOUT ——
  const totalSeconds = Math.floor((Date.now() - startTime) / 1000)
  console.log(`\n\n⏰ 轮询超时 (${timeoutMinutes} 分钟)`)
  console.log()
  console.log('最后一次响应:')
  console.log(JSON.stringify(lastResponse, null, 2))
  console.log()
  fs.writeFileSync(
    `${outputDir}/ark-video-task-timeout-${taskId}.json`,
    JSON.stringify({ task_id: taskId, timeout: true, total_seconds: totalSeconds, last_response: lastResponse }, null, 2)
  )
  reportResult({
    taskId,
    completed: false,
    status: 'timeout',
    videoUrl: '',
    lastResponse,
    totalSeconds,
  })
}

function reportResult(r: {
  taskId: string; completed: boolean; status: string; videoUrl: string
  lastResponse: unknown; totalSeconds: number
}) {
  console.log(`\n${'='.repeat(60)}`)
  console.log('📊 最终报告')
  console.log(`${'='.repeat(60)}`)
  console.log(`task_id:          ${r.taskId}`)
  console.log(`是否 completed:    ${r.completed ? 'YES ✅' : 'NO ❌'}`)
  console.log(`最终 status:       ${r.status}`)
  console.log(`video_url:         ${r.videoUrl || '(无)'}`)
  console.log(`最后一次响应:      ${JSON.stringify(r.lastResponse).substring(0, 500)}`)
  console.log(`等待总时长:         ${r.totalSeconds}s (${(r.totalSeconds / 60).toFixed(1)}min)`)
  console.log()

  if (!r.completed && r.status === 'timeout') {
    console.log('⚠️  结论: 视频任务创建成功，但调度队列未开始处理，真实视频生成未完成。')
    console.log(`   可使用 --task-id ${r.taskId} 继续轮询。`)
  }

  if (!r.completed && r.status === 'queued') {
    console.log('⚠️  结论: 任务仍在队列中等待调度，真实视频生成未完成。')
  }
}

main().catch(e => { console.error('\n❌', e.message); process.exit(1) })
