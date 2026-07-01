// ============================================
// 真实 API 恢复：蓝染球衣上场那天
// 从既有项目/剧集的场景参考图失败阶段继续，不重建故事、角色或镜头。
// ============================================
import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'

const BASE = process.env.E2E_BASE_URL || 'http://localhost:3100'
const DATABASE_URL = process.env.DATABASE_URL
const PROJECT_ID = process.env.RESUME_PROJECT_ID || '9dcda107-f383-467b-a7b3-026cb5d5b023'
const EPISODE_ID = process.env.RESUME_EPISODE_ID || '65e47b0f-4dda-43a2-b29d-1179c942eeb8'
const SCENE_TASK_ID = process.env.RESUME_SCENE_TASK_ID || 'f05c02d7-9e70-4990-8d42-6496aa74b4a7'
const RETRY_DELAY_MS = Number(process.env.RECOVERY_RETRY_DELAY_MS || 90_000)

if (!DATABASE_URL) throw new Error('缺少 DATABASE_URL')
if (!process.env.ARK_API_KEY) throw new Error('缺少 ARK_API_KEY，无法执行真实 API 恢复')
if (process.env.USE_MOCK_MODEL === 'true') throw new Error('USE_MOCK_MODEL=true，当前不是真实模型验收环境')

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: DATABASE_URL }),
})

type Task = {
  id: string
  taskType?: string
  status: string
  progress?: number
  errorMessage?: string | null
}

const log = (message: string) => console.log(`[蓝染球衣恢复] ${message}`)

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
    process.stdout.write(`\r[蓝染球衣恢复] ${label}：${task.status} ${task.progress ?? 0}%`)
    await new Promise(resolve => setTimeout(resolve, 5000))
  }
  throw new Error(`${label} 超时`)
}

async function assertExistingAssets() {
  const project = await prisma.project.findUnique({ where: { id: PROJECT_ID } })
  if (!project) throw new Error(`项目不存在：${PROJECT_ID}`)
  const episode = await prisma.episode.findFirst({ where: { id: EPISODE_ID, projectId: PROJECT_ID } })
  if (!episode) throw new Error(`剧集不存在：${EPISODE_ID}`)

  const counts = {
    characters: await prisma.character.count({ where: { projectId: PROJECT_ID } }),
    confirmedCharacterImages: await prisma.characterImage.count({ where: { projectId: PROJECT_ID, isConfirmed: true, isSelected: true } }),
    shots: await prisma.shot.count({ where: { projectId: PROJECT_ID, episodeId: EPISODE_ID } }),
    shotImages: await prisma.shotImage.count({ where: { projectId: PROJECT_ID, shot: { episodeId: EPISODE_ID } } }),
    shotVideos: await prisma.shotVideo.count({ where: { projectId: PROJECT_ID, shot: { episodeId: EPISODE_ID } } }),
    finalVideos: await prisma.finalVideo.count({ where: { projectId: PROJECT_ID, episodeId: EPISODE_ID } }),
  }
  log(`现有资产：${JSON.stringify(counts)}`)
  if (counts.characters !== 3 || counts.confirmedCharacterImages < 3 || counts.shots !== 12) {
    throw new Error('既有项目资产不完整，停止恢复以避免重建')
  }
}

async function retrySceneReferencesOnce() {
  const task = await prisma.generationTask.findUnique({ where: { id: SCENE_TASK_ID } })
  if (!task) throw new Error(`场景参考图失败任务不存在：${SCENE_TASK_ID}`)
  if (task.taskType !== 'GENERATE_SCENE_REFERENCES') throw new Error(`任务类型不匹配：${task.taskType}`)
  if (task.status === 'success') {
    log(`场景参考图任务已是 success，跳过重试：${SCENE_TASK_ID}`)
    return
  }
  if (task.status !== 'failed') throw new Error(`场景参考图任务当前不是 failed：${task.status}`)

  log(`按退避等待 ${Math.round(RETRY_DELAY_MS / 1000)} 秒后重试场景参考图任务`)
  await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS))
  const retry = await post(`/api/tasks/${SCENE_TASK_ID}/retry`)
  const retryTaskId = retry.data?.id || SCENE_TASK_ID
  log(`已提交场景参考图重试：${retryTaskId}`)
  await waitTask(PROJECT_ID, retryTaskId, '场景参考图恢复重试', 40 * 60 * 1000)
}

