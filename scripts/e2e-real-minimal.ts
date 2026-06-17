// ============================================
// REAL API Minimal E2E — 1 shot, 1 image, 1 video
// ============================================
import 'dotenv/config'
import fs from 'fs'
import { execSync } from 'child_process'
// Node 24 has built-in fetch

const BASE = 'http://localhost:3000'
const API_KEY = process.env.AGNES_TEXT_API_KEY || ''
const IMG_BASE = process.env.AGNES_IMAGE_API_BASE_URL || 'https://apihub.agnes-ai.com/v1'
const VID_BASE = process.env.AGNES_VIDEO_API_BASE_URL || 'https://apihub.agnes-ai.com/v1'
const IMG_MODEL = process.env.AGNES_IMAGE_MODEL || 'agnes-image-2.0-flash'
const VID_MODEL = process.env.AGNES_VIDEO_MODEL || 'agnes-video-v2.0'

const log = (msg: string) => console.log(`\x1b[36m[REAL]\x1b[0m ${msg}`)
const ok = (msg: string) => console.log(`\x1b[32m✅ ${msg}\x1b[0m`)
const fail = (msg: string) => { console.log(`\x1b[31m❌ ${msg}\x1b[0m`); process.exit(1) }

interface State {
  projectId: string; storyPackageId: string; characterIds: string[]
  episodeId: string; shotId: string
  realCharImgUrl: string; realShotImgUrl: string
  videoTaskId: string; realVideoPath: string; finalVideoPath: string
}

async function post(path: string, body?: Record<string,unknown>) {
  const res = await fetch(`${BASE}${path}`, { method:'POST', headers:{'Content-Type':'application/json'}, body: body ? JSON.stringify(body) : undefined })
  return res.json()
}
async function gett(path: string) { return (await fetch(`${BASE}${path}`)).json() }

async function downloadImage(url: string, localPath: string) {
  const res = await fetch(url); const buf = Buffer.from(await res.arrayBuffer())
  fs.writeFileSync(localPath, buf)
  return localPath
}

