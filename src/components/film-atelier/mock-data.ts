// ============================================
// Film Atelier — Mock 数据
// ============================================
import type {
  WorkflowStep,
  MediaCard,
  ImageComparePair,
  UploadFile,
  TimelineEntry,
  ImageOption,
  PromptTemplate,
  ModelOption,
} from './types'

// ---- 十步生产流程 ----
export const workflowSteps: WorkflowStep[] = [
  { id: 'project', title: '项目创建', description: '设置项目基本信息', status: 'completed' },
  { id: 'novel', title: '小说解析', description: '上传并解析原始文本', status: 'completed' },
  { id: 'script', title: '剧本改编', description: 'AI 改写为分镜剧本', status: 'completed' },
  { id: 'character', title: '角色设定', description: '定义角色外貌与性格', status: 'active' },
  { id: 'scene', title: '场景设定', description: '定义场景氛围与风格', status: 'generating' },
  { id: 'storyboard', title: '分镜脚本', description: '生成逐镜头脚本', status: 'locked' },
  { id: 'prompt', title: '提示词生成', description: '生成图片/视频 Prompt', status: 'locked' },
  { id: 'image', title: '图片生成', description: '批量生成分镜图', status: 'locked' },
  { id: 'video', title: '视频生成', description: '生成视频片段', status: 'locked' },
  { id: 'export', title: '合成导出', description: 'FFmpeg 合成成片', status: 'locked' },
]

// ---- 项目信息 ----
export const mockProject = {
  id: 'proj-001',
  name: '都市雨夜',
  type: '都市 / 悬疑',
  style: '韩漫 / 电影感',
  provider: 'agnes' as const,
  duration: 60,
  currentStep: 'character',
  saveStatus: '已保存',
}

// ---- 分镜图片（6-8张） ----
export const mockShotImages: MediaCard[] = [
  {
    id: 'shot-1',
    shotNo: 1,
    name: '雨夜街头',
    duration: '5s',
    aspectRatio: '9:16',
    resolution: '1024×1820',
    modelName: 'Agnes-Image-V2.0',
    status: 'selected',
    version: 'V2',
    thumbnailUrl: '',
    createdAt: '2 分钟前',
  },
  {
    id: 'shot-2',
    shotNo: 2,
    name: '便利店内部',
    duration: '4s',
    aspectRatio: '9:16',
    resolution: '1024×1820',
    modelName: 'Agnes-Image-V2.0',
    status: 'ready',
    version: 'V1',
    thumbnailUrl: '',
    createdAt: '3 分钟前',
  },
  {
    id: 'shot-3',
    shotNo: 3,
    name: '女主角特写',
    duration: '3s',
    aspectRatio: '9:16',
    resolution: '1024×1820',
    modelName: 'Agnes-Image-V2.0',
    status: 'generating',
    thumbnailUrl: '',
    createdAt: '刚刚',
  },
  {
    id: 'shot-4',
    shotNo: 4,
    name: '雨中奔跑',
    duration: '6s',
    aspectRatio: '9:16',
    resolution: '1024×1820',
    modelName: 'Agnes-Image-V2.0',
    status: 'ready',
    version: 'V1',
    thumbnailUrl: '',
    createdAt: '5 分钟前',
  },
  {
    id: 'shot-5',
    shotNo: 5,
    name: '电话亭旁',
    duration: '4s',
    aspectRatio: '9:16',
    resolution: '1024×1820',
    modelName: 'Agnes-Image-V2.0',
    status: 'error',
    version: 'V1',
    thumbnailUrl: '',
    createdAt: '8 分钟前',
  },
  {
    id: 'shot-6',
    shotNo: 6,
    name: '楼道阴影',
    duration: '3s',
    aspectRatio: '9:16',
    resolution: '1024×1820',
    modelName: 'Agnes-Image-V2.0',
    status: 'ready',
    version: 'V1',
    thumbnailUrl: '',
    createdAt: '10 分钟前',
  },
  {
    id: 'shot-7',
    shotNo: 7,
    name: '天台对峙',
    duration: '5s',
    aspectRatio: '9:16',
    resolution: '1024×1820',
    modelName: 'Agnes-Image-V2.0',
    status: 'ready',
    version: 'V2',
    thumbnailUrl: '',
    createdAt: '12 分钟前',
  },
  {
    id: 'shot-8',
    shotNo: 8,
    name: '黎明破晓',
    duration: '4s',
    aspectRatio: '9:16',
    resolution: '1024×1820',
    modelName: 'Agnes-Image-V2.0',
    status: 'ready',
    version: 'V1',
    thumbnailUrl: '',
    createdAt: '15 分钟前',
  },
]

