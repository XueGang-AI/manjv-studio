// ============================================
// REAL API: 30s 短视频原型 (3-4 镜头, 1 集)
// 注：episode_duration 最小校验值为 30s
// 全流程自动化 — 项目→故事→角色→角色图→分镜→分镜图→视频→MP4
// ============================================
import 'dotenv/config'
import fs from 'fs'
import { execSync } from 'child_process'

const BASE = process.env.E2E_BASE_URL || 'http://localhost:3000'
const VID_BASE = process.env.ARK_API_BASE_URL || 'https://ark.cn-beijing.volces.com/api/v3'
const VID_KEY = process.env.ARK_API_KEY || ''

const log = (msg: string) => console.log(`\x1b[36m[PROTO]\x1b[0m ${msg}`)
const ok = (msg: string) => console.log(`\x1b[32m  ✅ ${msg}\x1b[0m`)
const warn = (msg: string) => console.log(`\x1b[33m  ⚠️ ${msg}\x1b[0m`)
const fail = (msg: string): never => { console.log(`\x1b[31m  ❌ ${msg}\x1b[0m`); process.exit(1) }

interface State {
  projectId: string
  storyPackageId: string
  characterIds: string[]
  episodeId: string
  shotIds: string[]
  videoRecords: Array<{ id: string; shotId: string; remoteTaskId: string; shotNo: number }>
  downloadedVideos: string[]
  finalVideoPath: string
}

interface ProjectTask {
  id: string
  status: string
  errorMessage?: string | null
  output?: Record<string, unknown> | null
}

async function post(path: string, body?: Record<string, unknown>, timeoutMs = 120000) {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(timeoutMs),
  })
  return res.json()
}

/** 带自动重试的 POST（处理模型输出不稳定等问题） */
async function postWithRetry<T = unknown>(
  path: string, body: Record<string, unknown> | undefined,
  label: string, maxRetries = 2, timeoutMs = 180000
): Promise<{ success: boolean; data?: T; error?: string }> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const result = await post(path, body, timeoutMs)
    if (result.success) return result as { success: boolean; data?: T; error?: string }
    if (attempt < maxRetries) {
      warn(`${label} 失败 (attempt ${attempt + 1}/${maxRetries + 1}): ${result.error} — 重试中...`)
      await new Promise(r => setTimeout(r, 3000))
    } else {
      return result as { success: boolean; data?: T; error?: string }
    }
  }
  return { success: false, error: 'max retries exceeded' }
}

async function gett(path: string) {
  return (await fetch(`${BASE}${path}`)).json()
}

async function waitTask(projectId: string, taskId: string, label: string, timeoutMs = 900000): Promise<ProjectTask> {
  const startedAt = Date.now()
  while (Date.now() - startedAt < timeoutMs) {
    const tasks = await gett(`/api/projects/${projectId}/tasks`)
    if (!tasks.success) fail(`获取任务失败: ${tasks.error}`)
    const task = (tasks.data as ProjectTask[]).find(t => t.id === taskId)
    if (!task) fail(`${label}任务不存在: ${taskId}`)
    if (task.status === 'success') return task
    if (task.status === 'failed' || task.status === 'cancelled') {
      fail(`${label}任务失败: ${task.errorMessage || task.status}`)
    }
    await new Promise(r => setTimeout(r, 5000))
  }
  fail(`${label}任务超时: ${taskId}`)
}

async function pollVideoTask(taskId: string, label: string, timeoutMin = 30): Promise<{ videoUrl: string; duration: number }> {
  log(`轮询视频: ${label} (task: ${taskId.substring(0, 16)}...)`)
  const maxAttempts = Math.floor((timeoutMin * 60) / 10)
  const startTime = Date.now()

  for (let i = 1; i <= maxAttempts; i++) {
    await new Promise(r => setTimeout(r, 10000))
    try {
      const res = await fetch(`${VID_BASE}/contents/generations/tasks/${taskId}`, {
        headers: { 'Authorization': `Bearer ${VID_KEY}` },
        signal: AbortSignal.timeout(15000),
      })
      const data = await res.json() as Record<string, unknown>
      const status = (data.status || '?') as string
      const elapsed = Math.floor((Date.now() - startTime) / 1000)
      process.stdout.write(`\r    poll #${i}: status=${status} | progress=${data.progress ?? '?'}% | elapsed=${elapsed}s`)

      if (status === 'completed' || status === 'succeeded' || status === 'success') {
        const content = data.content as Record<string, unknown> | undefined
        const url = (content?.video_url || data.video_url || data.url || data.output_url || '') as string
        console.log()
        if (url) {
          ok(`视频完成: ${label} — ${url.substring(0, 60)}...`)
          return { videoUrl: url, duration: parseFloat(String(data.seconds || data.duration || '5')) }
        }
        fail(`视频完成但无 URL: ${JSON.stringify(data).substring(0, 200)}`)
      }
      if (status === 'failed' || status === 'error') {
        console.log()
        fail(`视频失败: ${label} — ${JSON.stringify(data).substring(0, 300)}`)
      }
    } catch (e) {
      process.stdout.write(` [err:${(e as Error).message.substring(0, 30)}]`)
    }
  }
  console.log()
  fail(`视频轮询超时: ${label} (${timeoutMin}min)`)
  throw new Error('unreachable')
}

