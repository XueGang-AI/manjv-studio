// ============================================
// Agnes Video V2.0 音频与口型同步 — 第二阶段验证
// 等待 completed → 下载 → ffprobe → 人工检查
// ============================================
import 'dotenv/config'
import fs from 'fs'
import { execSync } from 'child_process'

const BASE = process.env.AGNES_VIDEO_API_BASE_URL || 'https://apihub.agnes-ai.com/v1'
const KEY = process.env.AGNES_VIDEO_API_KEY || ''
const VIDEO_MODEL = process.env.AGNES_VIDEO_MODEL || 'agnes-video-v2.0'
const IMG_BASE = process.env.AGNES_IMAGE_API_BASE_URL || 'https://apihub.agnes-ai.com/v1'
const IMG_MODEL = process.env.AGNES_IMAGE_MODEL || 'agnes-image-2.0-flash'

const OUT_DIR = 'scripts/output/audio-probe'
fs.mkdirSync(OUT_DIR, { recursive: true })

interface Stage1Result {
  case: string
  taskId: string | null
  httpStatus: number
  createError: string | null
  accepted: boolean
}

interface Stage2Result {
  completed: boolean
  timedOut: boolean
  failed: boolean
  status: string
  videoUrl: string | null
  pollAttempts: number
  totalWaitSeconds: number
  lastResponse: unknown
}

interface Stage3Result {
  filePath: string | null
  fileSizeKB: number | null
  hasAudio: boolean
  audioCodec: string | null
  audioDuration: string | null
  audioBitrate: string | null
  audioChannels: string | null
  audioSampleRate: string | null
  width: number | null
  height: number | null
  videoCodec: string | null
  videoDuration: string | null
  ffprobeError: string | null
}

interface CaseReport {
  case: string
  label: string
  requestBody: Record<string, unknown>
  stage1: Stage1Result
  stage2: Stage2Result
  stage3: Stage3Result
  humanCheck: string
  verdict: string
}

const report: CaseReport[] = []

// ============================================
// Stage 1: Create task
// ============================================
async function createTask(caseName: string, extraFields: Record<string, unknown>, imgUrl: string): Promise<Stage1Result> {
  const body = {
    model: VIDEO_MODEL,
    prompt: 'A young Chinese woman speaking to camera, half body portrait, gentle expression, Korean manhwa style, slow push-in, cinematic lighting, high quality, no watermark',
    duration: 5,
    aspect_ratio: '9:16',
    image: imgUrl,
    ...extraFields,
  }

  try {
    const res = await fetch(`${BASE}/videos`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${KEY}` },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(60000),
    })
    const data = await res.json() as Record<string, unknown>
    const taskId = (data.task_id || data.id || null) as string | null
    return {
      case: caseName, taskId, httpStatus: res.status,
      createError: res.ok ? null : JSON.stringify(data).substring(0, 300),
      accepted: res.ok && !!taskId,
    }
  } catch (e) {
    return { case: caseName, taskId: null, httpStatus: 0,
      createError: (e as Error).message, accepted: false }
  }
}

// ============================================
// Stage 2: Poll until completed
// ============================================
async function pollUntilDone(taskId: string, timeoutMin: number): Promise<Stage2Result> {
  const maxAttempts = Math.floor((timeoutMin * 60) / 10)
  const start = Date.now()
  let lastResponse: unknown = null

  for (let i = 1; i <= maxAttempts; i++) {
    await new Promise(r => setTimeout(r, 10000))
    try {
      const res = await fetch(`${BASE}/videos/${taskId}`, {
        headers: { 'Authorization': `Bearer ${KEY}` },
        signal: AbortSignal.timeout(15000),
      })
      const data = await res.json() as Record<string, unknown>
      lastResponse = data
      const status = (data.status || '?') as string
      const elapsed = Math.floor((Date.now() - start) / 1000)
      process.stdout.write(`\r    poll #${i}: ${status} | progress=${data.progress ?? '?'}% | ${elapsed}s`)

      if (status === 'completed' || status === 'succeeded' || status === 'success') {
        const url = (data.video_url || data.url || data.output_url || data.remixed_from_video_id || '') as string
        console.log()
        return {
          completed: true, timedOut: false, failed: false, status: 'completed',
          videoUrl: url || null,
          pollAttempts: i, totalWaitSeconds: elapsed,
          lastResponse: data,
        }
      }
      if (status === 'failed' || status === 'error') {
        console.log()
        return {
          completed: false, timedOut: false, failed: true, status,
          videoUrl: null, pollAttempts: i, totalWaitSeconds: elapsed,
          lastResponse: data,
        }
      }
    } catch {
      process.stdout.write('?')
    }
  }
  console.log()
  return {
    completed: false, timedOut: true, failed: false, status: 'timeout',
    videoUrl: null, pollAttempts: maxAttempts,
    totalWaitSeconds: Math.floor((Date.now() - start) / 1000),
    lastResponse,
  }
}