async function main() {
  console.log('\n🎬 REAL Agnes API Minimal E2E\n')
  console.log(`IMG Model: ${IMG_MODEL}`)
  console.log(`VID Model: ${VID_MODEL}\n`)

  const s: State = {} as State

  // 1. Create project
  log('Step 1: 创建项目')
  const proj = await post('/api/projects', {
    project_name: 'REAL-API-Minimal-Test', story_type: '现代',
    background: '现代都市互联网科技公司', main_characters: ['苏瑾'],
    core_conflict: '理想与现实的冲突抉择考验', story_summary: '苏瑾是一名刚毕业的产品经理，在科技公司遇到了传说中的技术总监。两人之间展开了一段关于梦想和爱情的故事，必须凑够二十字。',
    art_style: '韩漫', target_platform: '抖音', episode_count: 10, episode_duration: 90, aspect_ratio: '9:16',
  })
  if (!proj.success) fail('创建项目失败: ' + proj.error)
  s.projectId = proj.data.id; ok(`project_id=${s.projectId}`)

  // 2. Generate story (REAL text)
  log('Step 2: 真实生成故事方案')
  const story = await post(`/api/projects/${s.projectId}/story/generate`)
  if (!story.success) fail('故事生成失败: ' + story.error)
  s.storyPackageId = (await gett(`/api/projects/${s.projectId}/story`)).data.packages[0].id
  ok(`story_package_id=${s.storyPackageId}`)

  // 3. Confirm story
  log('Step 3: 确认故事方案')
  await post(`/api/projects/${s.projectId}/story/${s.storyPackageId}/confirm`)
  ok('故事方案已确认')

  // 4. Generate characters (REAL text)
  log('Step 4: 真实生成角色设定')
  const chars = await post(`/api/projects/${s.projectId}/characters/generate`)
  if (!chars.success) fail('角色生成失败: ' + chars.error)
  s.characterIds = (await gett(`/api/projects/${s.projectId}/characters`)).data.characters.map((c:{id:string})=>c.id)
  ok(`${s.characterIds.length} 个角色`)

  // 5. Confirm all characters
  log('Step 5: 确认全部角色')
  for (const cid of s.characterIds) await post(`/api/projects/${s.projectId}/characters/${cid}/confirm`)
  ok('角色已确认')

  // 6. Generate 1 real character image via direct API
  log('Step 6: 真实生成 1 张角色图')
  const charData = (await gett(`/api/projects/${s.projectId}/characters`)).data.characters[0]
  const charPrompt = charData.enFixedPrompt || charData.zhFixedPrompt || 'beautiful Chinese woman, Korean manhwa style'

  const imgRes = await fetch(`${IMG_BASE}/images/generations`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${API_KEY}` },
    body: JSON.stringify({ model: IMG_MODEL, prompt: charPrompt + ', portrait, elegant, high quality', aspect_ratio: '9:16', num_outputs: 1 }),
  })
  if (!imgRes.ok) fail(`图片 API 失败 (${imgRes.status})`)
  const imgData = await imgRes.json() as { data?: Array<{ url?: string }> }
  s.realCharImgUrl = imgData.data?.[0]?.url || ''
  if (!s.realCharImgUrl) fail('图片 URL 为空')
  ok(`real_character_image_url=${s.realCharImgUrl.substring(0,60)}...`)

  // Save image locally
  const charImgDir = 'uploads/probes/images'
  fs.mkdirSync(charImgDir, { recursive: true })
  await downloadImage(s.realCharImgUrl, `${charImgDir}/real-char-${s.projectId}.png`)
  ok('角色图已下载到本地')

  // Use existing API to generate ALL character images (3 chars × 4 = 12 real images)
  log('Step 6b: 批量生成角色图 (via real adapter)')
  const charImgsGen = await post(`/api/projects/${s.projectId}/character-images/generate`)
  if (!charImgsGen.success) fail('角色图批量生成失败: ' + charImgsGen.error)
  const charImgsList = await gett(`/api/projects/${s.projectId}/character-images`)
  const firstImgUrl = charImgsList.data.characters[0]?.images[0]?.imageUrl
  ok(`角色图生成成功 — 第一张 URL: ${firstImgUrl?.substring(0,60)}...`)

  // 7. Select + confirm ALL character images (required for storyboard)
  log('Step 7: 选择并确认全部标准角色图')
  for (const cg of charImgsList.data.characters) {
    if (cg.images.length > 0) {
      await post(`/api/projects/${s.projectId}/character-images/${cg.images[0].id}/select`)
      await post(`/api/projects/${s.projectId}/character-images/${cg.images[0].id}/confirm`)
    }
  }
  ok('全部标准角色图已确认')

  // 8. Generate storyboard (REAL text)
  log('Step 8: 真实生成分镜脚本')
  const sb = await post(`/api/projects/${s.projectId}/storyboard/generate`)
  if (!sb.success) fail('分镜生成失败: ' + sb.error)
  s.episodeId = sb.data.episode.id
  s.shotId = sb.data.shots[0]?.id
  ok(`episode_id=${s.episodeId} shots=${sb.data.shotCount}`)

  // 9. Confirm storyboard
  log('Step 9: 确认分镜脚本')
  await post(`/api/projects/${s.projectId}/episodes/${s.episodeId}/storyboard/confirm`)
  ok('分镜已确认')

  // 10. Generate 1 real shot image
  log('Step 10: 真实生成 1 个镜头图')
  const shotImgs = await post(`/api/projects/${s.projectId}/episodes/${s.episodeId}/shot-images/generate`)
  if (!shotImgs.success) fail('分镜图生成失败: ' + shotImgs.error)
  const shotImgsList = await gett(`/api/projects/${s.projectId}/episodes/${s.episodeId}/shot-images`)
  const firstShotImgId = shotImgsList.data.shots[0]?.images[0]?.id
  const firstShotImgUrl = shotImgsList.data.shots[0]?.images[0]?.imageUrl
  ok(`real_shot_image_url=${firstShotImgUrl?.substring(0,60)}...`)

  // 11. Select + confirm shot image
  log('Step 11: 选择并确认镜头图')
  await post(`/api/projects/${s.projectId}/episodes/${s.episodeId}/shot-images/${firstShotImgId}/select`)
  await post(`/api/projects/${s.projectId}/episodes/${s.episodeId}/shot-images/${firstShotImgId}/confirm`)
  ok('镜头图已确认')

  // 12. Generate 1 real shot video via direct API
  log('Step 12: 真实生成 1 个镜头视频')
  const vidRes = await fetch(`${VID_BASE}/videos`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${API_KEY}` },
    body: JSON.stringify({
      model: VID_MODEL,
      prompt: 'Slow push-in camera movement, gentle hair motion, cinematic lighting, Korean manhwa style, high quality',
      image: firstShotImgUrl,
      duration: 5,
      aspect_ratio: '9:16',
    }),
  })
  if (!vidRes.ok) fail(`视频 API 创建失败 (${vidRes.status}): ${(await vidRes.text()).substring(0,200)}`)
  const vidCreateData = await vidRes.json() as { task_id?: string; id?: string }
  s.videoTaskId = vidCreateData.task_id || vidCreateData.id
  if (!s.videoTaskId) fail(`无 task_id: ${JSON.stringify(vidCreateData).substring(0,200)}`)
  ok(`video_task_id=${s.videoTaskId}`)

  // 13. Poll until complete
  log('Step 13: 轮询视频状态...')
  let videoUrl = ''
  for (let i = 0; i < 120; i++) {
    await new Promise(r => setTimeout(r, 5000))
    const pollRes = await fetch(`${VID_BASE}/videos/${s.videoTaskId}`, { headers: { 'Authorization': `Bearer ${API_KEY}` } })
    const pollData = await pollRes.json() as { status?: string; progress?: number; video_url?: string; url?: string; output_url?: string }
    const st = pollData.status
    process.stdout.write(`\r   poll #${i+1}: status=${st} progress=${pollData.progress || '?'}%`)
    if (st === 'completed' || st === 'succeeded' || st === 'success') {
      videoUrl = pollData.video_url || pollData.url || pollData.output_url || ''
      ok(`\n   视频完成! url=${videoUrl.substring(0,60)}...`)
      break
    }
    if (st === 'failed' || st === 'error') {
      fail(`\n   视频失败: ${JSON.stringify(pollData).substring(0,300)}`)
    }
  }
  if (!videoUrl) fail('视频轮询超时 (10 分钟)')

  // 14. Download real video
  log('Step 14: 下载真实视频')
  const vidDir = 'uploads/probes/videos'
  fs.mkdirSync(vidDir, { recursive: true })
  s.realVideoPath = `${vidDir}/real-shot-${s.shotId}.mp4`
  await downloadImage(videoUrl, s.realVideoPath)
  const vidStat = fs.statSync(s.realVideoPath)
  ok(`downloaded: ${(vidStat.size/1024).toFixed(1)}KB`)

  // Save video record via internal API (uses real adapter with USE_MOCK_MODEL=false)
  log('Step 14b: 保存视频记录到数据库')
  const regen = await post(`/api/projects/${s.projectId}/episodes/${s.episodeId}/shots/${s.shotId}/videos/regenerate`)
  if (!regen.success) {
    console.log(`   ⚠️ regenerate 失败: ${regen.error}, 跳过 DB 记录`)
  } else {
    const vidData = await gett(`/api/projects/${s.projectId}/episodes/${s.episodeId}/shot-videos`)
    const firstVid = vidData.data?.shots?.[0]?.videos?.[0]
    if (firstVid) {
      await post(`/api/projects/${s.projectId}/episodes/${s.episodeId}/shot-videos/${firstVid.id}/select`)
      await post(`/api/projects/${s.projectId}/episodes/${s.episodeId}/shot-videos/${firstVid.id}/confirm`)
      ok('视频记录已确认')
    }
  }

  // 15. FFmpeg merge (single shot = normalize to 1080x1920)
  log('Step 15: FFmpeg 合成最终 MP4')
  const finalDir = 'uploads/final_videos'
  fs.mkdirSync(finalDir, { recursive: true })
  s.finalVideoPath = `${finalDir}/real-final-${s.projectId}.mp4`

  // Copy and normalize the real video
  execSync(`ffmpeg -y -i "${s.realVideoPath}" -vf "scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2,fps=25,format=yuv420p" -c:v libx264 -preset fast -crf 23 -c:a aac -b:a 128k "${s.finalVideoPath}"`, { encoding:'utf-8', timeout: 60000 })
  const finalStat = fs.statSync(s.finalVideoPath)
  ok(`final_video: ${(finalStat.size/1024).toFixed(1)}KB`)

  // 16. ffprobe final video
  log('Step 16: ffprobe 验证')
  const probeOut = execSync(`ffprobe -v quiet -print_format json -show_format -show_streams "${s.finalVideoPath}"`, { encoding:'utf-8' })
  const probe = JSON.parse(probeOut)
  const vStream = probe.streams.find((st: { codec_type: string }) => st.codec_type === 'video')
  ok(`duration=${probe.format.duration}s | ${vStream?.width}x${vStream?.height} | ${vStream?.r_frame_rate} | ${vStream?.codec_name}`)

  // 17. Final report
  console.log(`\n${'='.repeat(60)}`)
  console.log('🎉 REAL API Minimal E2E Complete!')
  console.log(`${'='.repeat(60)}`)
  console.log(`project_id:              ${s.projectId}`)
  console.log(`story_package_id:        ${s.storyPackageId}`)
  console.log(`character_count:         ${s.characterIds.length}`)
  console.log(`real_char_image_url:     ${s.realCharImgUrl?.substring(0,80)}...`)
  console.log(`episode_id:              ${s.episodeId}`)
  console.log(`shot_id:                 ${s.shotId}`)
  console.log(`real_shot_image_url:     ${firstShotImgUrl?.substring(0,80)}...`)
  console.log(`video_task_id:           ${s.videoTaskId}`)
  console.log(`real_shot_video_url:     ${videoUrl?.substring(0,80)}...`)
  console.log(`downloaded_video_path:   ${s.realVideoPath}`)
  console.log(`final_merged_video_path: ${s.finalVideoPath}`)
  console.log(`file_size:               ${(finalStat.size/1024).toFixed(1)}KB`)
  console.log(`duration:                ${probe.format.duration}s`)
  console.log(`resolution:              ${vStream?.width}x${vStream?.height}`)
  console.log(`fps:                     ${vStream?.r_frame_rate}`)
  console.log(`codec:                   ${vStream?.codec_name}`)
  console.log(`${'='.repeat(60)}\n`)
  ok('REAL API 最小闭环全部通过！')
}

main().catch(e => { console.error('\n❌', e.message); process.exit(1) })