async function downloadFile(url: string, localPath: string): Promise<string> {
  const dir = localPath.substring(0, localPath.lastIndexOf('/'))
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  const res = await fetch(url)
  const buf = Buffer.from(await res.arrayBuffer())
  fs.writeFileSync(localPath, buf)
  return localPath
}

async function main() {
  console.log('\n🎬 真实 API 15s 短视频原型生成\n')
  console.log(`Text model:  ${process.env.ARK_TEXT_MODEL || 'doubao-seed-character-251128'}`)
  console.log(`Image model: ${process.env.ARK_IMAGE_MODEL || 'doubao-seedream-5-0-260128'}`)
  console.log(`Video model: ${process.env.ARK_VIDEO_MODEL || 'doubao-seedance-2-0-260128'}`)
  console.log()

  const s: State = {
    projectId: '', storyPackageId: '', characterIds: [], episodeId: '', shotIds: [],
    videoRecords: [], downloadedVideos: [], finalVideoPath: '',
  }

  // ============================================
  // Step 1: 创建项目
  // ============================================
  log('Step 1: 创建项目 (1集, 15s, 竖屏)')
  const proj = await post('/api/projects', {
    project_name: '15秒短视频原型-都市邂逅',
    story_type: '都市',
    background: '繁华都市的傍晚，一家安静的咖啡厅和附近的街心公园',
    main_characters: ['林晓', '陈默', '咖啡店老板'],
    core_conflict: '一次偶然的咖啡厅邂逅，让两个陌生人的生活轨迹开始交汇',
    story_summary: '雨天的傍晚，刚下班的林晓躲进一家街角咖啡厅避雨。她注意到角落里专注画画的陈默，被他的专注吸引。咖啡店老板看出了这份微妙的情愫，巧妙地为两人搭桥。短短的相遇，却改变了两人的一天。',
    art_style: '韩漫',
    target_platform: '抖音',
    episode_count: 1,
    episode_duration: 30,
    aspect_ratio: '9:16',
    audience: '18-35岁都市青年',
    ending_type: '开放式',
  })
  if (!proj.success) fail('创建项目失败: ' + proj.error)
  s.projectId = proj.data.id
  ok(`project_id: ${s.projectId}`)

  // ============================================
  // Step 2: 生成故事方案
  // ============================================
  log('Step 2: 生成故事方案 (Ark Text)')
  const story = await postWithRetry(`/api/projects/${s.projectId}/story/generate`, undefined, '故事生成')
  if (!story.success) fail('故事生成失败: ' + story.error)
  await waitTask(s.projectId, (story.data as { taskId: string }).taskId, '故事生成')
  const storyData = await gett(`/api/projects/${s.projectId}/story`)
  s.storyPackageId = storyData.data.packages[0].id
  ok(`story_package_id: ${s.storyPackageId}`)

  // 确认故事
  log('Step 2b: 确认故事方案')
  await post(`/api/projects/${s.projectId}/story/${s.storyPackageId}/confirm`)
  ok('故事已确认')

  // ============================================
  // Step 3: 生成角色设定
  // ============================================
  log('Step 3: 生成角色设定 (Ark Text)')
  const chars = await postWithRetry(`/api/projects/${s.projectId}/characters/generate`, undefined, '角色生成')
  if (!chars.success) fail('角色生成失败: ' + chars.error)
  await waitTask(s.projectId, (chars.data as { taskId: string }).taskId, '角色生成')
  const charsData = await gett(`/api/projects/${s.projectId}/characters`)
  s.characterIds = charsData.data.characters.map((c: { id: string }) => c.id)
  ok(`${s.characterIds.length} 个角色已生成`)

  // 确认全部角色
  log('Step 3b: 确认角色')
  for (const cid of s.characterIds) {
    await post(`/api/projects/${s.projectId}/characters/${cid}/confirm`)
  }
  ok('全部角色已确认')

  // ============================================
  // Step 4: 生成角色图
  // ============================================
  log('Step 4: 生成角色图 (Ark Image)')
  const charImgs = await post(`/api/projects/${s.projectId}/character-images/generate`)
  if (!charImgs.success) fail('角色图生成失败: ' + charImgs.error)
  await waitTask(s.projectId, charImgs.data.taskId, '角色图生成')
  const charImgsData = await gett(`/api/projects/${s.projectId}/character-images`)
  ok(`${charImgsData.data.characters.length} 个角色的图片已生成`)

  // 选择并确认全部标准图
  log('Step 4b: 选择并确认角色图')
  for (const cg of charImgsData.data.characters) {
    if (cg.images.length > 0) {
      await post(`/api/projects/${s.projectId}/character-images/${cg.images[0].id}/select`)
      await post(`/api/projects/${s.projectId}/character-images/${cg.images[0].id}/confirm`)
    }
  }
  ok('全部标准角色图已选择并确认')

  // ============================================
  // Step 5: 生成分镜脚本（带重试，模型输出可能不稳定）
  // ============================================
  log('Step 5: 生成分镜脚本 (Ark Text)')
  const sb = await postWithRetry(`/api/projects/${s.projectId}/storyboard/generate`, undefined, '分镜生成')
  if (!sb.success) fail('分镜生成失败: ' + sb.error)
  const sbTask = await waitTask(s.projectId, (sb.data as { taskId: string }).taskId, '分镜生成')
  s.episodeId = sbTask.output?.episode_id as string
  if (!s.episodeId) fail('分镜任务未返回 episode_id')
  const storyboard = await gett(`/api/projects/${s.projectId}/episodes/${s.episodeId}/storyboard`)
  s.shotIds = storyboard.data.shots.map((sh: { id: string }) => sh.id)
  ok(`episode_id: ${s.episodeId} | ${s.shotIds.length} 个镜头`)

  // 确认分镜
  log('Step 5b: 确认分镜脚本')
  await post(`/api/projects/${s.projectId}/episodes/${s.episodeId}/storyboard/confirm`)
  ok('分镜已确认')

  // ============================================
  // Step 6: 生成场景参考图
  // ============================================
  log('Step 6: 生成场景参考图 (Ark Image)')
  const sceneRefs = await post(`/api/projects/${s.projectId}/episodes/${s.episodeId}/scene-references/generate`)
  if (!sceneRefs.success) fail('场景参考图生成失败: ' + sceneRefs.error)
  await waitTask(s.projectId, sceneRefs.data.taskId, '场景参考图生成')
  ok('场景参考图已生成')

  // ============================================
  // Step 7: 生成分镜图
  // ============================================
  log('Step 7: 生成分镜图 (Ark Image)')
  const shotImgs = await post(`/api/projects/${s.projectId}/episodes/${s.episodeId}/shot-images/generate`)
  if (!shotImgs.success) fail('分镜图生成失败: ' + shotImgs.error)
  await waitTask(s.projectId, shotImgs.data.taskId, '分镜图生成')
  const shotImgsData = await gett(`/api/projects/${s.projectId}/episodes/${s.episodeId}/shot-images`)
  ok(`${shotImgsData.data.shots?.length || 0} 个镜头图已生成`)

  // 选择并确认分镜图
  log('Step 7b: 选择并确认分镜图')
  for (const sg of (shotImgsData.data.shots || [])) {
    if (sg.images?.length > 0) {
      await post(`/api/projects/${s.projectId}/episodes/${s.episodeId}/shot-images/${sg.images[0].id}/select`)
      await post(`/api/projects/${s.projectId}/episodes/${s.episodeId}/shot-images/${sg.images[0].id}/confirm`)
    }
  }
  ok('全部分镜图已选择并确认')

  // ============================================
  // Step 7: 生成视频片段（异步）
  // ============================================
  log('Step 7: 生成视频片段 (Ark Video — 异步)')
  const vidGen = await postWithRetry(`/api/projects/${s.projectId}/episodes/${s.episodeId}/shot-videos/generate`, undefined, '视频创建', 1, 300000)
  if (!vidGen.success) fail('视频任务创建失败: ' + vidGen.error)
  ok(`视频异步任务已创建: ${vidGen.data.totalVideos} 个`)

  // 获取视频记录（含 remote_task_id）
  const vidData = await gett(`/api/projects/${s.projectId}/episodes/${s.episodeId}/shot-videos`)
  for (const sg of (vidData.data.shots || [])) {
    for (const v of (sg.videos || [])) {
      if (v.remoteTaskId && !v.videoUrl) {
        s.videoRecords.push({
          id: v.id,
          shotId: sg.shot.id,
          remoteTaskId: v.remoteTaskId,
          shotNo: sg.shot.shotNo,
        })
      }
    }
  }
  ok(`${s.videoRecords.length} 个远端视频任务待轮询`)

  // 轮询每个视频任务
  log('Step 7b: 轮询视频任务 (每任务最多 30 分钟)')
  const videoDir = `uploads/prototype/${s.projectId}/videos`
  fs.mkdirSync(videoDir, { recursive: true })

  // 去重：同一 remote_task_id 的多个记录只 poll 一次
  const uniqueTasks = new Map<string, typeof s.videoRecords[0]>()
  for (const vr of s.videoRecords) {
    if (!uniqueTasks.has(vr.remoteTaskId)) uniqueTasks.set(vr.remoteTaskId, vr)
  }
  ok(`去重后: ${uniqueTasks.size} 个唯一视频任务`)

  let completedVideos = 0
  for (const [taskId, vr] of uniqueTasks) {
    const result = await pollVideoTask(taskId, `shot #${vr.shotNo}`)
    const localPath = `${videoDir}/shot_${vr.shotNo}_${vr.id.substring(0, 8)}.mp4`
    await downloadFile(result.videoUrl, localPath)
    s.downloadedVideos.push(localPath)
    ok(`已下载: ${localPath} (${(fs.statSync(localPath).size / 1024).toFixed(0)}KB)`)

    // 更新数据库：设置 videoUrl 和 remoteStatus
    try {
      await post(`/api/projects/${s.projectId}/episodes/${s.episodeId}/shot-videos/${vr.id}/check-task`)
    } catch { /* check-task 会更新 remote 状态 */ }
    completedVideos++
  }
  ok(`全部 ${completedVideos} 个视频下载完成`)

  // 确认所有视频片段
  log('Step 7c: 确认视频片段')
  const finalVidData = await gett(`/api/projects/${s.projectId}/episodes/${s.episodeId}/shot-videos`)
  for (const sg of (finalVidData.data.shots || [])) {
    for (const v of (sg.videos || [])) {
      if (!v.isSelected && !v.isConfirmed && (v.videoUrl || v.remoteStatus === 'completed')) {
        await post(`/api/projects/${s.projectId}/episodes/${s.episodeId}/shot-videos/${v.id}/select`)
        await post(`/api/projects/${s.projectId}/episodes/${s.episodeId}/shot-videos/${v.id}/confirm`)
      }
    }
  }
  ok('全部视频片段已确认')

  // ============================================
  // Step 8: FFmpeg 合成最终 MP4
  // ============================================
  log('Step 8: FFmpeg 合成最终 MP4')

  // 创建 concat 文件列表
  const concatFile = `/tmp/concat-${s.projectId}.txt`
  const concatLines = s.downloadedVideos.map(p => `file '${p}'`).join('\n')
  fs.writeFileSync(concatFile, concatLines)

  const finalDir = 'uploads/final_videos'
  fs.mkdirSync(finalDir, { recursive: true })
  s.finalVideoPath = `${finalDir}/${s.projectId}_ep1.mp4`

  // 合成：每个视频缩放到 1080×1920，然后拼接
  const normalizeDir = `/tmp/normalized-${s.projectId}`
  fs.mkdirSync(normalizeDir, { recursive: true })

  // 先单独标准化每个视频
  const normalizedFiles: string[] = []
  for (let i = 0; i < s.downloadedVideos.length; i++) {
    const out = `${normalizeDir}/shot_${i}.mp4`
    execSync(
      `ffmpeg -y -i "${s.downloadedVideos[i]}" -vf "scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2,fps=25,format=yuv420p" -c:v libx264 -preset fast -crf 23 -c:a aac -b:a 128k -ar 48000 "${out}"`,
      { encoding: 'utf-8', timeout: 120000, stdio: 'pipe' }
    )
    normalizedFiles.push(out)
    ok(`标准化 shot_${i}: ${(fs.statSync(out).size / 1024).toFixed(0)}KB`)
  }

  // 拼接标准化后的视频
  const normConcat = `/tmp/norm-concat-${s.projectId}.txt`
  fs.writeFileSync(normConcat, normalizedFiles.map(p => `file '${p}'`).join('\n'))

  execSync(
    `ffmpeg -y -f concat -safe 0 -i "${normConcat}" -c copy "${s.finalVideoPath}"`,
    { encoding: 'utf-8', timeout: 60000, stdio: 'pipe' }
  )

  const finalStat = fs.statSync(s.finalVideoPath)
  ok(`最终 MP4: ${s.finalVideoPath} (${(finalStat.size / 1024).toFixed(0)}KB)`)

  // ============================================
  // Step 9: ffprobe 验证
  // ============================================
  log('Step 9: ffprobe 验证')
  const probeOut = execSync(
    `ffprobe -v quiet -print_format json -show_format -show_streams "${s.finalVideoPath}"`,
    { encoding: 'utf-8' }
  )
  const probe = JSON.parse(probeOut)
  const vStream = probe.streams.find((st: { codec_type: string }) => st.codec_type === 'video')
  const aStream = probe.streams.find((st: { codec_type: string }) => st.codec_type === 'audio')

  ok(`时长: ${probe.format.duration}s`)
  ok(`分辨率: ${vStream?.width}x${vStream?.height}`)
  ok(`视频编码: ${vStream?.codec_name}`)
  ok(`音频编码: ${aStream?.codec_name || '无'}`)
  ok(`帧率: ${vStream?.r_frame_rate}`)
  ok(`文件大小: ${(finalStat.size / 1024).toFixed(0)}KB`)

  // 验证关键参数
  const duration = parseFloat(probe.format.duration)
  const checks = {
    '时长≈15s': duration >= 10 && duration <= 20,
    '分辨率1080×1920': vStream?.width === 1080 && vStream?.height === 1920,
    'H.264编码': vStream?.codec_name === 'h264',
    '有音轨': !!aStream,
  }

  console.log(`\n  质量检查:`)
  for (const [check, passed] of Object.entries(checks)) {
    console.log(`  ${passed ? '✅' : '⚠️'} ${check}`)
  }

  // ============================================
  // Step 10: QC 检查
  // ============================================
  log('Step 10: QC 质量检查')
  const qc = await post(`/api/projects/${s.projectId}/qc/run`)
  if (qc.success) {
    ok(`QC 完成 | 总分: ${qc.data.score} | 等级: ${qc.data.level}`)
    if (qc.data.issues?.length > 0) {
      for (const issue of qc.data.issues) {
        warn(`${issue.dimension}: ${issue.description} (${issue.severity})`)
      }
    }
  } else {
    warn('QC 未运行: ' + (qc.error || '未知'))
  }

  // ============================================
  // 最终报告
  // ============================================
  console.log(`\n${'='.repeat(60)}`)
  console.log('🎉 15s 短视频原型生成完成!')
  console.log(`${'='.repeat(60)}`)
  console.log(`project_id:        ${s.projectId}`)
  console.log(`story_package_id:  ${s.storyPackageId}`)
  console.log(`characters:        ${s.characterIds.length}`)
  console.log(`episode_id:        ${s.episodeId}`)
  console.log(`shots:             ${s.shotIds.length}`)
  console.log(`video_tasks:       ${s.videoRecords.length} (唯一: ${new Set(s.videoRecords.map(v => v.remoteTaskId)).size})`)
  console.log(`downloaded_videos: ${s.downloadedVideos.length}`)
  console.log(`final_video:       ${s.finalVideoPath}`)
  console.log(`final_size:        ${(finalStat.size / 1024).toFixed(0)}KB`)
  console.log(`duration:          ${probe.format.duration}s`)
  console.log(`resolution:        ${vStream?.width}x${vStream?.height}`)
  console.log(`codec:             ${vStream?.codec_name} / ${aStream?.codec_name || 'none'}`)
  console.log(`${'='.repeat(60)}\n`)

  ok('✅ 真实 API 15s 短视频原型全部完成！')
}

main().catch(e => { console.error('\n❌', e.message); process.exit(1) })
