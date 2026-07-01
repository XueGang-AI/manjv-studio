// ============================================
// 真实 API：90 秒剧情丰富度验收
// 题材：蓝染球衣上场那天
// 固定 12 个镜头，共 90 秒，走现有 Web API + Worker + FFmpeg 成片链路。
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

const log = (message: string) => console.log(`[90s-蓝染球衣] ${message}`)

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
    process.stdout.write(`\r[90s-蓝染球衣] ${label}：${task.status} ${task.progress ?? 0}%`)
    await new Promise(resolve => setTimeout(resolve, 5000))
  }
  throw new Error(`${label} 超时`)
}

async function createProject(): Promise<string> {
  const response = await post('/api/projects', {
    project_name: `90秒剧情验收-蓝染球衣-${Date.now()}`,
    story_type: '文旅非遗返乡创业短剧',
    background: '贵州山地村寨准备夜赛，传统蓝染工坊濒临停摆，返乡女孩用直播运营和蓝染球衣让老手艺重新被看见。',
    main_characters: ['林青禾', '林守山', '阿野'],
    core_conflict: '便宜印花球衣即将替代村寨蓝染，林青禾必须说服父亲把祖传手艺做成真正属于球队的蓝染球衣。',
    story_summary: '林青禾返乡后发现蓝染工坊被旅游合作方放弃，父亲林守山坚持守着老染缸却拒绝网红化。她和队长阿野提出蓝染球衣方案，直播第一件球衣意外走红。夜赛前暴雨打湿球衣，全村连夜抢救。最终队员穿深蓝纹样球衣上场，父亲把 7 号球衣递给青禾完成和解。',
    art_style: '国风韩漫短剧，贵州山地村寨，电影感真实光影，非遗蓝染质感',
    target_platform: '抖音',
    episode_count: 1,
    episode_duration: 90,
    aspect_ratio: '9:16',
    audience: '18-35岁喜欢文旅、非遗、返乡创业、体育热血短剧的用户',
    ending_type: '温暖和解',
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
        title: '蓝染球衣上场那天',
        logline: '返乡直播运营女孩用一件蓝染球衣，把即将停摆的工坊和山地足球夜赛重新连在一起。',
        theme: '新方法不是消耗老手艺，而是让手艺回到真实生活里。',
      },
    },
  })

  await prisma.character.createMany({
    data: [
      {
        projectId,
        name: '林青禾',
        gender: '女',
        age: 26,
        roleType: '主角',
        identity: '返乡直播运营，曾在城市做短视频和直播策划',
        appearance: {
          hair_color: '黑色',
          hair_style: '利落低马尾，额前细碎刘海',
          eyes: '深色杏眼，眼神清亮',
          skin: '自然浅麦色',
          face_shape: '鹅蛋脸，下颌线清晰',
          body_shape: '修长敏捷',
        },
        clothing: {
          daily: {
            top: '米白色轻薄内搭，外穿灰绿色工装马甲',
            bottom: '深蓝直筒裤',
            shoes: '白色运动鞋',
            accessories: '黑色手机云台，棕色斜挎包，蓝染布手环',
          },
        },
        signatureFeatures: ['低马尾', '灰绿色工装马甲', '深蓝直筒裤', '手机云台', '棕色斜挎包', '蓝染布手环'],
        zhFixedPrompt: '林青禾，26岁中国女性，返乡直播运营，黑色利落低马尾，额前细碎刘海，深色杏眼，鹅蛋脸，下颌线清晰，米白色轻薄内搭，灰绿色工装马甲，深蓝直筒裤，白色运动鞋，棕色斜挎包，腕上蓝染布手环，常带黑色手机云台，清醒坚定，国风韩漫短剧风格。',
        enFixedPrompt: 'Lin Qinghe, 26-year-old Chinese woman, returned hometown livestream operator, neat black low ponytail with fine wispy bangs, dark almond eyes, oval face with clear jawline, cream lightweight inner top, gray-green utility vest, dark blue straight pants, white sneakers, brown crossbody bag, blue-dyed fabric wristband, often carrying a black phone gimbal, determined and clear-eyed, modern Chinese manhwa drama style.',
        referenceStyle: 'modern Chinese manhwa, Guizhou mountain village, indigo dye craft, cinematic daylight and night lights',
        confirmed: true,
      },
      {
        projectId,
        name: '林守山',
        gender: '男',
        age: 55,
        roleType: '父亲',
        identity: '蓝染匠人，林青禾的父亲',
        appearance: {
          hair_color: '黑灰色',
          hair_style: '短发略乱',
          eyes: '深色眼睛，眉头常皱',
          skin: '山地日晒肤色',
          face_shape: '方脸，颧骨明显',
          body_shape: '结实瘦削',
        },
        clothing: {
          daily: {
            top: '深靛蓝棉麻上衣',
            bottom: '黑色长裤',
            shoes: '旧布鞋',
            accessories: '深色围裙，手上有蓝染痕迹',
          },
        },
        signatureFeatures: ['黑灰短发', '深靛蓝棉麻上衣', '深色围裙', '蓝染手痕', '沉默固执'],
        zhFixedPrompt: '林守山，55岁中国男性，蓝染匠人，黑灰短发，方脸，山地日晒肤色，眉头常皱，深靛蓝棉麻上衣，黑色长裤，旧布鞋，深色围裙，手上有蓝染痕迹，沉默固执但有手艺尊严，国风韩漫短剧风格。',
        enFixedPrompt: 'Lin Shoushan, 55-year-old Chinese man, traditional indigo-dye craftsman, short black-gray hair, square face, sun-tanned mountain skin, often furrowed brows, deep indigo cotton-linen shirt, black trousers, old cloth shoes, dark apron, hands stained with indigo dye, silent stubborn dignity, modern Chinese manhwa drama style.',
        referenceStyle: 'modern Chinese manhwa, traditional indigo dye workshop, dignified artisan portrait',
        confirmed: true,
      },
      {
        projectId,
        name: '阿野',
        gender: '男',
        age: 24,
        roleType: '重要配角',
        identity: '村足球队队长，行动力强',
        appearance: {
          hair_color: '黑色',
          hair_style: '运动短发',
          eyes: '深色眼睛，笑起来有少年感',
          skin: '健康小麦色',
          face_shape: '瘦长脸',
          body_shape: '结实运动型',
        },
        clothing: {
          daily: {
            top: '深蓝训练外套或旧训练服',
            bottom: '黑色运动短裤或训练裤',
            shoes: '磨旧足球鞋',
            accessories: '足球和队长袖标',
          },
        },
        signatureFeatures: ['运动短发', '深蓝训练服', '磨旧足球鞋', '队长袖标', '足球'],
        zhFixedPrompt: '阿野，24岁中国男性，村足球队队长，黑色运动短发，瘦长脸，健康小麦色皮肤，结实运动型身材，深蓝训练外套，黑色运动裤，磨旧足球鞋，队长袖标，行动力强，有热血少年感，国风韩漫短剧风格。',
        enFixedPrompt: 'Aye, 24-year-old Chinese man, mountain village football team captain, short black athletic hair, lean face, healthy wheat-toned skin, fit athletic build, dark blue training jacket, black training pants, worn football shoes, captain armband, energetic and decisive, modern Chinese manhwa drama style.',
        referenceStyle: 'modern Chinese manhwa, mountain football team captain, sporty village youth',
        confirmed: true,
      },
    ],
  })

  const episode = await prisma.episode.create({
    data: {
      projectId,
      episodeNo: 1,
      title: '第 1 集：蓝染球衣上场那天',
      duration: 90,
      outline: '青禾返乡发现蓝染工坊停摆危机，与父亲冲突后提出蓝染球衣方案。直播走红带来订单压力，暴雨打湿球衣，全村连夜抢救，最终深蓝球衣上场，父女和解。',
      coreTask: '用 90 秒完成返乡、冲突、方案、走红、危机、协作、上场与和解。',
      emotionCurve: '失意返乡 → 冲突压抑 → 找到方案 → 意外走红 → 压力升级 → 暴雨危机 → 全村协作 → 热血上场 → 温暖和解',
      openingHook: '返乡的青禾拖箱走进村寨，远处夜赛灯架还没亮，蓝染布旗在风里发旧。',
      endingHook: '父亲把深蓝 7 号球衣递给青禾，她终于接住了这门手艺的下一棒。',
      status: 'CONFIRMED',
      confirmed: true,
    },
  })

  const identityRules = [
    'Lin Qinghe must remain the same woman in every shot: neat black low ponytail, fine wispy bangs, cream inner top, gray-green utility vest, dark blue straight pants, brown crossbody bag, blue-dyed fabric wristband, black phone gimbal when relevant.',
    'Lin Shoushan must remain the same older craftsman: short black-gray hair, square face, deep indigo cotton-linen shirt, dark apron, indigo-stained hands.',
    'Aye must remain the same young football captain: short athletic black hair, dark blue training outfit or indigo jersey, worn football shoes, captain armband when relevant.',
  ].join(' ')
  const phoneRule = 'Phones must show only the back, side view, black reflective screen, or be partly blocked by hands or fabric; no platform UI, no hearts, no likes, no check mark, no logo, no watermark, no subtitle, no readable text, no fake Chinese, no gibberish characters.'
  const jerseyRule = 'The indigo football jersey is deep blue with village-inspired geometric pattern and a simple number 7 symbol; no readable words or brand logo.'

  const shots = [
    {
      shotNo: 1, duration: 7, shotName: '返乡走进村寨',
      sceneTime: '清晨', location: '贵州山地村寨石板路',
      characters: ['林青禾'],
      action: '林青禾拖着行李箱走进贵州山地村寨，远处可见还未亮起的球场灯架和发旧的蓝染布旗。',
      details: '石板路、木楼、山雾、蓝染布旗、远处球场灯架建立空间；青禾低马尾、工装马甲和手机云台保持清楚。',
      camera: { shot_size: '中远景', angle: '平视', movement: '缓慢跟随', depth_of_field: '深景深' },
      visual: { lighting: '清晨柔光和山雾', color_tone: '青灰、深蓝、米白', composition: '青禾在石板路中央向村寨深处走' },
      emotion: '返乡失意但压着不甘',
      dialogue: '我以为回来只是躲一阵，没想到村里也在告别。',
    },
    {
      shotNo: 2, duration: 7, shotName: '停摆的蓝染工坊',
      sceneTime: '上午', location: '蓝染工坊',
      characters: ['林青禾', '林守山'],
      action: '林守山独自守着老染缸，货架冷清，青禾站在门口看到旧订单本上积灰。',
      details: '染缸、木案、竹夹、蓝染布样、旧订单本和冷清货架构成固定工坊布局。',
      camera: { shot_size: '中景', angle: '门口视角', movement: '轻微推入', depth_of_field: '中景深' },
      visual: { lighting: '工坊侧窗冷光落在染缸上', color_tone: '深靛蓝、木色、灰白', composition: '父亲在染缸旁，青禾在门口形成距离' },
      emotion: '沉默和隔阂',
      dialogue: '旅游合作方说，手工太慢，球衣改用印花。',
    },
    {
      shotNo: 3, duration: 8, shotName: '父女冲突',
      sceneTime: '上午', location: '蓝染工坊',
      characters: ['林青禾', '林守山'],
      action: '青禾把直播方案和蓝染球衣草图摊在木案上，林守山把草图推回去，父女隔着染缸争执。',
      details: '草图只显示抽象图块和球衣轮廓，不出现可读文字；染缸和木案位置延续上一镜。',
      camera: { shot_size: '中近景', angle: '侧面', movement: '轻微横移', depth_of_field: '中景深' },
      visual: { lighting: '窗光切开两人脸部', color_tone: '冷蓝与木色对比', composition: '染缸在两人中间象征分歧' },
      emotion: '压抑、争执',
      dialogue: '我不是要把手艺卖掉，我是想让它被人看见。',
    },
    {
      shotNo: 4, duration: 7, shotName: '旧球衣训练',
      sceneTime: '傍晚', location: '山地足球场',
      characters: ['林青禾', '阿野'],
      action: '阿野带队在山地足球场训练，旧球衣褪色起皱，他捡起足球看向青禾，期待真正属于村寨的球衣。',
      details: '足球、旧训练服、球场灯架、木楼背景和山坡看台清晰，避免复杂追球动作。',
      camera: { shot_size: '中全景', angle: '平视', movement: '稳定横移', depth_of_field: '深景深' },
      visual: { lighting: '傍晚金色余光照在球场', color_tone: '草绿、深蓝、暖金', composition: '阿野和队员在前景，青禾在场边' },
      emotion: '找到现实需求',
      dialogue: '我们想穿村里自己的颜色上场。',
    },
    {
      shotNo: 5, duration: 8, shotName: '第一件蓝染球衣',
      sceneTime: '下午', location: '蓝染工坊',
      characters: ['林青禾', '林守山', '阿野'],
      action: '林守山和青禾从染缸里一起捞出第一件深蓝球衣，阿野在旁边屏住呼吸，村寨纹样和简单 7 号逐渐显现。',
      details: `${jerseyRule} 染缸水面、手套、湿布纹理和蓝染手痕要清楚，动作保持慢而稳定。`,
      camera: { shot_size: '近景', angle: '俯视手部到中景', movement: '缓慢上扬', depth_of_field: '浅景深' },
      visual: { lighting: '工坊暖光落在湿润深蓝布面', color_tone: '深靛蓝、暖木色、白色高光', composition: '球衣从染缸中心被托起' },
      emotion: '第一次共同完成',
      dialogue: '这不是商品，是我们村的队服。',
    },
    {
      shotNo: 6, duration: 8, shotName: '直播走红',
      sceneTime: '黄昏', location: '直播摊位',
      characters: ['林青禾', '林守山', '阿野'],
      action: '青禾在直播摊位前展示蓝染球衣，手机支架只露出背面和黑屏反光，游客围上来，桌上订单纸和打包动作表现走红。',
      details: `${phoneRule} 直播成立感通过补光灯、围观人群、样衣、打包订单和动作表达。`,
      camera: { shot_size: '中景', angle: '平视', movement: '缓慢推近', depth_of_field: '中景深' },
      visual: { lighting: '补光灯和黄昏暖光混合', color_tone: '暖金、深蓝、灰绿', composition: '青禾在中心举起球衣，手机背面在侧前景' },
      emotion: '意外走红、父亲仍不完全相信',
      dialogue: '不要看屏幕，看这道纹样，是一遍遍染出来的。',
    },
    {
      shotNo: 7, duration: 7, shotName: '订单压力赶制',
      sceneTime: '傍晚', location: '竹架晾布区',
      characters: ['林青禾', '林守山', '阿野'],
      action: '工坊外竹架挂满深蓝球衣和布样，青禾核对订单纸，父亲和老匠人赶制，阿野搬来新的竹架。',
      details: `${jerseyRule} 竹架、木夹、深蓝布料、号码球衣和订单纸形成压力，但订单纸不可读。`,
      camera: { shot_size: '中全景', angle: '平视', movement: '缓慢横移', depth_of_field: '深景深' },
      visual: { lighting: '傍晚斜光穿过晾布区', color_tone: '深蓝、竹青、暖黄', composition: '球衣在上方成排，人物在下方穿梭' },
      emotion: '忙碌、压力升高',
      dialogue: '夜赛前，必须让每一件都干透。',
    },
    {
      shotNo: 8, duration: 8, shotName: '暴雨冲进晾布区',
      sceneTime: '雨夜', location: '竹架晾布区',
      characters: ['林青禾', '林守山', '阿野'],
      action: '暴雨突然冲进晾布区，竹架摇晃，几件蓝染球衣被打湿，青禾伸手护住 7 号球衣。',
      details: '雨水、湿布、手电、竹架和深蓝球衣清楚；动作有危机感但不要大规模混乱。',
      camera: { shot_size: '中景', angle: '轻微低角度', movement: '短促但稳定的推近', depth_of_field: '中景深' },
      visual: { lighting: '手电光和雨夜蓝黑对比', color_tone: '冷蓝、深靛蓝、白色雨线', composition: '7 号球衣在画面中心被保护' },
      emotion: '危机爆发',
      dialogue: '不能让它们全毁在今晚！',
    },
    {
      shotNo: 9, duration: 8, shotName: '全村连夜抢救',
      sceneTime: '雨夜', location: '蓝染工坊',
      characters: ['林青禾', '林守山', '阿野'],
      action: '林守山带老匠人复染，阿野和队员搬竹架，孩子递木夹，青禾放下带货话术，用手机背面记录全村协作。',
      details: `${phoneRule} 工坊内染缸、湿球衣、手电、竹夹和众人协作构成群像，三位核心角色保持主线。`,
      camera: { shot_size: '中全景', angle: '平视', movement: '缓慢环绕', depth_of_field: '深景深' },
      visual: { lighting: '工坊暖光和手电交错', color_tone: '暖黄、深蓝、雨夜黑', composition: '染缸居中，人物围绕协作' },
      emotion: '群像协作、父亲开始转变',
      dialogue: '今天不卖货，只拍他们怎么把衣服救回来。',
    },
    {
      shotNo: 10, duration: 7, shotName: '夜赛上场',
      sceneTime: '夜晚', location: '灯光球场',
      characters: ['林青禾', '林守山', '阿野'],
      action: '阿野带队穿着深蓝蓝染球衣走进灯光球场，青禾和父亲站在场边看着队伍入场。',
      details: `${jerseyRule} 球场灯光、草地、看台、队员队列和深蓝球衣稳定，避免复杂追球。`,
      camera: { shot_size: '中远景', angle: '轻微低角度', movement: '缓慢前移', depth_of_field: '深景深' },
      visual: { lighting: '强烈球场灯和夜色对比', color_tone: '深蓝、草绿、白色灯光', composition: '队伍从光里走来，父女在侧边同框' },
      emotion: '热血上场',
      dialogue: '输赢不急，先让他们看见我们的颜色。',
    },
    {
      shotNo: 11, duration: 8, shotName: '夜市文旅转化',
      sceneTime: '夜晚', location: '夜市文创摊',
      characters: ['林青禾', '林守山', '阿野'],
      action: '夜市文创摊重新热闹，游客围看蓝染球衣、围巾和小挂件，阿野拿着足球和游客合影，父亲整理样衣。',
      details: '摊位上的体验牌只做抽象图形不可读；蓝染球衣、围巾、小挂件、手机支架和补光灯稳定出现。',
      camera: { shot_size: '中景', angle: '平视', movement: '慢速横移', depth_of_field: '中景深' },
      visual: { lighting: '夜市暖灯和球场余光', color_tone: '暖金、深蓝、朱红点缀', composition: '游客围成半圆，工坊产品在中心' },
      emotion: '被看见后的松动',
      dialogue: '原来他们不是只想买一件衣服，是想知道这颜色从哪里来。',
    },
    {
      shotNo: 12, duration: 7, shotName: '7号球衣和解',
      sceneTime: '夜晚', location: '灯光球场边',
      characters: ['林青禾', '林守山'],
      action: '林守山把深蓝 7 号蓝染球衣递给青禾，青禾接过球衣，父女在球场灯下终于相视一笑。',
      details: `${jerseyRule} 近景突出蓝染纹样、7 号、父亲蓝染手痕和青禾蓝染布手环，背景是柔焦灯光球场。`,
      camera: { shot_size: '近景', angle: '平视', movement: '从球衣推到父女表情', depth_of_field: '浅景深' },
      visual: { lighting: '球场灯形成柔和轮廓光', color_tone: '深靛蓝、暖白灯光、灰绿色', composition: '7 号球衣在两人手中连接画面' },
      emotion: '和解、接棒',
      dialogue: '爸，我想把它穿上，也把它做下去。',
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
        purpose: '90秒剧情丰富度真实 API 验收：返乡、冲突、方案、走红、危机、协作、上场、和解。',
        technicalNotes: 'Seedance 1.5 Pro 图生视频，低到中等动作，保持连续单镜头；手机屏幕禁止平台 UI 和伪文字。',
        confirmed: true,
      },
    })

    await prisma.imagePrompt.create({
      data: {
        shotId: createdShot.id,
        projectId,
        zhPrompt: `${shot.action}。${shot.details}。固定人物：林青禾低马尾灰绿色工装马甲，林守山深靛蓝棉麻上衣和围裙，阿野运动短发深蓝训练服。固定道具：深蓝蓝染球衣、染缸、竹架、手机支架、足球。${phoneRule}`,
        enPrompt: `${identityRules} ${shot.action} ${shot.details} Cinematic vertical Chinese manhwa drama first frame, stable ${shot.location} layout, Guizhou mountain village and indigo-dye craft atmosphere. ${phoneRule}`,
        negativePrompt: 'identity change, different hairstyle, different outfit, age change, extra main character, face morphing, deformed hands, bad fingers, warped body, unstable village, unstable workshop, unstable football field, readable text, fake Chinese, subtitles, watermark, logo, platform UI, hearts, likes, check mark, floating UI icons, brand mark, comic panels, poster layout',
        consistencyKeywords: 'Lin Qinghe same low ponytail and utility vest, Lin Shoushan same indigo shirt and apron, Aye same athletic short hair, stable indigo jersey, stable dye vat, stable bamboo rack, stable phone stand, no phone UI',
        aspectRatio: '9:16',
        style: '国风韩漫短剧，贵州山地村寨，电影感真实光影，非遗蓝染质感',
        params: { quality: 'high', num_outputs: 4 },
        confirmed: true,
      },
    })

    await prisma.videoPrompt.create({
      data: {
        shotId: createdShot.id,
        projectId,
        prompt: `${identityRules} Continue exactly from the first frame. ${shot.action} ${shot.details} One continuous cinematic shot, no scene cut, stable camera, stable ${shot.location} layout, subtle readable motion, ${phoneRule}`,
        duration: shot.duration,
        motionStrength: shot.shotNo === 8 || shot.shotNo === 10 ? 'medium' : 'low',
        cameraMotion: String(shot.camera.movement),
        characterMotion: shot.action,
        environmentMotion: shot.shotNo === 8 ? 'rain moves visibly while people remain coherent' : 'gentle fabric movement, stable background, no sudden layout change',
        negativePrompt: 'identity change, face morphing, different hairstyle, different outfit, unstable background, scene layout change, cutaway, jump cut, warped hands, bad fingers, readable text, fake Chinese text, subtitles, watermark, logo, platform UI, hearts, likes, red check mark, floating interface icons, brand mark',
        params: { aspect_ratio: '9:16', fps: 24 },
        confirmed: true,
      },
    })
  }

  await prisma.project.update({
    where: { id: projectId },
    data: { status: 'STORYBOARD_CONFIRMED' },
  })

  return { episodeId: episode.id }
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