// ============================================
// Stage 3: Download + ffprobe
// ============================================
async function downloadAndProbe(videoUrl: string, caseName: string): Promise<Stage3Result> {
  const localPath = `${OUT_DIR}/${caseName}.mp4`
  try {
    const res = await fetch(videoUrl, { signal: AbortSignal.timeout(120000) })
    const buf = Buffer.from(await res.arrayBuffer())
    fs.writeFileSync(localPath, buf)
    const sizeKB = Math.round(buf.length / 1024)
    console.log(`    downloaded: ${sizeKB}KB → ${localPath}`)

    // ffprobe
    const probeJson = execSync(
      `ffprobe -v quiet -print_format json -show_format -show_streams "${localPath}"`,
      { encoding: 'utf-8', timeout: 15000 }
    )
    const probe = JSON.parse(probeJson)

    const aStream = probe.streams?.find((s: Record<string,unknown>) => s.codec_type === 'audio')
    const vStream = probe.streams?.find((s: Record<string,unknown>) => s.codec_type === 'video')

    return {
      filePath: localPath, fileSizeKB: sizeKB,
      hasAudio: !!aStream,
      audioCodec: aStream?.codec_name || null,
      audioDuration: aStream?.duration ? String(aStream.duration) + 's' : probe.format?.duration ? String(probe.format.duration) + 's' : null,
      audioBitrate: aStream?.bit_rate ? Math.round(Number(aStream.bit_rate)/1000) + 'kbps' : null,
      audioChannels: aStream?.channels ? String(aStream.channels) : null,
      audioSampleRate: aStream?.sample_rate || null,
      width: vStream?.width || null,
      height: vStream?.height || null,
      videoCodec: vStream?.codec_name || null,
      videoDuration: probe.format?.duration ? String(probe.format.duration) + 's' : null,
      ffprobeError: null,
    }
  } catch (e) {
    return {
      filePath: null, fileSizeKB: null,
      hasAudio: false, audioCodec: null, audioDuration: null,
      audioBitrate: null, audioChannels: null, audioSampleRate: null,
      width: null, height: null, videoCodec: null, videoDuration: null,
      ffprobeError: (e as Error).message,
    }
  }
}