async function ensureShotImages() {
  const existing = await prisma.shotImage.count({ where: { projectId: PROJECT_ID, shot: { episodeId: EPISODE_ID } } })
  if (existing >= 12) {
    log(`已有分镜图 ${existing} 张，跳过生成`)
    return
  }
  const task = await post(`/api/projects/${PROJECT_ID}/episodes/${EPISODE_ID}/shot-images/generate`)
  await waitTask(PROJECT_ID, task.data.taskId, '分镜图生成', 60 * 60 * 1000)
}

async function confirmShotImages() {
  const data = await get(`/api/projects/${PROJECT_ID}/episodes/${EPISODE_ID}/shot-images`)
  let confirmed = 0
  for (const group of data.data.shots || []) {
    const already = (group.images || []).find((image: { isConfirmed?: boolean }) => image.isConfirmed)
    if (already) {
      confirmed++
      continue
    }
    const image = group.images?.[0]
    if (!image) throw new Error(`镜头 #${group.shot.shotNo} 没有分镜图`)
    await post(`/api/projects/${PROJECT_ID}/episodes/${EPISODE_ID}/shot-images/${image.id}/confirm`)
    confirmed++
  }
  log(`确认分镜图：${confirmed} 张`)
}

async function ensureShotVideos() {
  const existing = await prisma.shotVideo.count({ where: { projectId: PROJECT_ID, shot: { episodeId: EPISODE_ID } } })
  if (existing >= 12) {
    log(`已有视频候选 ${existing} 个，跳过生成`)
    return
  }
  const task = await post(`/api/projects/${PROJECT_ID}/episodes/${EPISODE_ID}/shot-videos/generate`)
  await waitTask(PROJECT_ID, task.data.taskId, '视频片段生成', 95 * 60 * 1000)
}

async function confirmShotVideos() {
  const data = await get(`/api/projects/${PROJECT_ID}/episodes/${EPISODE_ID}/shot-videos`)
  let confirmed = 0
  for (const group of data.data.shots || []) {
    const already = (group.videos || []).find((video: { isConfirmed?: boolean }) => video.isConfirmed)
    if (already) {
      confirmed++
      continue
    }
    const video = (group.videos || []).find((item: { videoUrl?: string; remoteStatus?: string }) =>
      !!item.videoUrl && ['completed', 'succeeded', 'success'].includes(item.remoteStatus || 'completed')
    )
    if (!video) throw new Error(`镜头 #${group.shot.shotNo} 没有可确认视频`)
    await post(`/api/projects/${PROJECT_ID}/episodes/${EPISODE_ID}/shot-videos/${video.id}/select`)
    await post(`/api/projects/${PROJECT_ID}/episodes/${EPISODE_ID}/shot-videos/${video.id}/confirm`)
    confirmed++
  }
  log(`确认视频片段：${confirmed} 个`)
}

async function renderFinalVideo() {
  const existing = await get(`/api/projects/${PROJECT_ID}/episodes/${EPISODE_ID}/final-preview`)
  if (existing.data?.latest?.videoUrl && existing.data.latest.status === 'READY') {
    return existing.data.latest
  }

  const task = await post(`/api/projects/${PROJECT_ID}/episodes/${EPISODE_ID}/final-preview/render`)
  await waitTask(PROJECT_ID, task.data.taskId, '最终成片合成', 20 * 60 * 1000)
  const finalPreview = await get(`/api/projects/${PROJECT_ID}/episodes/${EPISODE_ID}/final-preview`)
  const latest = finalPreview.data.latest
  if (!latest?.videoUrl) throw new Error('最终成片未生成')
  return latest
}

