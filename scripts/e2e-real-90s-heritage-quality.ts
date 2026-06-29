// ============================================
// 真实 API：90 秒文旅非遗场景质量验收
// 题材：古城最后一盏花灯
// 固定 9 个 10 秒镜头，真实调用豆包文本、图片、视频模型，最终走 Worker + FFmpeg 成片。
// ============================================
import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'

const BASE = process.env.E2E_BASE_URL || 'http://localhost:3100'
const DATABASE_URL = process.env.DATABASE_URL

if (!DATABASE_URL) throw new Error('缺少 DATABASE_URL')
if (!process.env.ARK_API_KEY) throw new Error('缺少 ARK_API_KEY，无法执行真实 API 验收')
if (process.env.USE_MOCK_MODEL === 'true') throw new Error('USE_MOCK_MODEL=true，当前不是真实模型验收环境')

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: DATABASE_URL }),
})

type Task = {
  id: string
  status: string
  progress?: number
  errorMessage?: string | null
}

type ProjectResponse = {
  success: boolean
  data?: { id: string }
  error?: unknown
}

const log = (message: string) => console.log(`[90s-非遗验收] ${message}`)

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
    process.stdout.write(`\r[90s-非遗验收] ${label}：${task.status} ${task.progress ?? 0}%`)
    await new Promise(resolve => setTimeout(resolve, 5000))
  }
  throw new Error(`${label} 超时`)
}

