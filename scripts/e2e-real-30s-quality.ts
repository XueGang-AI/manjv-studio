// ============================================
// 真实 API：30 秒一致性质量验收
// 固定剧本/角色/分镜，真实调用豆包图片与视频模型，最终走 Worker + FFmpeg 成片。
// ============================================
import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'

const BASE = process.env.E2E_BASE_URL || 'http://localhost:3100'
const DATABASE_URL = process.env.DATABASE_URL

if (!DATABASE_URL) throw new Error('缺少 DATABASE_URL')
if (!process.env.ARK_API_KEY) throw new Error('缺少 ARK_API_KEY，无法执行真实 API 质量验收')
if (process.env.USE_MOCK_MODEL === 'true') throw new Error('USE_MOCK_MODEL=true，当前不是真实模型验收环境')

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: DATABASE_URL }),
})

type Task = {
  id: string
  status: string
  errorMessage?: string | null
  output?: Record<string, unknown> | null
}

type ProjectResponse = {
  success: boolean
  data?: { id: string }
  error?: unknown
}

const log = (message: string) => console.log(`[30s-quality] ${message}`)

function formatError(error: unknown): string {
  if (!error) return '未知错误'
  if (typeof error === 'string') return error
  try {
    return JSON.stringify(error)
  } catch {
    return String(error)
  }
}

async function requestJson(path: string, init?: RequestInit) {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers || {}),
    },
    signal: AbortSignal.timeout(180_000),
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok || json.success === false) {
    throw new Error(`${path} 请求失败：${formatError(json.error || res.statusText)}`)
  }
  return json
}

async function post(path: string, body?: Record<string, unknown>) {
  return requestJson(path, {
    method: 'POST',
    body: body ? JSON.stringify(body) : undefined,
  })
}

async function get(path: string) {
  return requestJson(path)
}

async function waitTask(projectId: string, taskId: string, label: string, timeoutMs: number): Promise<Task> {
  const startedAt = Date.now()
  while (Date.now() - startedAt < timeoutMs) {
    const tasks = await get(`/api/projects/${projectId}/tasks`)
    const task = (tasks.data as Task[]).find(item => item.id === taskId)
    if (!task) throw new Error(`${label} 任务不存在：${taskId}`)
    if (task.status === 'success') {
      log(`${label} 完成`)
      return task
    }
    if (task.status === 'failed' || task.status === 'cancelled') {
      throw new Error(`${label} 失败：${task.errorMessage || task.status}`)
    }
    process.stdout.write(`\r[30s-quality] ${label}：${task.status} ${task.progress ?? 0}%`)
    await new Promise(resolve => setTimeout(resolve, 5000))
  }
  throw new Error(`${label} 超时`)
}

async function createProject(): Promise<string> {
  const response = await post('/api/projects', {
    project_name: `30秒一致性验收-${Date.now()}`,
    story_type: '都市职场',
    background: '深夜，科技公司风控系统出现异常回滚，女主必须在发布前阻止错误数据上线。',
    main_characters: ['林夏'],
    core_conflict: '系统回滚将在 30 秒内污染线上数据，林夏必须说服团队立即暂停发布。',
    story_summary: '林夏发现风控系统异常，核对备份后冲进玻璃战情室，用可视化证据说服团队，并按下暂停按钮止损。',
    art_style: '韩漫短剧，电影感，真实办公光影',
    target_platform: '抖音',
    episode_count: 1,
    episode_duration: 30,
    aspect_ratio: '9:16',
    audience: '18-35岁都市职场用户',
    ending_type: '强钩子',
  }) as ProjectResponse

  if (!response.success || !response.data?.id) {
    throw new Error(`创建项目失败：${formatError(response.error)}`)
  }
  return response.data.id
}