async function assertOssBackedStorage() {
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
    prisma.characterImage.findMany({ where: { projectId: PROJECT_ID } }),
    prisma.sceneImage.findMany({ where: { projectId: PROJECT_ID, scene: { episodeId: EPISODE_ID } } }),
    prisma.shotImage.findMany({ where: { projectId: PROJECT_ID, shot: { episodeId: EPISODE_ID } } }),
    prisma.shotVideo.findMany({ where: { projectId: PROJECT_ID, shot: { episodeId: EPISODE_ID }, isConfirmed: true } }),
    prisma.finalVideo.findFirst({ where: { projectId: PROJECT_ID, episodeId: EPISODE_ID, status: 'READY' }, orderBy: { createdAt: 'desc' } }),
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
  if (!finalVideo.storageObjectKey.startsWith(`projects/${PROJECT_ID}/final_videos/`)) {
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

async function assertNoProjectLocalArtifacts() {
  const fs = await import('fs')
  const path = await import('path')
  const uploadRoot = path.resolve(process.cwd(), 'uploads')
  const candidates = [
    path.join(uploadRoot, 'media', 'projects', PROJECT_ID),
    path.join(uploadRoot, 'final_videos'),
    path.join(uploadRoot, 'release_packages'),
  ]
  const leftovers: string[] = []
  for (const candidate of candidates) {
    if (!fs.existsSync(candidate)) continue
    const stat = fs.statSync(candidate)
    if (stat.isDirectory()) {
      if (candidate.endsWith(path.join('projects', PROJECT_ID))) {
        leftovers.push(candidate)
        continue
      }
      const entries = fs.readdirSync(candidate).filter(name => name.includes(PROJECT_ID))
      leftovers.push(...entries.map(name => path.join(candidate, name)))
    } else if (candidate.includes(PROJECT_ID)) {
      leftovers.push(candidate)
    }
  }
  if (leftovers.length > 0) {
    throw new Error(`发现项目本地残留产物：${leftovers.join(', ')}`)
  }
}

async function main() {
  const startedAt = Date.now()
  log(`BASE=${BASE}`)
  log(`PROJECT_ID=${PROJECT_ID}`)
  log(`EPISODE_ID=${EPISODE_ID}`)
  log(`文本模型=${process.env.ARK_TEXT_MODEL || '未设置'}`)
  log(`图片模型=${process.env.ARK_IMAGE_MODEL || '未设置'}`)
  log(`视频模型=${process.env.ARK_VIDEO_MODEL || '未设置'}`)

  await assertExistingAssets()
  await retrySceneReferencesOnce()
  await ensureShotImages()
  await confirmShotImages()
  await ensureShotVideos()
  await confirmShotVideos()
  const latest = await renderFinalVideo()
  const qc = await post(`/api/projects/${PROJECT_ID}/episodes/${EPISODE_ID}/qc/run`, { episodeId: EPISODE_ID })
  log(`QC 完成：${Array.isArray(qc.data) ? qc.data.length : 0} 份报告`)

  const releasePackage = await post(`/api/projects/${PROJECT_ID}/episodes/${EPISODE_ID}/release-package/generate`)
  if (!releasePackage.data?.packageObjectKey) throw new Error('发布包未写入 OSS objectKey')

  const storage = await assertOssBackedStorage()
  await assertNoProjectLocalArtifacts()

  console.log('\n=== 蓝染球衣恢复真实生成完成 ===')
  console.log(`PROJECT_ID=${PROJECT_ID}`)
  console.log(`EPISODE_ID=${EPISODE_ID}`)
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
    console.error(`\n[蓝染球衣恢复] 失败：${(error as Error).message}`)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
