// ============================================
// 真实 API：30 秒全链路验收
// 题材：暴雨夜修伞铺
// 固定 4 个镜头，共 30 秒，走现有 Web API + Worker + FFmpeg + QC + 发布包链路。
// ============================================
import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { getRuntimeModelName } from '../src/server/model-adapters/model-config'

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

const log = (message: string) => console.log(`[30s-修伞铺] ${message}`)

function formatError(error: unknown): string {
  if (!error) return '未知错误'
  if (typeof error === 'string') return error
  try {
    return JSON.stringify(error)
  } catch {
    return String(error)
  }
}

function redactSignedUrl(url: string | null | undefined): string {
  if (!url) return ''
  try {
    const parsed = new URL(url)
    return `${parsed.origin}${parsed.pathname}${parsed.search ? '?<redacted>' : ''}`
  } catch {
    return url
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
    process.stdout.write(`\r[30s-修伞铺] ${label}：${task.status} ${task.progress ?? 0}%`)
    await new Promise(resolve => setTimeout(resolve, 5000))
  }
  throw new Error(`${label} 超时`)
}

async function createProject(): Promise<string> {
  const response = await post('/api/projects', {
    project_name: `30秒全链路验收-暴雨夜修伞铺-${Date.now()}`,
    story_type: '都市温情手艺短剧',
    background: '南方老街突降暴雨，一家即将关门的修伞铺在夜色里迎来急单。',
    main_characters: ['宋岚', '周远'],
    core_conflict: '外卖骑手周远急着送最后一单，修伞匠宋岚必须在暴雨里修好老伞，也重新证明这门手艺还有用。',
    story_summary: '暴雨夜，宋岚收拾即将关门的修伞铺，外卖骑手周远抱着断骨老伞闯进来。宋岚快速修伞，周远帮她撑起临时雨棚挡水。老伞修好后，两人冲进雨夜，伞铺灯重新亮起。',
    art_style: '国风韩漫都市短剧，雨夜老街，暖黄灯光，真实电影感',
    target_platform: '抖音',
    episode_count: 1,
    episode_duration: 30,
    aspect_ratio: '9:16',
    audience: '18-35岁喜欢都市温情、手艺守护、雨夜氛围短剧的用户',
    ending_type: '温暖治愈',
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
        title: '暴雨夜修伞铺',
        logline: '一把断骨老伞，让即将关门的修伞铺在暴雨夜重新亮起灯。',
        theme: '旧手艺的价值，常常在最需要它的时刻被重新看见。',
        basic_info: {
          genre: '都市温情手艺短剧',
          core_conflict: '暴雨夜的急单与即将关门的修伞铺形成冲突，宋岚必须用旧手艺证明它仍被需要。',
          emotional_tone: '雨夜紧张、灯下温暖、结尾治愈',
        },
        selling_points: ['雨夜老街氛围', '修伞旧手艺细节', '陌生人协作的温暖反转'],
        core_characters: [
          { name: '宋岚', role: '主角', hook: '即将关店的修伞铺继承人' },
          { name: '周远', role: '推动者', hook: '带着断骨老伞闯入的夜班骑手' },
        ],
        episode_outline: [
          {
            episode_no: 1,
            title: '暴雨夜修伞铺',
            hook: '修伞铺最后一盏灯将灭时，骑手抱着断骨老伞冲进雨夜。',
            summary: '急单闯入，宋岚抢修老伞，周远帮她挡雨，修好的伞让小店重新开灯。',
          },
        ],
      },
    },
  })

  await prisma.character.createMany({
    data: [
      {
        projectId,
        name: '宋岚',
        gender: '女',
        age: 31,
        roleType: '主角',
        identity: '老街修伞铺年轻继承人',
        personality: { tags: ['专注', '温和', '有韧性', '珍惜旧手艺'] },
        appearance: {
          hair_color: '黑色',
          hair_style: '低盘发，几缕碎发被雨气打湿',
          eyes: '深色杏眼，神情专注',
          skin: '自然浅肤色',
          face_shape: '鹅蛋脸',
          body_shape: '纤细但利落',
        },
        clothing: {
          daily: {
            top: '米色针织衫，外穿深青色帆布围裙',
            bottom: '深灰长裤',
            shoes: '黑色旧皮鞋',
            accessories: '银色顶针、细小工具袋、旧木柄伞',
          },
        },
        signatureFeatures: ['低盘发', '深青色帆布围裙', '银色顶针', '工具袋', '旧木柄伞'],
        zhFixedPrompt: '宋岚，31岁中国女性，老街修伞铺年轻继承人，黑色低盘发，几缕碎发被雨气打湿，深色杏眼，鹅蛋脸，米色针织衫，深青色帆布围裙，深灰长裤，黑色旧皮鞋，戴银色顶针，腰间细小工具袋，手持旧木柄伞，专注温和但有韧性，国风韩漫都市短剧风格。',
        enFixedPrompt: 'Song Lan, 31-year-old Chinese woman, young heir of an old umbrella repair shop, black low bun with a few damp wisps, dark almond eyes, oval face, cream knit top, deep teal canvas apron, dark gray trousers, old black leather shoes, silver thimble, small tool pouch, holding an old wooden-handle umbrella, focused gentle resilience, modern Chinese manhwa urban drama style.',
        referenceStyle: 'modern Chinese manhwa, rainy old street, warm umbrella repair shop, cinematic lighting',
        confirmed: true,
      },
      {
        projectId,
        name: '周远',
        gender: '男',
        age: 28,
        roleType: '重要配角',
        identity: '夜班外卖骑手',
        personality: { tags: ['真诚', '急切', '肯帮忙', '有责任感'] },
        appearance: {
          hair_color: '黑色',
          hair_style: '短发被雨水压乱',
          eyes: '深色眼睛，疲惫但真诚',
          skin: '健康小麦色',
          face_shape: '瘦长脸',
          body_shape: '结实清瘦',
        },
        clothing: {
          daily: {
            top: '黄色雨衣外套，没有品牌标识',
            bottom: '黑色防水裤',
            shoes: '深色雨靴',
            accessories: '黑色外卖箱、湿透头盔、断骨老伞',
          },
        },
        signatureFeatures: ['短湿发', '黄色无标识雨衣', '黑色外卖箱', '湿透头盔', '断骨老伞'],
        zhFixedPrompt: '周远，28岁中国男性，夜班外卖骑手，黑色短发被雨水压乱，瘦长脸，健康小麦色皮肤，结实清瘦，黄色无品牌雨衣外套，黑色防水裤，深色雨靴，背黑色外卖箱，拿湿透头盔和断骨老伞，疲惫但真诚，国风韩漫都市短剧风格。',
        enFixedPrompt: 'Zhou Yuan, 28-year-old Chinese man, night-shift delivery rider, short black hair flattened by rain, lean face, wheat-toned skin, wiry build, plain yellow raincoat without logos, black waterproof trousers, dark rain boots, black delivery box, wet helmet, broken-rib old umbrella, tired but sincere, modern Chinese manhwa urban drama style.',
        referenceStyle: 'modern Chinese manhwa, rainy old street delivery rider, warm cinematic night lighting',
        confirmed: true,
      },
    ],
  })

  const episode = await prisma.episode.create({
    data: {
      projectId,
      episodeNo: 1,
      title: '第 1 集：暴雨夜修伞铺',
      duration: 30,
      outline: '暴雨夜修伞铺将关门，外卖骑手带着断骨老伞闯入。宋岚抢修，周远帮她挡住漏雨。老伞修好，两人冲入雨夜，伞铺灯重新亮起。',
      coreTask: '用 30 秒完成急单、修伞、协作、重新开灯。',
      emotionCurve: '疲惫关门 -> 急单闯入 -> 专注抢修 -> 雨夜协作 -> 温暖重新出发',
      openingHook: '暴雨把老街招牌打得摇晃，宋岚正准备关掉修伞铺最后一盏灯。',
      endingHook: '修好的老伞撑开，伞铺门口的暖灯没有熄灭。',
      status: 'CONFIRMED',
      confirmed: true,
    },
  })

  const identityRules = [
    'Song Lan must remain the same woman in every shot: black low bun with damp wisps, cream knit top, deep teal canvas apron, silver thimble, small tool pouch, old wooden-handle umbrella.',
    'Zhou Yuan must remain the same delivery rider: short wet black hair, plain yellow raincoat without logos, black waterproof trousers, dark rain boots, black delivery box, wet helmet, broken-rib old umbrella.',
  ].join(' ')
  const noTextRule = 'No readable shop signs, no brand logo, no platform UI, no subtitles, no watermark, no fake Chinese text; any papers or signs must be abstract shapes only.'

  const shots = [
    {
      shotNo: 1, duration: 7, shotName: '暴雨关店',
      sceneTime: '雨夜', location: '南方老街修伞铺门口',
      characters: ['宋岚'],
      action: '宋岚站在老街修伞铺门口，正要关掉暖黄灯，暴雨冲刷青石路和一排旧伞。',
      details: '店门、旧伞架、工具台、雨帘和暖灯建立固定空间，招牌不能出现可读文字。',
      camera: { shot_size: '中景', angle: '平视', movement: '缓慢推近', depth_of_field: '中景深' },
      visual: { lighting: '暖黄店灯对比冷蓝雨夜', color_tone: '暖黄、深青、冷蓝', composition: '宋岚站在门口灯光边缘' },
      emotion: '疲惫和不舍',
      dialogue: '再修完今天，就真的关门吧。',
    },
    {
      shotNo: 2, duration: 8, shotName: '骑手急单',
      sceneTime: '雨夜', location: '修伞铺门口到店内',
      characters: ['宋岚', '周远'],
      action: '周远抱着断骨老伞冲进店里，雨水顺着黄色雨衣滴下，黑色外卖箱贴在背后。',
      details: '断骨老伞、湿透头盔、外卖箱和雨水脚印清楚，雨衣没有任何品牌标识。',
      camera: { shot_size: '中近景', angle: '门内视角', movement: '短促后退再稳定', depth_of_field: '中景深' },
      visual: { lighting: '门外冷雨光冲入店内暖光', color_tone: '黄色雨衣、暖木色、冷蓝雨夜', composition: '周远在门口，宋岚在工具台旁回头' },
      emotion: '急迫打断',
      dialogue: '这把伞，能不能十分钟内救回来？',
    },
    {
      shotNo: 3, duration: 8, shotName: '灯下抢修',
      sceneTime: '雨夜', location: '修伞铺工具台',
      characters: ['宋岚', '周远'],
      action: '宋岚在工具台灯下更换伞骨和缝线，周远撑起塑料布挡住屋檐漏下的雨水。',
      details: '银色顶针、细针线、伞骨、旧木柄和漏雨水线要清楚，动作慢而稳定。',
      camera: { shot_size: '近景', angle: '俯视手部到侧脸', movement: '缓慢横移', depth_of_field: '浅景深' },
      visual: { lighting: '台灯暖光集中在手部工具上', color_tone: '暖黄、深青、银色高光', composition: '修伞动作居中，周远在后景挡雨' },
      emotion: '专注协作',
      dialogue: '老东西不是慢，是不能糊弄。',
    },
    {
      shotNo: 4, duration: 7, shotName: '重新开灯',
      sceneTime: '雨夜', location: '老街雨巷',
      characters: ['宋岚', '周远'],
      action: '修好的老伞在雨夜撑开，周远冲向雨巷继续送单，宋岚站在门口把伞铺暖灯重新打开。',
      details: '伞面完整、雨线、青石路倒影和修伞铺暖灯清楚，结尾停在灯光和展开的伞面。',
      camera: { shot_size: '中远景', angle: '轻微低角度', movement: '缓慢拉远', depth_of_field: '深景深' },
      visual: { lighting: '暖灯洒到雨巷，冷雨形成轮廓光', color_tone: '暖黄、冷蓝、深青', composition: '伞面在前景打开，宋岚和店灯在背景' },
      emotion: '温暖重新出发',
      dialogue: '灯先不关了，也许下一把伞正在路上。',
    },
  ]

  let current = 0
  for (const shot of shots) {
    const startTime = current
    const endTime = current + shot.duration
    current = endTime

    const createdShot = await prisma.shot.create({
      data: {
        episodeId: episode.id,
        projectId,
        shotNo: shot.shotNo,
        shotName: shot.shotName,
        startTime,
        endTime,
        sceneTime: shot.sceneTime,
        location: shot.location,
        characters: shot.characters,
        action: shot.action,
        details: shot.details,
        camera: shot.camera,
        visual: shot.visual,
        emotion: shot.emotion,
        dialogue: shot.dialogue,
        purpose: '30秒真实 API 全链路验收：急单、修伞、协作、重新开灯。',
        technicalNotes: 'Seedance 1.5 Pro 图生视频，低到中等动作，保持连续单镜头；禁止可读文字、品牌、平台 UI。',
        confirmed: true,
      },
    })

    await prisma.imagePrompt.create({
      data: {
        shotId: createdShot.id,
        projectId,
        zhPrompt: `${shot.action}。${shot.details}。固定人物：宋岚低盘发深青色围裙银色顶针，周远短湿发黄色无标识雨衣黑色外卖箱。固定场景：南方老街修伞铺、暖黄灯、旧伞架、工具台、冷蓝雨夜。${noTextRule}`,
        enPrompt: `${identityRules} ${shot.action} ${shot.details} Cinematic vertical Chinese manhwa drama first frame, stable rainy old street umbrella repair shop layout, warm light against blue rain. ${noTextRule}`,
        negativePrompt: 'identity change, different hairstyle, different outfit, age change, extra main character, face morphing, deformed hands, bad fingers, unstable shop, unstable old street, readable text, fake Chinese, subtitles, watermark, logo, platform UI, brand mark, comic panels, poster layout',
        consistencyKeywords: 'Song Lan same low bun teal apron and silver thimble, Zhou Yuan same yellow raincoat and black delivery box, stable umbrella repair shop, stable tool table, stable rainy old street, no readable text',
        aspectRatio: '9:16',
        style: '国风韩漫都市短剧，雨夜老街，暖黄灯光，真实电影感',
        params: { quality: 'high', num_outputs: 4 },
        confirmed: true,
      },
    })

    await prisma.videoPrompt.create({
      data: {
        shotId: createdShot.id,
        projectId,
        prompt: `${identityRules} Continue exactly from the first frame. ${shot.action} ${shot.details} One continuous cinematic shot, no scene cut, stable camera, stable ${shot.location} layout, subtle readable motion, ${noTextRule}`,
        duration: shot.duration,
        motionStrength: shot.shotNo === 2 || shot.shotNo === 4 ? 'medium' : 'low',
        cameraMotion: String(shot.camera.movement),
        characterMotion: shot.action,
        environmentMotion: 'visible rain movement and gentle umbrella fabric motion while people and shop layout remain coherent',
        negativePrompt: 'identity change, face morphing, different hairstyle, different outfit, unstable background, scene layout change, cutaway, jump cut, warped hands, bad fingers, readable text, fake Chinese text, subtitles, watermark, logo, platform UI, brand mark',
        params: { aspect_ratio: '9:16', fps: 24 },
        confirmed: true,
      },
    })
  }

  await prisma.project.update({
    where: { id: projectId },
    data: { status: 'STORYBOARD_CONFIRMED' },
  })

  if (current !== 30) throw new Error(`固定分镜总时长不是 30 秒：${current}`)
  return { episodeId: episode.id }
}