async function seedDeterministicEpisode(projectId: string) {
  await prisma.storyPackage.create({
    data: {
      projectId,
      version: 1,
      confirmed: true,
      content: {
        title: '深夜止损',
        logline: '30 秒内阻止一次会污染线上数据的错误发布。',
        theme: '专业判断和关键时刻的执行力',
      },
    },
  })

  const character = await prisma.character.create({
    data: {
      projectId,
      name: '林夏',
      gender: '女',
      age: 28,
      roleType: '主角',
      identity: '科技公司风控负责人',
      appearance: {
        hair_color: '黑色',
        hair_style: '高马尾，额前有少量自然碎发',
        eyes: '深色杏眼，眼神冷静锐利',
        skin: '自然白皙',
        face_shape: '鹅蛋脸',
        body_shape: '修长匀称',
      },
      clothing: {
        daily: {
          top: '白色丝质衬衫，袖口微卷',
          bottom: '蓝色高腰牛仔裤',
          shoes: '白色低帮运动鞋',
          accessories: '珍珠项链，银色腕表',
        },
      },
      signatureFeatures: ['高马尾', '白衬衫', '蓝色高腰牛仔裤', '珍珠项链', '银色腕表'],
      zhFixedPrompt: '林夏，28岁中国女性，科技公司风控负责人，黑色高马尾，额前自然碎发，深色杏眼，鹅蛋脸，白色丝质衬衫，蓝色高腰牛仔裤，珍珠项链，银色腕表，冷静专业，现代都市韩漫短剧风格。',
      enFixedPrompt: 'Lin Xia, 28-year-old Chinese woman, technology risk-control lead, long black high ponytail with loose bangs, dark almond eyes, oval face, white silk blouse with slightly rolled cuffs, blue high-waisted jeans, pearl necklace, silver wristwatch, calm professional expression, modern urban Korean manhwa drama style.',
      referenceStyle: 'modern urban Korean manhwa, cinematic office lighting',
      confirmed: true,
    },
  })

  const episode = await prisma.episode.create({
    data: {
      projectId,
      episodeNo: 1,
      title: '第 1 集：30秒止损',
      duration: 30,
      outline: '林夏发现异常回滚，核对证据，冲进战情室说服团队，并按下暂停发布按钮。',
      coreTask: '用 30 秒完成发现、核对、说服、止损的闭环。',
      emotionCurve: '警觉 → 紧张 → 果断 → 释放',
      openingHook: '红色风险警报突然照亮林夏的脸。',
      endingHook: '暂停成功后，屏幕角落又出现一个新的红点。',
      status: 'CONFIRMED',
      confirmed: true,
    },
  })

  const fixedIdentity = 'Lin Xia must remain the same woman in every shot: long black high ponytail, loose bangs, dark almond eyes, white silk blouse, blue high-waisted jeans, pearl necklace, silver wristwatch.'
  const noTextRule = 'No readable text, no fake Chinese, no subtitle, no watermark. Use abstract UI blocks, warning icons, charts, progress bars and button shapes only.'

  const shots = [
    {
      shotNo: 1,
      shotName: '红色警报照亮脸',
      startTime: 0,
      endTime: 6,
      sceneTime: '深夜',
      location: '风控办公室',
      action: '林夏坐在电脑前，红色风险警报的光打在脸上，她立刻停下敲键盘并抬眼确认异常。',
      details: '屏幕只显示红色警示图标、折线图和进度条，不出现文字。',
      camera: { shot_size: '近景', angle: '平视', movement: '缓慢推进', depth_of_field: '浅景深' },
      visual: { lighting: '冷蓝屏幕光与红色警报反光', color_tone: '蓝红对比', composition: '人物脸部和屏幕边缘形成紧张三角构图' },
      emotion: '警觉、压住慌张',
      dialogue: '不对，回滚已经开始了。',
    },
    {
      shotNo: 2,
      shotName: '插入安全钥匙核对备份',
      startTime: 6,
      endTime: 12,
      sceneTime: '深夜',
      location: '风控办公室',
      action: '林夏把银色安全钥匙插入电脑旁的接口，一手移动鼠标，一手翻开备份记录夹。',
      details: '桌面固定有键盘、鼠标、蓝色文件夹和银色安全钥匙。',
      camera: { shot_size: '中景', angle: '侧面', movement: '轻微跟随手部', depth_of_field: '中景深' },
      visual: { lighting: '稳定冷色办公灯', color_tone: '冷灰蓝', composition: '手部动作在画面下方清楚可见' },
      emotion: '快速判断',
      dialogue: '备份时间能对上，问题在发布队列。',
    },
    {
      shotNo: 3,
      shotName: '推开玻璃战情室门',
      startTime: 12,
      endTime: 18,
      sceneTime: '深夜',
      location: '玻璃战情室',
      action: '林夏推开玻璃门走进战情室，背景同事只作为虚化剪影，主屏发出红色警报光。',
      details: '玻璃墙、长桌、主屏幕和蓝色椅子保持固定空间布局。',
      camera: { shot_size: '中景', angle: '轻微低角度', movement: '稳定跟随一步', depth_of_field: '中景深' },
      visual: { lighting: '玻璃反射和红色警报光', color_tone: '冷白与红色点缀', composition: '林夏位于画面中心，主屏在后方' },
      emotion: '果断进入',
      dialogue: '所有人先停一下，我有证据。',
    },
    {
      shotNo: 4,
      shotName: '指向风险图说服团队',
      startTime: 18,
      endTime: 24,
      sceneTime: '深夜',
      location: '玻璃战情室',
      action: '林夏站在主屏前抬手指向红色风险曲线和三段进度条，团队剪影转头看向她。',
      details: '主屏只显示红色曲线、黄色警示三角和蓝色进度条，无文字。',
      camera: { shot_size: '中全景', angle: '平视', movement: '缓慢推近', depth_of_field: '深景深' },
      visual: { lighting: '主屏冷光照亮人物轮廓', color_tone: '白蓝底色加红色风险图', composition: '人物、主屏、长桌形成稳定三层空间' },
      emotion: '坚定、有压迫感',
      dialogue: '如果现在发布，错误数据会覆盖线上。',
    },
    {
      shotNo: 5,
      shotName: '按下暂停发布按钮',
      startTime: 24,
      endTime: 30,
      sceneTime: '深夜',
      location: '玻璃战情室',
      action: '林夏低头按下平板上的红色圆形暂停按钮，警报红光逐渐变暗，她终于轻轻呼出一口气。',
      details: '只展示红色圆形按钮和进度条变化，不出现按钮文字。',
      camera: { shot_size: '近景', angle: '俯视手部后抬到脸', movement: '轻微上移', depth_of_field: '浅景深' },
      visual: { lighting: '红光减弱，冷白灯恢复', color_tone: '从紧张红光回到冷白', composition: '手部动作到脸部情绪的连续焦点' },
      emotion: '紧绷后释放，但仍保持警惕',
      dialogue: '暂停成功。现在查是谁改了队列。',
    },
  ]

  for (const shot of shots) {
    const createdShot = await prisma.shot.create({
      data: {
        episodeId: episode.id,
        projectId,
        shotNo: shot.shotNo,
        shotName: shot.shotName,
        startTime: shot.startTime,
        endTime: shot.endTime,
        sceneTime: shot.sceneTime,
        location: shot.location,
        characters: ['林夏'],
        action: shot.action,
        details: shot.details,
        camera: shot.camera,
        visual: shot.visual,
        emotion: shot.emotion,
        dialogue: shot.dialogue,
        purpose: '30秒短剧节奏推进',
        technicalNotes: '低形变图生视频镜头，使用角色和场景参考图。',
        confirmed: true,
      },
    })

    await prisma.imagePrompt.create({
      data: {
        shotId: createdShot.id,
        projectId,
        zhPrompt: `${shot.action}。${shot.details}。林夏固定形象：黑色高马尾、白色丝质衬衫、蓝色高腰牛仔裤、珍珠项链、银色腕表。${noTextRule}`,
        enPrompt: `${fixedIdentity} ${shot.action} ${shot.details} Stable ${shot.location} at late night, cinematic Korean manhwa vertical drama first frame, clear visible action, consistent room layout. ${noTextRule}`,
        negativePrompt: 'identity change, different hairstyle, different outfit, extra main character, deformed hands, bad fingers, warped body, inconsistent room, unstable background, readable text, fake Chinese, subtitles, watermark, logo, comic panels, poster layout',
        consistencyKeywords: 'Lin Xia same face, same high ponytail, same white blouse, same blue jeans, same pearl necklace, same silver watch, stable room layout',
        aspectRatio: '9:16',
        style: '韩漫短剧，电影感，真实办公光影',
        params: { quality: 'high', num_outputs: 4 },
        confirmed: true,
      },
    })

    await prisma.videoPrompt.create({
      data: {
        shotId: createdShot.id,
        projectId,
        prompt: `${fixedIdentity} Continue exactly from the first frame. ${shot.action} ${shot.details} One continuous shot, subtle readable motion, stable camera, stable ${shot.location} layout, no scene cut, no identity change, no fake text.`,
        duration: shot.endTime - shot.startTime,
        motionStrength: shot.shotNo === 3 ? 'medium' : 'low',
        cameraMotion: String(shot.camera.movement),
        characterMotion: shot.action,
        environmentMotion: 'screen glow changes subtly, background remains stable',
        negativePrompt: 'identity change, face morphing, different hairstyle, different outfit, unstable background, room layout change, cutaway, jump cut, warped hands, bad fingers, fake Chinese text, subtitles, watermark, logo',
        params: { aspect_ratio: '9:16', fps: 24 },
        confirmed: true,
      },
    })
  }

  await prisma.project.update({
    where: { id: projectId },
    data: { status: 'STORYBOARD_CONFIRMED' },
  })

  return { characterId: character.id, episodeId: episode.id }
}