// ---- 视频候选（4-6个） ----
// 注意：vid-1 和 vid-5 使用真实本地测试视频，其余使用空 videoUrl 验证无视频回退
const TEST_VIDEO = '/preview/test-assets/test-clip.mp4'

export const mockVideoCards: MediaCard[] = [
  {
    id: 'vid-1',
    shotNo: 1,
    name: '雨夜街头 - 完整',
    duration: '5s',
    aspectRatio: '9:16',
    resolution: '1280×768',
    modelName: 'Agnes-Video-V2.0',
    status: 'selected',
    version: 'V2',
    thumbnailUrl: '',
    videoUrl: TEST_VIDEO,
    createdAt: '10 分钟前',
  },
  {
    id: 'vid-2',
    shotNo: 1,
    name: '雨夜街头 - 备选',
    duration: '5s',
    aspectRatio: '9:16',
    resolution: '1280×768',
    modelName: 'Agnes-Video-V2.0',
    status: 'ready',
    version: 'V1',
    thumbnailUrl: '',
    videoUrl: '',
    createdAt: '12 分钟前',
  },
  {
    id: 'vid-3',
    shotNo: 2,
    name: '便利店内部',
    duration: '4s',
    aspectRatio: '9:16',
    resolution: '1280×768',
    modelName: 'Agnes-Video-V2.0',
    status: 'generating',
    thumbnailUrl: '',
    videoUrl: '',
    createdAt: '刚刚',
  },
  {
    id: 'vid-4',
    shotNo: 3,
    name: '女主角特写',
    duration: '3s',
    aspectRatio: '9:16',
    resolution: '1280×768',
    modelName: 'Agnes-Video-V2.0',
    status: 'error',
    thumbnailUrl: '',
    videoUrl: '',
    createdAt: '5 分钟前',
  },
  {
    id: 'vid-5',
    shotNo: 4,
    name: '雨中奔跑',
    duration: '6s',
    aspectRatio: '9:16',
    resolution: '1280×768',
    modelName: 'Agnes-Video-V2.0',
    status: 'ready',
    version: 'V1',
    thumbnailUrl: '',
    videoUrl: TEST_VIDEO,
    createdAt: '20 分钟前',
  },
]

// ---- 图片版本对比 ----
export const mockImageCompare: ImageComparePair = {
  id: 'compare-1',
  beforeLabel: 'V1 原始版本',
  afterLabel: 'V2 修复版本',
  beforeUrl: '',
  afterUrl: '',
  beforeVersion: 'V1',
  afterVersion: 'V2',
  beforeModel: 'Agnes-Image-V2.0',
  afterModel: 'Agnes-Image-V2.0',
  beforeTime: '15 分钟前',
  afterTime: '2 分钟前',
}

// ---- 上传文件 ----
export const mockUploadFiles: UploadFile[] = [
  {
    id: 'upload-1',
    name: '都市雨夜-原著.txt',
    size: 245760,
    type: 'text/plain',
    status: 'parsed',
    progress: 100,
    parseResult: '已解析 12 章，48 个场景',
  },
  {
    id: 'upload-2',
    name: '角色参考-女主.jpg',
    size: 1048576,
    type: 'image/jpeg',
    status: 'uploaded',
    progress: 100,
  },
  {
    id: 'upload-3',
    name: '场景参考-雨夜.png',
    size: 2097152,
    type: 'image/png',
    status: 'uploading',
    progress: 67,
  },
  {
    id: 'upload-4',
    name: '画风参考-韩漫.webp',
    size: 524288,
    type: 'image/webp',
    status: 'error',
    progress: 0,
    error: '文件格式不支持，请使用 JPG/PNG',
  },
]