async function confirmCharacterImages(projectId: string) {
  const images = await prisma.characterImage.findMany({
    where: { projectId },
    orderBy: [{ characterId: 'asc' }, { referenceType: 'asc' }, { createdAt: 'asc' }],
  })
  if (images.length < 6) throw new Error(`角色参考图数量不足：${images.length}`)
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
  if (confirmed !== 4) throw new Error(`确认分镜图数量不是 4：${confirmed}`)
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
  if (confirmed !== 4) throw new Error(`确认视频片段数量不是 4：${confirmed}`)
  log(`确认视频片段：${confirmed} 个`)
}

function configuredStorageProviderName(provider = process.env.MEDIA_STORAGE_PROVIDER || 'local'): string {
  if (provider === 'local') return 'local-fs'
  if (provider === 's3') return 's3-compatible'
  if (provider === 'aliyun-oss') return 'aliyun-oss'
  throw new Error(`未知 MEDIA_STORAGE_PROVIDER：${provider}`)
}

function expectedStorageProviderName(): string {
  const provider = process.env.MEDIA_STORAGE_PROVIDER || 'local'
  const configuredProvider = configuredStorageProviderName(provider)
  const remoteEnabled = process.env.MEDIA_STORAGE_ENABLE_REMOTE === 'true' || process.env.MEDIA_STORAGE_ENABLE_REMOTE === '1'
  return configuredProvider === 'local-fs' || !remoteEnabled ? 'local-fs' : configuredProvider
}