async function assertOssBackedStorage(projectId: string, episodeId: string) {
  const expectedProvider = process.env.MEDIA_STORAGE_PROVIDER
  if (expectedProvider !== 'aliyun-oss') {
    throw new Error(`MEDIA_STORAGE_PROVIDER 必须为 aliyun-oss，当前为 ${expectedProvider || '未设置'}`)
  }

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
    const missing = records.filter(item => !item.storageObjectKey || item.storageProvider !== 'aliyun-oss')
    if (missing.length > 0) throw new Error(`${name} 存在未转存 OSS 的记录：${missing.length}`)
    const localUrls = records.filter(item => {
      const url = item.imageUrl || item.videoUrl || ''
      return url.startsWith('/api/local-media/') || url.startsWith('/api/media/') || url.startsWith('uploads/')
    })
    if (localUrls.length > 0) throw new Error(`${name} 仍返回本地 URL：${localUrls.length}`)
  }

  assertGroup('角色图', characterImages, 3)
  assertGroup('场景参考图', sceneImages, 1)
  assertGroup('分镜图', shotImages, 12)
  assertGroup('视频片段', confirmedShotVideos, 12)

  if (!finalVideo) throw new Error('未找到 READY 成片')
  if (finalVideo.storageProvider !== 'aliyun-oss' || !finalVideo.storageObjectKey) {
    throw new Error('最终成片未写入 OSS storageObjectKey/storageProvider')
  }
  if (!finalVideo.storageObjectKey.startsWith(`projects/${projectId}/final_videos/`)) {
    throw new Error(`最终成片 objectKey 不符合 final_videos 路径：${finalVideo.storageObjectKey}`)
  }
  if (finalVideo.videoUrl?.startsWith('/api/local-media/') || finalVideo.videoUrl?.startsWith('uploads/')) {
    throw new Error(`最终成片仍是本地 URL：${finalVideo.videoUrl}`)
  }

  return {
    characterImages: characterImages.length,
    sceneImages: sceneImages.length,
    shotImages: shotImages.length,
    shotVideos: confirmedShotVideos.length,
    finalVideo,
  }
}