// ---- 任务 Timeline ----
export const mockTaskTimeline: TimelineEntry[] = [
  {
    id: 'tl-1',
    title: '任务创建',
    status: 'completed',
    description: '图片生成任务已创建',
    timestamp: '14:32:01',
  },
  {
    id: 'tl-2',
    title: '进入队列',
    status: 'completed',
    description: '等待可用 Worker',
    timestamp: '14:32:02',
  },
  {
    id: 'tl-3',
    title: '开始生成',
    status: 'completed',
    description: '调用图片生成模型',
    timestamp: '14:32:15',
  },
  {
    id: 'tl-4',
    title: '一致性检查',
    status: 'error',
    description: '角色面部一致性未通过',
    timestamp: '14:34:22',
  },
  {
    id: 'tl-5',
    title: '自动重试',
    status: 'current',
    description: '使用修正后的 Prompt 重新生成',
    timestamp: '14:34:23',
  },
  {
    id: 'tl-6',
    title: '生成完成',
    status: 'upcoming',
    description: '等待最终结果',
  },
]

// ---- 图片选择项（Choose Image Dialog） ----
export const mockImageOptions: ImageOption[] = [
  { id: 'opt-1', url: '', label: '版本 1', version: 'V1', modelName: 'Agnes-Image-V2.0', createdAt: '5 分钟前' },
  { id: 'opt-2', url: '', label: '版本 2', version: 'V2', modelName: 'Agnes-Image-V2.0', createdAt: '3 分钟前', selected: true },
  { id: 'opt-3', url: '', label: '版本 3', version: 'V3', modelName: 'Agnes-Image-V2.0', createdAt: '1 分钟前' },
  { id: 'opt-4', url: '', label: '版本 4', version: 'V4', modelName: 'Agnes-Image-V2.0', createdAt: '刚刚' },
]

// ---- Prompt 模板 ----
export const mockPromptTemplates: PromptTemplate[] = [
  { id: 'tpl-1', name: '角色正面半身', description: '生成角色正面半身标准图', content: '正面半身像，{{character_name}}，{{appearance}}，{{clothing}}，高清，韩漫风格' },
  { id: 'tpl-2', name: '角色全身像', description: '生成角色全身参考图', content: '全身像，{{character_name}}，{{appearance}}，{{clothing}}，{{pose}}，高清，韩漫风格' },
  { id: 'tpl-3', name: '场景氛围图', description: '生成场景氛围概念图', content: '{{scene_name}}，{{atmosphere}}，{{lighting}}，{{weather}}，电影感构图，韩漫风格' },
  { id: 'tpl-4', name: '分镜特写', description: '生成分镜特写镜头', content: '特写镜头，{{character_name}}，{{expression}}，{{angle}}，背景虚化，电影感' },
]

// ---- 模型选项 ----
export const mockModelOptions: ModelOption[] = [
  { id: 'agnes-image', name: 'Agnes-Image-V2.0', provider: 'agnes', description: '免费，4 张/次' },
  { id: 'ark-image', name: '豆包-Seedream-5.0', provider: 'ark', description: '付费，角色一致性更好' },
  { id: 'agnes-video', name: 'Agnes-Video-V2.0', provider: 'agnes', description: '免费，8n+1 帧' },
  { id: 'ark-video', name: '豆包-Seedance-1.5-Pro', provider: 'ark', description: '付费，最高 12s' },
]

// ---- 占位图 SVG Data URL ----
export function getPlaceholderImage(width: number, height: number, label: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
    <rect fill="#202025" width="${width}" height="${height}"/>
    <text fill="#75727b" font-family="system-ui" font-size="13" x="50%" y="50%" text-anchor="middle" dominant-baseline="middle">${label}</text>
  </svg>`
  return `data:image/svg+xml,${encodeURIComponent(svg)}`
}

// ---- 状态文案映射 ----
export const generationStateLabels: Record<string, string> = {
  idle: '准备就绪',
  submitting: '正在提交任务',
  queued: '任务已进入队列',
  running: '正在生成',
  success: '生成成功',
  error: '生成失败',
  cancelled: '任务已取消',
}

export const uploadStateLabels: Record<string, string> = {
  idle: '等待上传',
  validating: '正在校验',
  uploading: '正在上传',
  uploaded: '上传完成',
  parsing: '正在解析',
  parsed: '解析完成',
  error: '上传失败',
}

// ---- 支持的文件类型 ----
export const supportedFileTypes = {
  document: ['.txt', '.doc', '.docx', '.pdf'],
  spreadsheet: ['.xls', '.xlsx', '.csv'],
  image: ['.jpg', '.jpeg', '.png', '.webp'],
  video: ['.mp4', '.webm', '.mov'],
  audio: ['.mp3', '.wav', '.m4a'],
}

export const allSupportedExtensions = Object.values(supportedFileTypes).flat()