async function assertMediaStorage(projectId: string, episodeId: string) {
  const expectedProvider = expectedStorageProviderName()

  const [
    characterImages,
    sceneImages,
    shotImages,
    confirmedShotVideos,
    finalVideo,
  ] = await Promise.all([
    prisma.characterImage.findMany({ where: { projectId } }),
    prisma.sceneImage.findMany({ where: { projectId, scene: { episodeId } } }),
    prisma.shotImage.findMany({ where: { projectId, shot: { episodeId } } }),
    prisma.shotVideo.findMany({ where: { projectId, shot: { episodeId }, isConfirmed: true } }),
    prisma.finalVideo.findFirst({ where: { projectId, episodeId, status: 'READY' }, orderBy: { createdAt: 'desc' } }),
  ])

  const assertGroup = (
    name: string,
    records: Array<{ storageObjectKey: string | null; storageProvider: string | null; imageUrl?: string | null; videoUrl?: string | null }>,
    minCount: number,
  ) => {
    if (records.length < minCount) throw new Error(`${name} 数量不足：${records.length}/${minCount}`)
    const missing = records.filter(item => !item.storageObjectKey || item.storageProvider !== expectedProvider)
    if (missing.length > 0) throw new Error(`${name} 存在未写入 ${expectedProvider} 的记录：${missing.length}`)
    const unexpectedUrls = records.filter(item => {
      const url = item.imageUrl || item.videoUrl || ''
      const isLocalReadUrl = url.startsWith('/api/media/')
      return expectedProvider === 'local-fs'
        ? !isLocalReadUrl
        : isLocalReadUrl || url.startsWith('/api/local-media/') || url.startsWith('uploads/')
    })
    if (unexpectedUrls.length > 0) throw new Error(`${name} read URL 与 ${expectedProvider} 不匹配：${unexpectedUrls.length}`)
  }

  assertGroup('角色图', characterImages, 2)
  assertGroup('场景参考图', sceneImages, 1)
  assertGroup('分镜图', shotImages, 4)
  assertGroup('视频片段', confirmedShotVideos, 4)

  if (!finalVideo) throw new Error('未找到 READY 成片')
  if (finalVideo.storageProvider !== expectedProvider || !finalVideo.storageObjectKey) {
    throw new Error(`最终成片未写入 ${expectedProvider} storageObjectKey/storageProvider`)
  }
  if (!finalVideo.storageObjectKey.startsWith(`projects/${projectId}/final_videos/`)) {
    throw new Error(`最终成片 objectKey 不符合 final_videos 路径：${finalVideo.storageObjectKey}`)
  }
  const duration = finalVideo.duration || 0
  if (duration < 28 || duration > 32) {
    throw new Error(`最终成片时长未控制在 30 秒附近：${duration}s`)
  }

  const finalVideoIsLocalReadUrl = finalVideo.videoUrl?.startsWith('/api/media/')
  if (expectedProvider === 'local-fs' ? !finalVideoIsLocalReadUrl : finalVideoIsLocalReadUrl || finalVideo.videoUrl?.startsWith('/api/local-media/') || finalVideo.videoUrl?.startsWith('uploads/')) {
    throw new Error(`最终成片 read URL 与 ${expectedProvider} 不匹配：${finalVideo.videoUrl}`)
  }

  return {
    characterImages: characterImages.length,
    sceneImages: sceneImages.length,
    shotImages: shotImages.length,
    shotVideos: confirmedShotVideos.length,
    finalVideo,
  }
}

