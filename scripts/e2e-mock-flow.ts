// ============================================
// E2E Mock 全流程测试
// 从创建项目到最终 MP4 的完整自动流程
// 使用 USE_MOCK_MODEL=true
// ============================================
import { execSync } from 'child_process'
import fs from 'fs'

const BASE = process.env.E2E_BASE_URL || 'http://localhost:3000'

const log = (msg: string) => console.log(`\x1b[36m[E2E]\x1b[0m ${msg}`)
const ok = (msg: string) => console.log(`\x1b[32m✅ ${msg}\x1b[0m`)
const fail = (msg: string): never => { console.log(`\x1b[31m❌ ${msg}\x1b[0m`); process.exit(1) }

async function post(path: string, body?: Record<string, unknown>) {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  })
  return res.json()
}

async function get(path: string) {
  const res = await fetch(`${BASE}${path}`)
  return res.json()
}

interface TestState {
  projectId: string
  storyPackageId: string
  characterIds: string[]
  characterImageIds: string[]
  episodeId: string
  shotIds: string[]
  shotImageIds: string[]
  shotVideoIds: string[]
  finalVideoId: string
  finalVideoUrl: string
}

interface ProjectTask {
  id: string
  taskType: string
  status: string
  progress?: number
  errorMessage?: string | null
  output?: Record<string, unknown> | null
}

async function waitTask(
  projectId: string,
  taskId: string,
  label: string,
  timeoutMs = 120_000,
  intervalMs = 1_000
): Promise<ProjectTask> {
  const startedAt = Date.now()

  while (Date.now() - startedAt < timeoutMs) {
    const tasks = await get(`/api/projects/${projectId}/tasks`)
    if (!tasks.success) fail(`获取任务状态失败: ${tasks.error}`)

    const task = (tasks.data as ProjectTask[]).find(t => t.id === taskId)
    if (!task) fail(`${label}任务不存在: ${taskId}`)

    if (task.status === 'success') {
      ok(`${label}任务完成`)
      return task
    }
    if (task.status === 'failed' || task.status === 'cancelled') {
      fail(`${label}任务失败: ${task.errorMessage || task.status}`)
    }

    await new Promise(r => setTimeout(r, intervalMs))
  }

  fail(`${label}任务等待超时: ${taskId}`)
}