async function confirmCharacterImages(projectId: string) {
  const images = await prisma.characterImage.findMany({
    where: { projectId },
    orderBy: [{ characterId: 'asc' }, { referenceType: 'asc' }, { createdAt: 'asc' }],
  })
  for (const image of images) {
    await post(`/api/projects/${projectId}/character-images/${image.id}/select`)
    await post(`/api/projects/${projectId}/character-images/${image.id}/confirm`)
  }
  log(`确认角色参考图：${images.length} 张`)
}

async function confirmShotImages(projectId: string, episodeId: string) {
  const data = await get(`/api/projects/${projectId}/episodes/${episodeId}/shot-images`)
  let confirmed = 0
  for (const group of data.data.shots || []) {
    const image = group.images?.[0]
    if (!image) throw new Error(`镜头 #${group.shot.shotNo} 没有分镜图`)
    await post(`/api/projects/${projectId}/episodes/${episodeId}/shot-images/${image.id}/confirm`)
    confirmed++
  }
  log(`确认分镜图：${confirmed} 张`)
}

async function confirmShotVideos(projectId: string, episodeId: string) {
  const data = await get(`/api/projects/${projectId}/episodes/${episodeId}/shot-videos`)
  let confirmed = 0
  for (const group of data.data.shots || []) {
    const video = (group.videos || []).find((item: { videoUrl?: string; remoteStatus?: string }) =>
      !!item.videoUrl && ['completed', 'succeeded', 'success'].includes(item.remoteStatus || 'completed')
    )
    if (!video) throw new Error(`镜头 #${group.shot.shotNo} 没有可确认视频`)
    await post(`/api/projects/${projectId}/episodes/${episodeId}/shot-videos/${video.id}/select`)
    await post(`/api/projects/${projectId}/episodes/${episodeId}/shot-videos/${video.id}/confirm`)
    confirmed++
  }
  log(`确认视频片段：${confirmed} 个`)
}