async function assertRemoteModeHasNoProjectLocalArtifacts(projectId: string) {
  if (expectedStorageProviderName() === 'local-fs') return
  const fs = await import('fs')
  const path = await import('path')
  const uploadRoot = path.resolve(process.cwd(), 'uploads')
  const candidates = [
    path.join(uploadRoot, 'media', 'projects', projectId),
    path.join(uploadRoot, 'final_videos'),
    path.join(uploadRoot, 'release_packages'),
  ]
  const leftovers: string[] = []
  for (const candidate of candidates) {
    if (!fs.existsSync(candidate)) continue
    const stat = fs.statSync(candidate)
    if (stat.isDirectory()) {
      if (candidate.endsWith(path.join('projects', projectId))) {
        leftovers.push(candidate)
        continue
      }
      const entries = fs.readdirSync(candidate).filter(name => name.includes(projectId))
      leftovers.push(...entries.map(name => path.join(candidate, name)))
    } else if (candidate.includes(projectId)) {
      leftovers.push(candidate)
    }
  }
  if (leftovers.length > 0) {
    throw new Error(`发现项目本地残留产物：${leftovers.join(', ')}`)
  }
}

async function main() {
  log(`BASE=${BASE}`)
  log(`文本模型=${getRuntimeModelName('text')}`)
  log(`图片模型=${getRuntimeModelName('image')}`)
  log(`视频模型=${getRuntimeModelName('video')}`)

  const startedAt = Date.now()
  const projectId = await createProject()
  log(`项目创建：${projectId}`)

  const { episodeId } = await seedDeterministicEpisode(projectId)
  log(`固定 30s 剧集写入：${episodeId}`)

  const characterTask = await post(`/api/projects/${projectId}/character-images/generate?mode=consistency`)
  await waitTask(projectId, characterTask.data.taskId, '角色参考图生成', 20 * 60 * 1000)
  await confirmCharacterImages(projectId)

  const sceneTask = await post(`/api/projects/${projectId}/episodes/${episodeId}/scene-references/generate`)
  await waitTask(projectId, sceneTask.data.taskId, '场景参考图生成', 35 * 60 * 1000)

  const shotImageTask = await post(`/api/projects/${projectId}/episodes/${episodeId}/shot-images/generate`)
  await waitTask(projectId, shotImageTask.data.taskId, '分镜图生成', 45 * 60 * 1000)
  await confirmShotImages(projectId, episodeId)

  const shotVideoTask = await post(`/api/projects/${projectId}/episodes/${episodeId}/shot-videos/generate`)
  await waitTask(projectId, shotVideoTask.data.taskId, '视频片段生成', 70 * 60 * 1000)
  await confirmShotVideos(projectId, episodeId)

  const renderTask = await post(`/api/projects/${projectId}/episodes/${episodeId}/final-preview/render`)
  await waitTask(projectId, renderTask.data.taskId, '最终成片合成', 20 * 60 * 1000)

  const finalPreview = await get(`/api/projects/${projectId}/episodes/${episodeId}/final-preview`)
  const latest = finalPreview.data.latest
  if (!latest?.videoUrl) throw new Error('最终成片未生成')

  const qc = await post(`/api/projects/${projectId}/episodes/${episodeId}/qc/run`, { episodeId })
  const qcResults = Array.isArray(qc.data?.results) ? qc.data.results : []
  const qcIssues = qcResults.flatMap((result: { issues?: unknown[] }) => result.issues || [])
  const failedQcResults = qcResults.filter((result: { passed?: boolean }) => result.passed === false)
  if (failedQcResults.length > 0 || qcIssues.length > 0) {
    throw new Error(`QC 未完全通过：failed=${failedQcResults.length}, issues=${qcIssues.length}`)
  }
  log(`QC 完成：${qcResults.length} 条结果，0 issues`)

  const releasePackage = await post(`/api/projects/${projectId}/episodes/${episodeId}/release-package/generate`)
  if (!releasePackage.data?.packageObjectKey) throw new Error('发布包未写入媒体存储 objectKey')

  const storage = await assertMediaStorage(projectId, episodeId)
  await assertRemoteModeHasNoProjectLocalArtifacts(projectId)

  console.log('\n=== 30s 修伞铺真实全链路验收完成 ===')
  console.log(`PROJECT_ID=${projectId}`)
  console.log(`EPISODE_ID=${episodeId}`)
  console.log(`FINAL_VIDEO_ID=${latest.id}`)
  console.log(`FINAL_VIDEO_URL=${redactSignedUrl(latest.videoUrl)}`)
  console.log(`FINAL_VIDEO_OBJECT_KEY=${storage.finalVideo.storageObjectKey}`)
  console.log(`FINAL_VIDEO_DURATION=${storage.finalVideo.duration}s`)
  console.log(`STORAGE_PROVIDER=${storage.finalVideo.storageProvider}`)
  console.log(`RELEASE_PACKAGE_OBJECT_KEY=${releasePackage.data.packageObjectKey}`)
  console.log(`ASSET_COUNTS=${JSON.stringify({
    characterImages: storage.characterImages,
    sceneImages: storage.sceneImages,
    shotImages: storage.shotImages,
    shotVideos: storage.shotVideos,
  })}`)
  console.log(`ELAPSED_SECONDS=${Math.round((Date.now() - startedAt) / 1000)}`)
}

main()
  .catch(error => {
    console.error(`\n[30s-修伞铺] 失败：${(error as Error).message}`)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