async function createProject(): Promise<string> {
  const response = await post('/api/projects', {
    project_name: `90秒非遗文旅验收-${Date.now()}`,
    story_type: '文旅非遗短剧',
    background: '古城夜市人流变少，最后一家手工花灯摊即将收摊，返乡女孩用直播和真实手艺救下这门非遗。',
    main_characters: ['许澄'],
    core_conflict: '最后一盏鱼龙灯无人问津，老手艺人准备关灯离开，许澄必须在夜市结束前让游客重新看见它。',
    story_summary: '许澄回到古城夜市，发现外婆留下的花灯摊即将消失。她进入工坊补好最后一盏鱼龙灯，带到拱桥下直播展示制作过程，吸引游客停下，最后让灯重新亮回古城檐下。',
    art_style: '国风韩漫短剧，电影感夜景，真实文旅街区光影',
    target_platform: '抖音',
    episode_count: 1,
    episode_duration: 90,
    aspect_ratio: '9:16',
    audience: '18-35岁喜欢文旅、返乡创业、治愈短剧的用户',
    ending_type: '温暖钩子',
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
        title: '古城最后一盏花灯',
        logline: '返乡女孩用一场夜市直播救下即将熄灭的手工花灯摊。',
        theme: '年轻人的新方法，可以让老手艺重新被看见。',
      },
    },
  })

  const character = await prisma.character.create({
    data: {
      projectId,
      name: '许澄',
      gender: '女',
      age: 26,
      roleType: '主角',
      identity: '返乡文旅运营师，外婆花灯摊的继承人',
      appearance: {
        hair_color: '深棕黑色',
        hair_style: '低马尾，鬓边有两缕自然碎发',
        eyes: '深色杏眼，眼神温柔但坚定',
        skin: '自然白皙',
        face_shape: '柔和鹅蛋脸',
        body_shape: '修长轻盈',
      },
      clothing: {
        daily: {
          top: '米白色针织上衣，外搭短款朱砂红开衫',
          bottom: '深蓝色长裙',
          shoes: '白色帆布鞋',
          accessories: '细金色项链，棕色斜挎小包，腕上系一根红绳',
        },
      },
      signatureFeatures: ['低马尾', '朱砂红短开衫', '米白针织上衣', '深蓝长裙', '棕色斜挎包', '红绳手链'],
      zhFixedPrompt: '许澄，26岁中国女性，返乡文旅运营师，深棕黑色低马尾，鬓边自然碎发，深色杏眼，柔和鹅蛋脸，米白色针织上衣，短款朱砂红开衫，深蓝色长裙，白色帆布鞋，细金色项链，棕色斜挎小包，腕上红绳，温柔坚定，国风韩漫短剧风格。',
      enFixedPrompt: 'Xu Cheng, 26-year-old Chinese woman, returned hometown cultural-tourism operator, dark brown-black low ponytail with loose side strands, dark almond eyes, soft oval face, cream knit top, short cinnabar red cardigan, navy long skirt, white canvas shoes, thin gold necklace, brown crossbody bag, red string bracelet, gentle but determined, modern Chinese manhwa drama style.',
      referenceStyle: 'modern Chinese manhwa, warm lantern light, cinematic old town night market',
      confirmed: true,
    },
  })

  const episode = await prisma.episode.create({
    data: {
      projectId,
      episodeNo: 1,
      title: '第 1 集：古城最后一盏花灯',
      duration: 90,
      outline: '许澄发现花灯摊即将熄灭，进入工坊补灯，在拱桥下直播展示手艺，最后让花灯重新点亮。',
      coreTask: '用 90 秒完成发现、修复、展示、聚拢游客和重新点灯。',
      emotionCurve: '失落 → 惊醒 → 专注 → 紧张 → 被看见 → 温暖钩子',
      openingHook: '古城夜市快打烊时，唯一没亮的鱼龙灯被塞进旧木箱。',
      endingHook: '花灯重新亮起后，许澄在灯影里发现外婆留下的一张旧纸样。',
      status: 'CONFIRMED',
      confirmed: true,
    },
  })

  const fixedIdentity = 'Xu Cheng must remain the same woman in every shot: dark brown-black low ponytail, loose side strands, cream knit top, short cinnabar red cardigan, navy long skirt, brown crossbody bag, thin gold necklace, red string bracelet.'
  const noTextRule = 'No readable text, no fake Chinese, no subtitle, no watermark, no logo. If phone or livestream UI appears, use abstract hearts, dots, simple icons and progress blocks only.'

  const shots = [
    {
      shotNo: 1,
      shotName: '夜市收摊前的暗灯',
      startTime: 0,
      endTime: 10,
      sceneTime: '夜晚',
      location: '古城青石巷夜市',
      action: '许澄拖着小行李箱走进快打烊的古城夜市，视线落在一只没有点亮的鱼龙花灯上。',
      details: '青石路、木质摊架、红灯笼、远处游客剪影保持稳定，旧木箱里露出鱼龙灯轮廓。',
      camera: { shot_size: '中远景', angle: '平视', movement: '缓慢前移', depth_of_field: '中景深' },
      visual: { lighting: '暖黄色灯笼光与夜色蓝黑对比', color_tone: '暖金、朱红、青石灰', composition: '许澄在画面左侧，暗灯在右前景形成钩子' },
      emotion: '意外、被刺痛',
      dialogue: '这盏灯，怎么也要收起来了？',
    },
    {
      shotNo: 2,
      shotName: '翻出鱼龙灯纸样',
      startTime: 10,
      endTime: 20,
      sceneTime: '夜晚',
      location: '古城青石巷夜市',
      action: '许澄蹲下打开旧木箱，轻轻托起褪色的鱼龙灯纸样和竹篾灯骨。',
      details: '木箱、纸样、竹篾、红绳手链必须清楚可见，背景仍是同一条夜市青石巷。',
      camera: { shot_size: '近景', angle: '俯视手部', movement: '轻微下压', depth_of_field: '浅景深' },
      visual: { lighting: '灯笼暖光落在手和纸样上', color_tone: '暖金与旧纸米黄', composition: '双手托住纸样，鱼龙轮廓占画面中心' },
      emotion: '心疼、下定决心',
      dialogue: '外婆说过，灯不亮，街就少了一口气。',
    },
    {
      shotNo: 3,
      shotName: '游客从摊前走过',
      startTime: 20,
      endTime: 30,
      sceneTime: '夜晚',
      location: '古城青石巷夜市',
      action: '游客剪影从摊前走过，没有停下，许澄抬头看向巷口正在变暗的灯串。',
      details: '游客只作为虚化剪影，不抢主角；摊架、旧木箱、鱼龙灯位置保持与前两镜一致。',
      camera: { shot_size: '中景', angle: '侧面', movement: '慢速横移', depth_of_field: '浅景深' },
      visual: { lighting: '部分灯串逐渐暗下', color_tone: '暖光减少、青蓝夜色增强', composition: '许澄和暗下的摊位形成孤立感' },
      emotion: '紧张、不能再等',
      dialogue: '如果没人看见，它今晚就真的熄了。',
    },
    {
      shotNo: 4,
      shotName: '工坊点亮案台',
      startTime: 30,
      endTime: 40,
      sceneTime: '夜晚',
      location: '花灯工坊',
      action: '许澄推开木门走进花灯工坊，打开案台小灯，竹篾、彩纸、浆糊碗依次被照亮。',
      details: '木门、长案台、竹篾架、彩纸墙、半成品花灯构成固定工坊布局。',
      camera: { shot_size: '中景', angle: '轻微低角度', movement: '稳定跟随一步', depth_of_field: '深景深' },
      visual: { lighting: '案台暖光从暗处亮起', color_tone: '木色、朱红、暖黄', composition: '门口到案台形成纵深' },
      emotion: '进入状态',
      dialogue: '先把灯骨补起来。',
    },
    {
      shotNo: 5,
      shotName: '扎紧竹篾灯骨',
      startTime: 40,
      endTime: 50,
      sceneTime: '夜晚',
      location: '花灯工坊',
      action: '许澄用红绳扎紧鱼龙灯的竹篾骨架，指尖压住弯曲的竹条。',
      details: '红绳手链、竹篾骨架、米白袖口必须连续一致；背景保持同一张工坊案台。',
      camera: { shot_size: '特写', angle: '俯视手部', movement: '微距轻推', depth_of_field: '浅景深' },
      visual: { lighting: '手部暖光突出竹篾纹理', color_tone: '米黄、竹青、朱红', composition: '手、红绳、竹篾形成稳定三角' },
      emotion: '专注、屏住呼吸',
      dialogue: '弯的地方不能硬折，要顺着它的劲。',
    },
    {
      shotNo: 6,
      shotName: '手机架旁的第一次试灯',
      startTime: 50,
      endTime: 60,
      sceneTime: '夜晚',
      location: '花灯工坊',
      action: '许澄把手机架在案台边，点亮修好的鱼龙灯，屏幕边缘出现抽象直播爱心和圆点。',
      details: '手机屏幕不得出现文字，只有抽象图标；鱼龙灯、彩纸墙和案台位置保持稳定。',
      camera: { shot_size: '中近景', angle: '平视', movement: '缓慢推近', depth_of_field: '中景深' },
      visual: { lighting: '鱼龙灯内部暖光亮起，映在许澄脸上', color_tone: '暖金与朱红', composition: '手机边缘、许澄、花灯三点构图' },
      emotion: '看到希望',
      dialogue: '如果大家愿意停十秒，我就把它做完给你们看。',
    },
    {
      shotNo: 7,
      shotName: '拱桥下支起直播摊',
      startTime: 60,
      endTime: 70,
      sceneTime: '夜晚',
      location: '古城拱桥直播摊位',
      action: '许澄把鱼龙灯挂到拱桥下的临时摊位，手机支架对准灯，桥边水面倒映出暖光。',
      details: '拱桥、河面、木摊、手机支架、鱼龙灯位置要稳定；游客仍是远处剪影。',
      camera: { shot_size: '中全景', angle: '平视', movement: '轻微环绕', depth_of_field: '深景深' },
      visual: { lighting: '桥下暖光和水面反射', color_tone: '暖金、深蓝、朱红', composition: '拱桥居中，鱼龙灯悬在画面上方' },
      emotion: '紧张开场',
      dialogue: '今晚只讲一盏灯，从一根竹篾开始。',
    },
    {
      shotNo: 8,
      shotName: '游客停在灯影里',
      startTime: 70,
      endTime: 80,
      sceneTime: '夜晚',
      location: '古城拱桥直播摊位',
      action: '几个游客剪影被灯影吸引停下，许澄托着鱼龙灯转向人群，抽象爱心图标慢慢增多。',
      details: '不出现可读弹幕或字幕；游客只做背景剪影；拱桥、河面和摊位布局保持一致。',
      camera: { shot_size: '中景', angle: '侧逆光', movement: '缓慢推近', depth_of_field: '中景深' },
      visual: { lighting: '花灯光穿过纸面投出鱼鳞纹', color_tone: '暖金扩大、夜色变柔', composition: '许澄在灯影中心，游客围成半圆' },
      emotion: '被看见、松一口气',
      dialogue: '你们看，鱼鳞不是画上去的，是一层一层糊出来的。',
    },
    {
      shotNo: 9,
      shotName: '最后一盏灯重新挂起',
      startTime: 80,
      endTime: 90,
      sceneTime: '夜晚',
      location: '古城拱桥直播摊位',
      action: '许澄把鱼龙灯重新挂回檐下，灯光照亮她的脸，她在灯影里发现一张旧纸样被风轻轻翻起。',
      details: '鱼龙灯、红绳手链、旧纸样、檐下灯串清晰；结尾留一个旧纸样特写钩子。',
      camera: { shot_size: '近景', angle: '轻微仰角', movement: '从灯下移到脸再到纸样', depth_of_field: '浅景深' },
      visual: { lighting: '暖光稳定亮起，背景夜色柔和', color_tone: '金黄、朱红、深蓝', composition: '花灯在上方，许澄在下方，纸样在最后焦点' },
      emotion: '温暖、发现新线索',
      dialogue: '外婆，你留下的，不止这一盏灯。',
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
        characters: ['许澄'],
        action: shot.action,
        details: shot.details,
        camera: shot.camera,
        visual: shot.visual,
        emotion: shot.emotion,
        dialogue: shot.dialogue,
        purpose: '90秒文旅非遗短剧节奏推进',
        technicalNotes: '低形变图生视频镜头，使用角色参考图和场景参考图固化首帧。',
        confirmed: true,
      },
    })

    await prisma.imagePrompt.create({
      data: {
        shotId: createdShot.id,
        projectId,
        zhPrompt: `${shot.action}。${shot.details}。许澄固定形象：深棕黑色低马尾、米白针织上衣、朱砂红短开衫、深蓝长裙、棕色斜挎包、红绳手链。${noTextRule}`,
        enPrompt: `${fixedIdentity} ${shot.action} ${shot.details} Stable ${shot.location} at night, cinematic vertical Chinese manhwa drama first frame, clear visible action, consistent old town or workshop layout. ${noTextRule}`,
        negativePrompt: 'identity change, different hairstyle, different outfit, extra main character, deformed hands, bad fingers, warped body, inconsistent old town, inconsistent workshop, unstable lantern shape, readable text, fake Chinese, subtitles, watermark, logo, comic panels, poster layout',
        consistencyKeywords: 'Xu Cheng same face, same low ponytail, same cinnabar red cardigan, same navy skirt, same brown crossbody bag, same red string bracelet, stable lantern and scene layout',
        aspectRatio: '9:16',
        style: '国风韩漫短剧，电影感夜景，真实文旅街区光影',
        params: { quality: 'high', num_outputs: 4 },
        confirmed: true,
      },
    })

    await prisma.videoPrompt.create({
      data: {
        shotId: createdShot.id,
        projectId,
        prompt: `${fixedIdentity} Continue exactly from the first frame. ${shot.action} ${shot.details} One continuous cinematic shot, subtle readable motion, stable camera, stable ${shot.location} layout, no scene cut, no identity change, no fake text.`,
        duration: shot.endTime - shot.startTime,
        motionStrength: shot.shotNo === 7 || shot.shotNo === 8 ? 'medium' : 'low',
        cameraMotion: String(shot.camera.movement),
        characterMotion: shot.action,
        environmentMotion: 'lantern light flickers softly, background remains stable, no sudden layout change',
        negativePrompt: 'identity change, face morphing, different hairstyle, different outfit, unstable background, scene layout change, cutaway, jump cut, warped hands, bad fingers, fake Chinese text, subtitles, watermark, logo',
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
  log(`文本模型=${process.env.ARK_TEXT_MODEL || '未设置'}`)
  log(`图片模型=${process.env.ARK_IMAGE_MODEL || '未设置'}`)
  log(`视频模型=${process.env.ARK_VIDEO_MODEL || '未设置'}`)

  const projectId = await createProject()
  log(`项目创建：${projectId}`)

  const { episodeId } = await seedDeterministicEpisode(projectId)
  log(`固定剧集写入：${episodeId}`)

  const characterTask = await post(`/api/projects/${projectId}/character-images/generate?mode=consistency`)
  await waitTask(projectId, characterTask.data.taskId, '角色参考图生成', 25 * 60 * 1000)
  await confirmCharacterImages(projectId)

  const sceneTask = await post(`/api/projects/${projectId}/episodes/${episodeId}/scene-references/generate`)
  await waitTask(projectId, sceneTask.data.taskId, '场景参考图生成', 25 * 60 * 1000)

  const shotImageTask = await post(`/api/projects/${projectId}/episodes/${episodeId}/shot-images/generate`)
  await waitTask(projectId, shotImageTask.data.taskId, '分镜图生成', 40 * 60 * 1000)
  await confirmShotImages(projectId, episodeId)

  const shotVideoTask = await post(`/api/projects/${projectId}/episodes/${episodeId}/shot-videos/generate`)
  await waitTask(projectId, shotVideoTask.data.taskId, '视频片段生成', 70 * 60 * 1000)
  await confirmShotVideos(projectId, episodeId)

  const renderTask = await post(`/api/projects/${projectId}/episodes/${episodeId}/final-preview/render`)
  await waitTask(projectId, renderTask.data.taskId, '最终成片合成', 15 * 60 * 1000)

  const finalPreview = await get(`/api/projects/${projectId}/episodes/${episodeId}/final-preview`)
  const latest = finalPreview.data.latest
  if (!latest?.videoUrl) throw new Error('最终成片未生成')

  const finalVideoPath = localPathFromReadUrl(latest.videoUrl)
  console.log('\n=== 90s 非遗文旅真实质量验收完成 ===')
  console.log(`PROJECT_ID=${projectId}`)
  console.log(`EPISODE_ID=${episodeId}`)
  console.log(`FINAL_VIDEO_PATH=${finalVideoPath}`)
}

main()
  .catch(error => {
    console.error(`\n[90s-非遗验收] 失败：${(error as Error).message}`)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