async function assertNoProjectLocalArtifacts(projectId: string) {
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
  log(`文本模型=${process.env.ARK_TEXT_MODEL || '未设置'}`)
  log(`图片模型=${process.env.ARK_IMAGE_MODEL || '未设置'}`)
  log(`视频模型=${process.env.ARK_VIDEO_MODEL || '未设置'}`)

  const startedAt = Date.now()
  const projectId = await createProject()
  log(`项目创建：${projectId}`)

  const { episodeId } = await seedDeterministicEpisode(projectId)
  log(`固定剧集写入：${episodeId}`)

  const characterTask = await post(`/api/projects/${projectId}/character-images/generate?mode=quick`)
  await waitTask(projectId, characterTask.data.taskId, '角色参考图生成', 20 * 60 * 1000)
  await confirmCharacterImages(projectId)

  const sceneTask = await post(`/api/projects/${projectId}/episodes/${episodeId}/scene-references/generate`)
  await waitTask(projectId, sceneTask.data.taskId, '场景参考图生成', 35 * 60 * 1000)

  const shotImageTask = await post(`/api/projects/${projectId}/episodes/${episodeId}/shot-images/generate`)
  await waitTask(projectId, shotImageTask.data.taskId, '分镜图生成', 60 * 60 * 1000)
  await confirmShotImages(projectId, episodeId)

  const shotVideoTask = await post(`/api/projects/${projectId}/episodes/${episodeId}/shot-videos/generate`)
  await waitTask(projectId, shotVideoTask.data.taskId, '视频片段生成', 90 * 60 * 1000)
  await confirmShotVideos(projectId, episodeId)

  const renderTask = await post(`/api/projects/${projectId}/episodes/${episodeId}/final-preview/render`)
  await waitTask(projectId, renderTask.data.taskId, '最终成片合成', 20 * 60 * 1000)

  const finalPreview = await get(`/api/projects/${projectId}/episodes/${episodeId}/final-preview`)
  const latest = finalPreview.data.latest
  if (!latest?.videoUrl) throw new Error('最终成片未生成')

  const qc = await post(`/api/projects/${projectId}/episodes/${episodeId}/qc/run`, { episodeId })
  log(`QC 完成：${Array.isArray(qc.data) ? qc.data.length : 0} 份报告`)

  const releasePackage = await post(`/api/projects/${projectId}/episodes/${episodeId}/release-package/generate`)
  if (!releasePackage.data?.packageObjectKey) throw new Error('发布包未写入 OSS objectKey')

  const storage = await assertOssBackedStorage(projectId, episodeId)
  await assertNoProjectLocalArtifacts(projectId)

  console.log('\n=== 90s 蓝染球衣真实剧情验收完成 ===')
  console.log(`PROJECT_ID=${projectId}`)
  console.log(`EPISODE_ID=${episodeId}`)
  console.log(`FINAL_VIDEO_ID=${latest.id}`)
  console.log(`FINAL_VIDEO_URL=${redactSignedUrl(latest.videoUrl)}`)
  console.log(`FINAL_VIDEO_OBJECT_KEY=${storage.finalVideo.storageObjectKey}`)
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
    console.error(`\n[90s-蓝染球衣] 失败：${(error as Error).message}`)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