async function main() {
  const state: TestState = {} as TestState
  console.log('\n🎬 AI 漫剧 E2E Mock 全流程测试\n')

  // Check server
  try { await get('/api/health') } catch { fail('服务未启动，请先运行 npm run dev') }
  ok('服务健康检查通过')

  // 1. Create project
  log('Step 1: 创建项目')
  const proj = await post('/api/projects', {
    project_name: 'E2E 测试项目',
    story_type: '现代', background: '现代都市职场，互联网行业',
    main_characters: ['苏瑾', '陆沉', '白晓'],
    core_conflict: '理想与现实的抉择，爱情与事业的博弈',
    story_summary: '苏瑾是一名刚毕业的互联网产品经理，在白晓的推荐下入职星辰科技。在这里她遇到了传说中的技术总监陆沉。三人之间展开了一段关于梦想、爱情和成长的都市故事。至少二十字。',
    art_style: '韩漫', target_platform: '抖音',
    episode_count: 10, episode_duration: 90, aspect_ratio: '9:16',
  })
  if (!proj.success) fail('创建项目失败: ' + proj.error)
  state.projectId = proj.data.id; ok(`创建项目成功 project_id=${state.projectId}`)

  // 2. Generate story
  log('Step 2: 生成故事方案')
  let story = await post(`/api/projects/${state.projectId}/story/generate`)
  if (!story.success) fail('故事生成失败: ' + story.error)
  await waitTask(state.projectId, story.data.taskId, '故事方案生成')
  story = await get(`/api/projects/${state.projectId}/story`)
  state.storyPackageId = story.data.packages[0]?.id
  if (!state.storyPackageId) fail('故事方案未生成')
  ok(`故事方案生成成功 story_package_id=${state.storyPackageId}`)

  // 3. Confirm story
  log('Step 3: 确认故事方案')
  const storyConfirm = await post(`/api/projects/${state.projectId}/story/${state.storyPackageId}/confirm`)
  if (!storyConfirm.success) fail('故事确认失败: ' + storyConfirm.error)
  ok('故事方案确认成功')

  // 4. Generate characters
  log('Step 4: 生成角色设定卡')
  const chars = await post(`/api/projects/${state.projectId}/characters/generate`)
  if (!chars.success) fail('角色生成失败: ' + chars.error)
  await waitTask(state.projectId, chars.data.taskId, '角色设定生成')
  const charList = await get(`/api/projects/${state.projectId}/characters`)
  state.characterIds = charList.data.characters.map((c: {id:string}) => c.id)
  ok(`角色生成成功 characters=${state.characterIds.length}`)

  // 5. Confirm all characters
  log('Step 5: 确认全部角色')
  for (const cid of state.characterIds) {
    const r = await post(`/api/projects/${state.projectId}/characters/${cid}/confirm`)
    if (!r.success) fail(`角色确认失败: ${r.error}`)
  }
  ok('角色全部确认成功')

  // 6. Generate character images
  log('Step 6: 生成角色候选图')
  const charImgs = await post(`/api/projects/${state.projectId}/character-images/generate`)
  if (!charImgs.success) fail('角色图生成失败: ' + charImgs.error)
  await waitTask(state.projectId, charImgs.data.taskId, '角色图生成')
  const charImgList = await get(`/api/projects/${state.projectId}/character-images`)
  state.characterImageIds = charImgList.data.characters.flatMap((c: {images: Array<{id:string}>}) => c.images.map((i: {id:string}) => i.id))
  ok(`角色图生成成功 images=${state.characterImageIds.length}`)

  // 7+8. Auto confirm character images
  log('Step 7+8: 自动确认标准角色图')
  const charAutoConfirm = await post(`/api/projects/${state.projectId}/character-images/batch-confirm`)
  if (!charAutoConfirm.success) fail('角色图自动确认失败: ' + charAutoConfirm.error)
  ok(`标准角色图自动确认成功 confirmed=${charAutoConfirm.data.confirmedCount}`)

  // 9. Generate storyboard
  log('Step 9: 生成第 1 集分镜')
  const sb = await post(`/api/projects/${state.projectId}/storyboard/generate`)
  if (!sb.success) fail('分镜生成失败: ' + sb.error)
  const sbTask = await waitTask(state.projectId, sb.data.taskId, '分镜生成')
  state.episodeId = sbTask.output?.episode_id as string
  if (!state.episodeId) fail('分镜任务未返回 episode_id')
  ok(`分镜生成成功 shots=${sbTask.output?.shot_count || 0} episode_id=${state.episodeId}`)

  // 10. Confirm storyboard
  log('Step 10: 确认分镜脚本')
  const sbConfirm = await post(`/api/projects/${state.projectId}/episodes/${state.episodeId}/storyboard/confirm`)
  if (!sbConfirm.success) fail('分镜确认失败: ' + sbConfirm.error)
  ok('分镜确认成功')

  // 11. Generate scene references
  log('Step 11: 生成场景参考图')
  const sceneRefs = await post(`/api/projects/${state.projectId}/episodes/${state.episodeId}/scene-references/generate`)
  if (!sceneRefs.success) fail('场景参考图生成失败: ' + sceneRefs.error)
  await waitTask(state.projectId, sceneRefs.data.taskId, '场景参考图生成')
  const sceneRefList = await get(`/api/projects/${state.projectId}/episodes/${state.episodeId}/scene-references`)
  if (!sceneRefList.success) fail('获取场景参考图失败: ' + sceneRefList.error)
  ok(`场景参考图生成成功 scenes=${sceneRefList.data.scenes.length}`)

  // 12. Generate shot images
  log('Step 12: 生成分镜图')
  const shotImgs = await post(`/api/projects/${state.projectId}/episodes/${state.episodeId}/shot-images/generate`)
  if (!shotImgs.success) fail('分镜图生成失败: ' + shotImgs.error)
  await waitTask(state.projectId, shotImgs.data.taskId, '分镜图生成')
  const shotImgList = await get(`/api/projects/${state.projectId}/episodes/${state.episodeId}/shot-images`)
  ok(`分镜图生成成功 shots=${shotImgList.data.shots.length}`)

  // 13+14. QC + auto confirm shot images
  log('Step 13+14: QC 并自动确认分镜图')
  const shotImageAutoConfirm = await post(`/api/projects/${state.projectId}/episodes/${state.episodeId}/automation/auto-confirm`, { threshold: 85 })
  if (!shotImageAutoConfirm.success || !shotImageAutoConfirm.data.confirmed) {
    fail('分镜图自动确认失败: ' + (shotImageAutoConfirm.error || shotImageAutoConfirm.data?.reason || 'unknown'))
  }
  ok(`分镜图自动确认成功 confirmed=${shotImageAutoConfirm.data.shotImages.confirmed}`)

  // 15. Generate shot videos
  log('Step 15: 生成视频片段')
  const vids = await post(`/api/projects/${state.projectId}/episodes/${state.episodeId}/shot-videos/generate`)
  if (!vids.success) fail('视频生成失败: ' + vids.error)
  await waitTask(state.projectId, vids.data.taskId, '视频片段生成')
  const vidList = await get(`/api/projects/${state.projectId}/episodes/${state.episodeId}/shot-videos`)
  ok(`视频片段生成成功 shots=${vidList.data.shots.length}`)

  // 16+17. QC + auto confirm shot videos
  log('Step 16+17: QC 并自动确认视频片段')
  const videoAutoConfirm = await post(`/api/projects/${state.projectId}/episodes/${state.episodeId}/automation/auto-confirm`, { threshold: 85 })
  if (!videoAutoConfirm.success || !videoAutoConfirm.data.confirmed) {
    fail('视频片段自动确认失败: ' + (videoAutoConfirm.error || videoAutoConfirm.data?.reason || 'unknown'))
  }
  ok(`视频片段自动确认成功 confirmed=${videoAutoConfirm.data.shotVideos.confirmed}`)

  // 18. Render final video
  log('Step 18: 合成最终视频')
  const render = await post(`/api/projects/${state.projectId}/episodes/${state.episodeId}/final-preview/render`)
  if (!render.success) fail('合成失败: ' + render.error)
  await waitTask(state.projectId, render.data.taskId, '最终视频合成')
  const finalPreview = await get(`/api/projects/${state.projectId}/episodes/${state.episodeId}/final-preview`)
  if (!finalPreview.success) fail('获取最终视频失败: ' + finalPreview.error)
  if (!finalPreview.data.latest) fail('最终视频未生成')
  state.finalVideoId = finalPreview.data.latest.id
  state.finalVideoUrl = finalPreview.data.latest.videoUrl
  ok(`最终视频合成成功 final_video_id=${state.finalVideoId}`)
  ok(`最终视频路径: ${state.finalVideoUrl}`)

  // 19. Run QC
  log('Step 19: 运行 QC')
  const qc = await post(`/api/projects/${state.projectId}/qc/run`)
  if (!qc.success) fail('QC 失败: ' + qc.error)
  const avgScore = Math.round((qc.data.results as Array<{score:number}>).reduce((s:number,r:{score:number}) => s + r.score, 0) / qc.data.results.length)
  ok(`QC 完成 score=${avgScore}`)

  // 20. Generate release package
  log('Step 20: 生成发布包')
  const releasePackage = await post(`/api/projects/${state.projectId}/episodes/${state.episodeId}/release-package/generate`)
  if (!releasePackage.success) fail('发布包生成失败: ' + releasePackage.error)
  ok(`发布包生成成功 path=${releasePackage.data.packageUrl}`)

  // 21. Verify final video file
  log('Step 21: 验证最终视频文件')
  const videoPath = state.finalVideoUrl
  if (!fs.existsSync(videoPath)) fail(`文件不存在: ${videoPath}`)
  const stat = fs.statSync(videoPath)
  if (stat.size === 0) fail('文件大小为 0')
  ok(`文件存在 size=${(stat.size/1024).toFixed(1)}KB`)

  try {
    const probe = execSync(`ffprobe -v quiet -print_format json -show_format -show_streams "${videoPath}"`, { encoding: 'utf-8' })
    const info = JSON.parse(probe)
    const vStream = info.streams.find((s: {codec_type: string}) => s.codec_type === 'video')
    const aStream = info.streams.find((s: {codec_type: string}) => s.codec_type === 'audio')

    ok(`ffprobe 检测通过`)
    ok(`  duration: ${info.format.duration}s`)
    ok(`  resolution: ${vStream?.width}x${vStream?.height}`)
    ok(`  fps: ${vStream?.r_frame_rate}`)
    ok(`  codec: ${vStream?.codec_name}`)
    ok(`  audio: ${aStream?.codec_name || 'none'}`)

    // Verify resolution
    if (vStream?.width !== 1080 || vStream?.height !== 1920) {
      console.log(`  ⚠️  resolution is ${vStream?.width}x${vStream?.height}, expected 1080x1920`)
    }
  } catch (e) {
    fail('ffprobe 检测失败: ' + (e as Error).message)
  }

  // 22. Final report
  console.log(`\n${'='.repeat(60)}`)
  console.log('🎉 E2E Mock 全流程测试完成')
  console.log(`${'='.repeat(60)}`)
  console.log(`project_id:      ${state.projectId}`)
  console.log(`episode_id:      ${state.episodeId}`)
  console.log(`final_video_id:  ${state.finalVideoId}`)
  console.log(`final_video_url: ${state.finalVideoUrl}`)
  console.log(`${'='.repeat(60)}\n`)

  ok('E2E 全部 22 步通过！')
}

main().catch(err => {
  console.error('\n❌ E2E 测试失败:', err.message)
  process.exit(1)
})