// ============================================
// Main
// ============================================
async function main() {
  console.log('🎤 Agnes Video V2.0 音频与口型同步 — 第二阶段验证\n')
  console.log(`Model: ${VIDEO_MODEL}`)
  console.log(`Output: ${OUT_DIR}/\n`)

  // Step 0: Generate test image
  console.log('📷 生成测试图片...')
  const imgRes = await fetch(`${IMG_BASE}/images/generations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${KEY}` },
    body: JSON.stringify({
      model: IMG_MODEL,
      prompt: 'A young Chinese woman, front view half body portrait, gentle smile, Korean manhwa style, high quality, plain light background',
      aspect_ratio: '9:16', num_outputs: 1,
      negative_prompt: 'ugly, deformed, low quality, blurry, text, watermark',
    }),
  })
  const imgData = await imgRes.json() as Record<string, unknown>
  const imgUrl = ((imgData.data as unknown[])?.[0] as Record<string,unknown>)?.url as string
  if (!imgUrl) { console.log('❌ 图片生成失败'); process.exit(1) }
  console.log(`✅ ${imgUrl.substring(0, 60)}...\n`)

  // ================================================================
  // Case 1: voice_text + generate_audio
  // ================================================================
  console.log('='.repeat(60))
  console.log('Case 1: voice_text + generate_audio')
  console.log('='.repeat(60))

  const s1_1 = await createTask('01_voice_text_generate_audio', {
    voice_text: '你好，欢迎来到我们的频道，今天我们来聊一聊人工智能的未来。',
    generate_audio: true,
  }, imgUrl)
  console.log(`  HTTP ${s1_1.httpStatus} | task_id=${s1_1.taskId}`)

  if (s1_1.taskId) {
    console.log(`  轮询中 (最多 30 分钟)...`)
    const s2_1 = await pollUntilDone(s1_1.taskId, 30)
    console.log(`  completed=${s2_1.completed} | failed=${s2_1.failed} | timedOut=${s2_1.timedOut}`)

    let s3_1: Stage3Result = { hasAudio: false, audioCodec: null, audioDuration: null, audioBitrate: null, audioChannels: null, audioSampleRate: null, width: null, height: null, videoCodec: null, videoDuration: null, ffprobeError: null, filePath: null, fileSizeKB: null }

    if (s2_1.completed && s2_1.videoUrl) {
      console.log(`  下载并 ffprobe...`)
      s3_1 = await downloadAndProbe(s2_1.videoUrl, '01_voice_text_generate_audio')
      if (s3_1.hasAudio) {
        console.log(`  🎵 音频: ${s3_1.audioCodec} ${s3_1.audioChannels}ch ${s3_1.audioSampleRate}Hz ${s3_1.audioBitrate} ${s3_1.audioDuration}`)
      } else {
        console.log(`  🔇 无音频轨`)
      }
    }

    report.push({
      case: '01_voice_text_generate_audio',
      label: 'voice_text + generate_audio',
      requestBody: { voice_text: '你好，欢迎来到我们的频道...', generate_audio: true },
      stage1: s1_1, stage2: s2_1, stage3: s3_1,
      humanCheck: s3_1.hasAudio
        ? '⚠️ 需人工播放确认: 是否有中文人声"你好，欢迎来到我们的频道..."，口型是否跟随'
        : '❌ 无音频轨，无需人工检查',
      verdict: s3_1.hasAudio ? '有音频轨，待人工确认人声和口型' : '无音频轨',
    })
  } else {
    report.push({
      case: '01_voice_text_generate_audio', label: 'voice_text + generate_audio',
      requestBody: {}, stage1: s1_1,
      stage2: { completed: false, timedOut: false, failed: true, status: 'create_failed', videoUrl: null, pollAttempts: 0, totalWaitSeconds: 0, lastResponse: null },
      stage3: { hasAudio: false, audioCodec: null, audioDuration: null, audioBitrate: null, audioChannels: null, audioSampleRate: null, width: null, height: null, videoCodec: null, videoDuration: null, ffprobeError: null, filePath: null, fileSizeKB: null },
      humanCheck: 'N/A', verdict: '创建失败',
    })
  }

  // ================================================================
  // Case 2: audio_url + lip_sync
  // ================================================================
  console.log('\n' + '='.repeat(60))
  console.log('Case 2: audio_url + lip_sync')
  console.log('='.repeat(60))

  const s1_2 = await createTask('02_audio_url_lip_sync', {
    audio_url: 'https://www.w3schools.com/html/horse.mp3',
    lip_sync: true,
  }, imgUrl)
  console.log(`  HTTP ${s1_2.httpStatus} | task_id=${s1_2.taskId}`)

  if (s1_2.taskId) {
    console.log(`  轮询中 (最多 30 分钟)...`)
    const s2_2 = await pollUntilDone(s1_2.taskId, 30)
    console.log(`  completed=${s2_2.completed} | failed=${s2_2.failed} | timedOut=${s2_2.timedOut}`)

    let s3_2: Stage3Result = { hasAudio: false, audioCodec: null, audioDuration: null, audioBitrate: null, audioChannels: null, audioSampleRate: null, width: null, height: null, videoCodec: null, videoDuration: null, ffprobeError: null, filePath: null, fileSizeKB: null }

    if (s2_2.completed && s2_2.videoUrl) {
      console.log(`  下载并 ffprobe...`)
      s3_2 = await downloadAndProbe(s2_2.videoUrl, '02_audio_url_lip_sync')
      if (s3_2.hasAudio) {
        console.log(`  🎵 音频: ${s3_2.audioCodec} ${s3_2.audioChannels}ch ${s3_2.audioSampleRate}Hz ${s3_2.audioBitrate} ${s3_2.audioDuration}`)
      } else {
        console.log(`  🔇 无音频轨`)
      }
    }

    report.push({
      case: '02_audio_url_lip_sync',
      label: 'audio_url + lip_sync',
      requestBody: { audio_url: 'https://www.w3schools.com/html/horse.mp3', lip_sync: true },
      stage1: s1_2, stage2: s2_2, stage3: s3_2,
      humanCheck: s3_2.hasAudio
        ? '⚠️ 需人工播放确认: 音频是否为 horse.mp3 的内容，口型是否有同步效果'
        : '❌ 无音频轨，无需人工检查',
      verdict: s3_2.hasAudio ? '有音频轨，待人工确认人声和口型' : '无音频轨',
    })
  } else {
    report.push({
      case: '02_audio_url_lip_sync', label: 'audio_url + lip_sync',
      requestBody: {}, stage1: s1_2,
      stage2: { completed: false, timedOut: false, failed: true, status: 'create_failed', videoUrl: null, pollAttempts: 0, totalWaitSeconds: 0, lastResponse: null },
      stage3: { hasAudio: false, audioCodec: null, audioDuration: null, audioBitrate: null, audioChannels: null, audioSampleRate: null, width: null, height: null, videoCodec: null, videoDuration: null, ffprobeError: null, filePath: null, fileSizeKB: null },
      humanCheck: 'N/A', verdict: '创建失败',
    })
  }

  // ================================================================
  // Case 3: dialogue + generate_audio + voice_id
  // ================================================================
  console.log('\n' + '='.repeat(60))
  console.log('Case 3: dialogue + generate_audio + voice_id')
  console.log('='.repeat(60))

  const s1_3 = await createTask('03_dialogue_gen_audio_voice_id', {
    dialogue: '你好，我是你的AI助手，很高兴为你服务。',
    generate_audio: true,
    voice_id: 'zh_female_gentle_01',
  }, imgUrl)
  console.log(`  HTTP ${s1_3.httpStatus} | task_id=${s1_3.taskId}`)

  if (s1_3.taskId) {
    console.log(`  轮询中 (最多 30 分钟)...`)
    const s2_3 = await pollUntilDone(s1_3.taskId, 30)
    console.log(`  completed=${s2_3.completed} | failed=${s2_3.failed} | timedOut=${s2_3.timedOut}`)

    let s3_3: Stage3Result = { hasAudio: false, audioCodec: null, audioDuration: null, audioBitrate: null, audioChannels: null, audioSampleRate: null, width: null, height: null, videoCodec: null, videoDuration: null, ffprobeError: null, filePath: null, fileSizeKB: null }

    if (s2_3.completed && s2_3.videoUrl) {
      console.log(`  下载并 ffprobe...`)
      s3_3 = await downloadAndProbe(s2_3.videoUrl, '03_dialogue_gen_audio_voice_id')
      if (s3_3.hasAudio) {
        console.log(`  🎵 音频: ${s3_3.audioCodec} ${s3_3.audioChannels}ch ${s3_3.audioSampleRate}Hz ${s3_3.audioBitrate} ${s3_3.audioDuration}`)
      } else {
        console.log(`  🔇 无音频轨`)
      }
    }

    report.push({
      case: '03_dialogue_gen_audio_voice_id',
      label: 'dialogue + generate_audio + voice_id',
      requestBody: { dialogue: '你好，我是你的AI助手...', generate_audio: true, voice_id: 'zh_female_gentle_01' },
      stage1: s1_3, stage2: s2_3, stage3: s3_3,
      humanCheck: s3_3.hasAudio
        ? '⚠️ 需人工播放确认: 是否有中文人声"你好，我是你的AI助手..."，口型是否跟随，音色是否为女性温柔音'
        : '❌ 无音频轨，无需人工检查',
      verdict: s3_3.hasAudio ? '有音频轨，待人工确认人声和口型' : '无音频轨',
    })
  } else {
    report.push({
      case: '03_dialogue_gen_audio_voice_id', label: 'dialogue + generate_audio + voice_id',
      requestBody: {}, stage1: s1_3,
      stage2: { completed: false, timedOut: false, failed: true, status: 'create_failed', videoUrl: null, pollAttempts: 0, totalWaitSeconds: 0, lastResponse: null },
      stage3: { hasAudio: false, audioCodec: null, audioDuration: null, audioBitrate: null, audioChannels: null, audioSampleRate: null, width: null, height: null, videoCodec: null, videoDuration: null, ffprobeError: null, filePath: null, fileSizeKB: null },
      humanCheck: 'N/A', verdict: '创建失败',
    })
  }

  // ================================================================
  // Generate report
  // ================================================================
  console.log('\n' + '='.repeat(60))
  console.log('📊 生成报告...')
  console.log('='.repeat(60))

  let md = `# Agnes Video V2.0 音频与口型同步 — 第二阶段验证报告\n\n`
  md += `> 测试时间: ${new Date().toISOString()}\n`
  md += `> 模型: ${VIDEO_MODEL}\n`
  md += `> 视频输出: ${OUT_DIR}/\n\n`

  md += `## Stage 1: API 接受字段\n\n`
  md += `| Case | HTTP | task_id | 字段被接受 |\n`
  md += `|------|------|---------|:----------:|\n`
  for (const r of report) {
    md += `| ${r.case} | ${r.stage1.httpStatus} | ${(r.stage1.taskId || 'N/A').substring(0, 20)}... | ${r.stage1.accepted ? '✅' : '❌'} |\n`
  }

  md += `\n## Stage 2: Task 完成状态\n\n`
  md += `| Case | 是否 completed | 轮询次数 | 等待时长 | 失败/超时 |\n`
  md += `|------|:-------------:|----------|----------|:--------:|\n`
  for (const r of report) {
    const icon = r.stage2.completed ? '✅' : r.stage2.failed ? '❌ 失败' : r.stage2.timedOut ? '⏰ 超时' : '❌ 创建失败'
    md += `| ${r.case} | ${icon} | ${r.stage2.pollAttempts} | ${r.stage2.totalWaitSeconds}s | ${r.stage2.failed ? 'YES' : r.stage2.timedOut ? 'TIMEOUT' : '-'} |\n`
  }

  md += `\n## Stage 3: ffprobe 音频检测\n\n`
  md += `| Case | 文件 | 分辨率 | 视频编码 | 有音频轨 | 音频编码 | 声道 | 采样率 | 比特率 | 时长 |\n`
  md += `|------|------|--------|----------|:-------:|----------|------|--------|--------|------|\n`
  for (const r of report) {
    const s3 = r.stage3
    if (s3.ffprobeError) {
      md += `| ${r.case} | ❌ 错误 | - | - | - | - | - | - | - | ${s3.ffprobeError.substring(0, 60)} |\n`
    } else if (s3.filePath) {
      md += `| ${r.case} | ${s3.fileSizeKB}KB | ${s3.width}x${s3.height} | ${s3.videoCodec} | ${s3.hasAudio ? '✅' : '❌'} | ${s3.audioCodec || '-'} | ${s3.audioChannels || '-'} | ${s3.audioSampleRate || '-'} | ${s3.audioBitrate || '-'} | ${s3.audioDuration || '-'} |\n`
    } else {
      md += `| ${r.case} | - | - | - | ❌ | - | - | - | - | 未下载 |\n`
    }
  }

  md += `\n## 人工检查\n\n`
  md += `| Case | 文件路径 | 检查指引 |\n`
  md += `|------|----------|----------|\n`
  for (const r of report) {
    if (r.stage3.filePath) {
      md += `| ${r.case} | \`${r.stage3.filePath}\` | ${r.humanCheck} |\n`
    } else {
      md += `| ${r.case} | N/A | ${r.humanCheck} |\n`
    }
  }

  md += `\n## 综合判定\n\n`
  md += `| 维度 | 结果 |\n`
  md += `|------|------|\n`

  const allAccepted = report.every(r => r.stage1.accepted)
  const anyCompleted = report.some(r => r.stage2.completed)
  const anyAudio = report.some(r => r.stage3.hasAudio)

  md += `| API 是否接受字段 | ${allAccepted ? '✅ 全部接受' : '❌ 部分拒绝'} |\n`
  md += `| completed 视频是否有音频轨 | ${anyAudio ? '✅ 有音频轨' : report.some(r => r.stage2.completed) ? '❌ 无音频轨' : '❓ 未完成'} |\n`
  md += `| 是否有真实人声对白 | ⚠️ 需人工确认 |\n`
  md += `| 是否口型同步有效 | ⚠️ 需人工确认 |\n`
  md += `| 是否建议接入业务主流程 | ⚠️ 待人工确认后决定 |\n`

  md += `\n## 注意事项\n\n`
  md += `> - "有 AAC 音轨" ≠ "有配音" — 可能是环境声或静音轨\n`
  md += `> - 只有人工播放听到清晰中文对白，才能确认配音生效\n`
  md += `> - 口型同步需要目视对比音频节奏与嘴唇动作\n`
  md += `> - 视频文件保存在 \`${OUT_DIR}/\`，请人工播放检查\n`

  fs.writeFileSync('docs/AGNES_VIDEO_AUDIO_LIPSYNC_COMPLETED_REPORT.md', md)
  console.log('✅ 报告已保存')

  // Print summary
  console.log('\n📊 快速总结:')
  for (const r of report) {
    console.log(`  ${r.case}: accept=${r.stage1.accepted} | completed=${r.stage2.completed} | audio=${r.stage3.hasAudio}`)
  }
}

main().catch(e => { console.error('\n❌ Fatal:', e.message); process.exit(1) })