function localPathFromReadUrl(url: string | null | undefined): string {
  if (!url) throw new Error('最终视频 URL 为空')
  const prefix = '/api/local-media/'
  if (url.startsWith(prefix)) {
    return `uploads/${decodeURIComponent(url.slice(prefix.length))}`
  }
  if (url.startsWith('uploads/')) return url
  return url
}

async function main() {
  log(`BASE=${BASE}`)

  const projectId = await createProject()
  log(`项目创建：${projectId}`)

  const { episodeId } = await seedDeterministicEpisode(projectId)
  log(`固定剧集写入：${episodeId}`)

  const characterTask = await post(`/api/projects/${projectId}/character-images/generate?mode=consistency`)
  await waitTask(projectId, characterTask.data.taskId, '角色参考图生成', 20 * 60 * 1000)
  await confirmCharacterImages(projectId)

  const sceneTask = await post(`/api/projects/${projectId}/episodes/${episodeId}/scene-references/generate`)
  await waitTask(projectId, sceneTask.data.taskId, '场景参考图生成', 20 * 60 * 1000)

  const shotImageTask = await post(`/api/projects/${projectId}/episodes/${episodeId}/shot-images/generate`)
  await waitTask(projectId, shotImageTask.data.taskId, '分镜图生成', 30 * 60 * 1000)
  await confirmShotImages(projectId, episodeId)

  const shotVideoTask = await post(`/api/projects/${projectId}/episodes/${episodeId}/shot-videos/generate`)
  await waitTask(projectId, shotVideoTask.data.taskId, '视频片段生成', 45 * 60 * 1000)
  await confirmShotVideos(projectId, episodeId)

  const renderTask = await post(`/api/projects/${projectId}/episodes/${episodeId}/final-preview/render`)
  await waitTask(projectId, renderTask.data.taskId, '最终成片合成', 10 * 60 * 1000)

  const finalPreview = await get(`/api/projects/${projectId}/episodes/${episodeId}/final-preview`)
  const latest = finalPreview.data.latest
  if (!latest?.videoUrl) throw new Error('最终成片未生成')

  const finalVideoPath = localPathFromReadUrl(latest.videoUrl)
  console.log('\n=== 30s 真实质量验收完成 ===')
  console.log(`PROJECT_ID=${projectId}`)
  console.log(`EPISODE_ID=${episodeId}`)
  console.log(`FINAL_VIDEO_PATH=${finalVideoPath}`)
}

main()
  .catch(error => {
    console.error(`\n[30s-quality] 失败：${(error as Error).message}`)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
