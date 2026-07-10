// ============================================
// QC 质量检查服务
// ============================================
import fs from 'fs'
import path from 'path'
import prisma from '@/lib/prisma'
import {
  FFMPEG_PATH,
  UPLOAD_DIR,
  createTaskTempDir,
  downloadVideo,
  probeVideo,
  safeCleanupDir,
  spawnSafe,
} from './ffmpeg-utils'
import { resolveMediaReadUrl, resolveMediaRenderSource } from './media-persist'
import {
  analyzeImageVisualQuality,
  analyzeVideoVisualQuality,
  hasBlockingVisualIssues,
  toStoredVisualQuality,
  type VisualQualityResult,
} from './media-visual-qc.service'
import {
  buildRegenerationRepairHint,
  type RegenerationIssueType,
} from './shot-regeneration-quality'

type JsonValue = import('@prisma/client').Prisma.InputJsonValue

export type QCSeverity = 'P0' | 'P1' | 'P2' | 'P3'
export type QCRecommendedAction = 'accept' | 'rerun_shot_image' | 'rerun_shot_video' | 'rerender_final'
export type QCRepairTargetKind = 'shot_image' | 'shot_video' | 'final_render'

export interface QCRepairTarget {
  kind: QCRepairTargetKind
  shotId?: string
  shotNo?: number
  issueTypes?: RegenerationIssueType[]
  fixNote?: string
}

export interface QCIssue {
  level: 'high' | 'medium' | 'low'
  field: string
  problem: string
  suggestion: string
  shotId?: string
  shotNo?: number
  timeRange?: string
  issueType?: string
  severity?: QCSeverity
  recommendedAction?: QCRecommendedAction
  regenerationIssueTypes?: RegenerationIssueType[]
  fixNote?: string
  repairTarget?: QCRepairTarget
  repairSequence?: QCRepairTarget[]
}

export interface QCResult {
  score: number
  passed: boolean
  level: 'excellent' | 'good' | 'warning' | 'failed'
  issues: QCIssue[]
  summary: string
  rewrite_required: boolean
  rewrite_instruction: string
}

export function sortShotsForTimeline(shots: unknown[]): unknown[] {
  return [...shots].sort((a, b) => {
    const shotA = a as Record<string, unknown>
    const shotB = b as Record<string, unknown>
    const shotNoA = toSortableNumber(shotA.shotNo ?? shotA.shot_no)
    const shotNoB = toSortableNumber(shotB.shotNo ?? shotB.shot_no)
    if (shotNoA !== shotNoB) return shotNoA - shotNoB

    const startA = toSortableNumber(shotA.startTime ?? shotA.start_time)
    const startB = toSortableNumber(shotB.startTime ?? shotB.start_time)
    return startA - startB
  })
}

function toSortableNumber(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : Number.MAX_SAFE_INTEGER
}

export class QCService {
  private applyCrossStageRepairPriority(results: QCResult[]): QCResult[] {
    const issues = results.flatMap(result => result.issues)
    const imageRepairByShot = new Map<string, QCRepairTarget>()
    for (const issue of issues) {
      const target = issue.repairTarget
      if (
        target?.kind === 'shot_image' &&
        target.shotId &&
        (issue.issueType === 'shot_image_partial_black' || issue.regenerationIssueTypes?.includes('invalid_composition'))
      ) {
        imageRepairByShot.set(this.repairShotKey(issue), target)
      }
    }

    if (imageRepairByShot.size === 0) return results

    return results.map(result => ({
      ...result,
      issues: result.issues.map(issue => {
        const originalTarget = issue.repairTarget
        if (originalTarget?.kind !== 'shot_video') return issue

        const imageTarget = imageRepairByShot.get(this.repairShotKey(issue))
        if (!imageTarget) return issue

        return {
          ...issue,
          recommendedAction: 'rerun_shot_image',
          repairTarget: imageTarget,
          repairSequence: this.mergeRepairSequence([imageTarget, originalTarget, ...(issue.repairSequence || [])]),
        }
      }),
    }))
  }

  private repairShotKey(issue: QCIssue): string {
    return issue.shotId || issue.repairTarget?.shotId || (issue.shotNo ? `shotNo:${issue.shotNo}` : '')
  }

  private mergeRepairSequence(targets: Array<QCRepairTarget | undefined>): QCRepairTarget[] {
    const sequence: QCRepairTarget[] = []
    const seen = new Set<string>()
    for (const target of targets) {
      if (!target?.kind) continue
      const key = `${target.kind}:${target.shotId || target.shotNo || 'global'}`
      if (seen.has(key)) continue
      seen.add(key)
      sequence.push(target)
    }
    return sequence
  }

  private mergeVisualQualityParams(params: unknown, visualQuality: ReturnType<typeof toStoredVisualQuality>): JsonValue {
    const base = params && typeof params === 'object' && !Array.isArray(params)
      ? params as Record<string, unknown>
      : {}
    return { ...base, visual_quality: visualQuality } as unknown as JsonValue
  }

  private visualQualityProblem(result: VisualQualityResult): string {
    const issue = result.issues.find(item => item.severity === 'high') || result.issues[0]
    return issue?.message || '检测到疑似无效画面区域'
  }

  private visualQualityTimeRange(result: VisualQualityResult): string | undefined {
    const timeSeconds = this.visualQualityIssueTime(result)
    if (timeSeconds == null) return undefined
    const start = Math.max(0, timeSeconds - 0.5)
    const end = timeSeconds + 0.5
    return `${start.toFixed(1)}-${end.toFixed(1)}s`
  }

  private visualQualityIssueTime(result: VisualQualityResult): number | undefined {
    const sample = result.frameMetrics.find(metric =>
      (metric.topMean <= 16 && metric.topDarkRatio >= 0.82) ||
      (metric.bottomMean <= 16 && metric.bottomDarkRatio >= 0.82) ||
      (metric.leftMean <= 16 && metric.leftDarkRatio >= 0.82) ||
      (metric.rightMean <= 16 && metric.rightDarkRatio >= 0.82)
    )
    if (sample?.timeSeconds == null || !Number.isFinite(sample.timeSeconds)) return undefined
    return sample.timeSeconds
  }

  private findShotForFinalTime(
    shots: Array<{ id: string; shotNo: number; startTime?: number | null; endTime?: number | null }>,
    timeSeconds?: number,
  ): { id: string; shotNo: number; startTime?: number | null; endTime?: number | null } | null {
    if (timeSeconds == null || !Number.isFinite(timeSeconds)) return null
    const epsilon = 0.05
    return shots.find(shot =>
      shot.startTime != null &&
      shot.endTime != null &&
      timeSeconds >= shot.startTime - epsilon &&
      timeSeconds < shot.endTime + epsilon
    ) || null
  }

  private normalizeIssue(issue: QCIssue): QCIssue {
    const recommendedAction = issue.recommendedAction || this.actionFromLevel(issue.level)
    const repairHint = buildRegenerationRepairHint({
      ...issue,
      recommendedAction,
    })
    const regenerationIssueTypes = issue.regenerationIssueTypes || repairHint.issueTypes
    return {
      ...issue,
      issueType: issue.issueType || issue.field,
      severity: issue.severity || this.severityFromLevel(issue.level),
      recommendedAction,
      regenerationIssueTypes: regenerationIssueTypes.length > 0 ? regenerationIssueTypes : undefined,
      fixNote: issue.fixNote || repairHint.fixNote,
      repairTarget: issue.repairTarget || this.repairTargetFromIssue(issue, recommendedAction, regenerationIssueTypes, issue.fixNote || repairHint.fixNote),
    }
  }

  private repairTargetFromIssue(
    issue: QCIssue,
    recommendedAction: QCRecommendedAction,
    issueTypes: RegenerationIssueType[],
    fixNote?: string,
  ): QCRepairTarget | undefined {
    if (recommendedAction === 'accept') return undefined
    const kind: QCRepairTargetKind = recommendedAction === 'rerun_shot_image'
      ? 'shot_image'
      : recommendedAction === 'rerun_shot_video'
        ? 'shot_video'
        : 'final_render'
    return {
      kind,
      shotId: issue.shotId,
      shotNo: issue.shotNo,
      issueTypes: issueTypes.length > 0 ? issueTypes : undefined,
      fixNote,
    }
  }

  private severityFromLevel(level: QCIssue['level']): QCSeverity {
    if (level === 'high') return 'P1'
    if (level === 'medium') return 'P2'
    return 'P3'
  }

  private actionFromLevel(level: QCIssue['level']): QCRecommendedAction {
    if (level === 'high') return 'rerun_shot_image'
    if (level === 'medium') return 'rerun_shot_video'
    return 'accept'
  }

  private timeRangeForShot(shot: { startTime?: number | null; endTime?: number | null }): string | undefined {
    if (shot.startTime == null || shot.endTime == null) return undefined
    return `${Math.round(shot.startTime)}-${Math.round(shot.endTime)}s`
  }

  private hasPhoneSafetyGuard(prompt: string | null | undefined): boolean {
    if (!prompt) return false
    const lower = prompt.toLowerCase()
    const required = [
      /phone|手机|screen|屏幕|直播/.test(lower),
      /red check|红色对勾|heart|爱心|like icon|点赞/.test(lower),
      /logo|watermark|平台|platform/.test(lower),
      /fake subtitles|garbled|伪中文|乱码|可读文字|readable text/.test(lower),
    ]
    return required.every(Boolean)
  }

  private resolveLocalFinalVideoPath(videoUrl?: string | null): string | null {
    if (!videoUrl || /^https?:\/\//i.test(videoUrl)) return null
    const uploadRoot = path.resolve(UPLOAD_DIR)
    const resolved = path.isAbsolute(videoUrl)
      ? path.resolve(videoUrl)
      : path.resolve(videoUrl.replace(/^\/+/, ''))
    if (!resolved.startsWith(uploadRoot + path.sep) && resolved !== uploadRoot) return null
    return fs.existsSync(resolved) ? resolved : null
  }

  private async analyzeFinalVideoMedia(localPath: string): Promise<{
    valid: boolean
    hasAudio: boolean
    duration: number | null
    meanVolumeDb: number | null
    hasBlackFrames: boolean
    hasFreeze: boolean
  }> {
    const probe = await probeVideo(localPath)
    let meanVolumeDb: number | null = null
    let hasBlackFrames = false
    let hasFreeze = false

    if (probe.valid && probe.hasAudioStream) {
      const volume = await spawnSafe(FFMPEG_PATH, [
        '-i', localPath,
        '-af', 'volumedetect',
        '-vn', '-sn', '-dn',
        '-f', 'null',
        '-',
      ], { timeout: 90_000 })
      const match = volume.stderr.match(/mean_volume:\s*(-?\d+(?:\.\d+)?)\s*dB/i)
      if (match) meanVolumeDb = Number(match[1])
    }

    if (probe.valid) {
      const visual = await spawnSafe(FFMPEG_PATH, [
        '-i', localPath,
        '-vf', 'blackdetect=d=1:pic_th=0.98,freezedetect=n=-60dB:d=2',
        '-an',
        '-f', 'null',
        '-',
      ], { timeout: 90_000 })
      hasBlackFrames = /black_start:/i.test(visual.stderr)
      hasFreeze = /freeze_start:/i.test(visual.stderr)
    }

    return {
      valid: probe.valid,
      hasAudio: probe.hasAudioStream,
      duration: probe.duration,
      meanVolumeDb,
      hasBlackFrames,
      hasFreeze,
    }
  }

  /** 运行完整 QC */
  async runQC(projectId: string, episodeId?: string): Promise<QCResult[]> {
    const results: QCResult[] = []

    // 故事方案 QC
    const storyPkg = await prisma.storyPackage.findFirst({
      where: { projectId, confirmed: true },
      orderBy: { version: 'desc' },
    })
    if (storyPkg) {
      results.push(await this.qcStoryPackage(projectId, storyPkg.id, storyPkg.content as Record<string,unknown>))
    }

    // 角色 QC
    const characters = await prisma.character.findMany({ where: { projectId, version: { gt: 0 } } })
    if (characters.length > 0) {
      results.push(await this.qcCharacters(projectId, characters))
    }

    // 分镜 QC
    if (episodeId) {
      const episode = await prisma.episode.findFirst({
        where: { id: episodeId, projectId },
        include: { shots: { orderBy: { shotNo: 'asc' }, include: { imagePrompts: true, videoPrompts: true } } },
      })
      if (episode) {
        results.push(await this.qcStoryboard(projectId, episodeId, episode))
      }
    }

    // 图片 QC
    results.push(await this.qcImages(projectId, episodeId))

    // 视频 QC
    results.push(await this.qcVideos(projectId, episodeId))

    // 成片 QC
    results.push(await this.qcFinalVideo(projectId, episodeId))

    const prioritizedResults = this.applyCrossStageRepairPriority(results)

    // 保存报告
    for (const result of prioritizedResults) {
      await this.saveReport(projectId, episodeId || null, result)
    }

    return prioritizedResults
  }

  /** 故事方案 QC */
  async qcStoryPackage(projectId: string, pkgId: string, content: Record<string,unknown>): Promise<QCResult> {
    const issues: QCIssue[] = []
    const bi = (content.basic_info as Record<string,unknown>) || {}

    if (!bi.genre) issues.push({ level: 'high', field: 'basic_info.genre', problem: '缺少故事类型', suggestion: '补充题材类型标签' })
    if (!bi.core_conflict) issues.push({ level: 'high', field: 'basic_info.core_conflict', problem: '缺少核心冲突', suggestion: '明确故事的主要矛盾' })
    if (!bi.emotional_tone) issues.push({ level: 'medium', field: 'basic_info.emotional_tone', problem: '缺少情感基调', suggestion: '定义故事的整体情绪氛围' })

    const sp = (content.selling_points as string[]) || []
    if (sp.length === 0) issues.push({ level: 'medium', field: 'selling_points', problem: '缺少核心卖点', suggestion: '至少列出 3 个卖点' })

    const chars = (content.core_characters as unknown[]) || []
    if (chars.length === 0) issues.push({ level: 'high', field: 'core_characters', problem: '缺少核心角色', suggestion: '至少包含主角和反派' })

    const episodes = (content.episode_outline as unknown[]) || []
    if (episodes.length === 0) issues.push({ level: 'high', field: 'episode_outline', problem: '缺少分集大纲', suggestion: '生成完整的分集大纲' })
    else {
      let hasHook = false
      for (const ep of episodes) {
        const e = ep as Record<string,unknown>
        if (e.hook) hasHook = true
        // 最后一集检查悬念
      }
      if (!hasHook) issues.push({ level: 'medium', field: 'episode_outline', problem: '分集缺少钩子', suggestion: '每集开头增加强钩子' })
    }

    const score = Math.max(0, 100 - issues.filter(i=>i.level==='high').length*15 - issues.filter(i=>i.level==='medium').length*8 - issues.filter(i=>i.level==='low').length*3)
    return this.buildResult(score, issues, '故事方案 QC 完成')
  }

  /** 角色设定 QC */
  async qcCharacters(projectId: string, characters: Array<Record<string,unknown>>): Promise<QCResult> {
    const issues: QCIssue[] = []
    for (const c of characters) {
      const name = (c.name as string) || '未知角色'
      if (!c.name) issues.push({ level: 'high', field: 'name', problem: '缺少角色姓名', suggestion: '补充角色名称' })
      if (!c.roleType) issues.push({ level: 'medium', field: `${name}.roleType`, problem: `${name} 缺少角色类型`, suggestion: '标注主角/配角/反派' })
      if (!c.zhFixedPrompt) issues.push({ level: 'high', field: `${name}.zhFixedPrompt`, problem: `${name} 缺少中文固定 Prompt`, suggestion: '补充角色绘图关键词' })
      if (!c.enFixedPrompt) issues.push({ level: 'medium', field: `${name}.enFixedPrompt`, problem: `${name} 缺少英文固定 Prompt`, suggestion: '补充英文绘图关键词' })

      const appearance = (c.appearance as Record<string,unknown>) || {}
      if (Object.keys(appearance).length === 0) issues.push({ level: 'medium', field: `${name}.appearance`, problem: `${name} 缺少外貌描述`, suggestion: '补充面部特征、发型、肤色等' })

      const personality = (c.personality as Record<string,unknown>) || {}
      const tags = (personality.tags as string[]) || []
      if (tags.length === 0) issues.push({ level: 'low', field: `${name}.personality`, problem: `${name} 缺少性格标签`, suggestion: '补充 3-5 个性格关键词' })
    }

    const score = Math.max(0, 100 - issues.filter(i=>i.level==='high').length*15 - issues.filter(i=>i.level==='medium').length*8 - issues.filter(i=>i.level==='low').length*3)
    return this.buildResult(score, issues, `角色设定 QC 完成 (${characters.length} 个角色)`)
  }

  /** 分镜脚本 QC */
  async qcStoryboard(projectId: string, episodeId: string, episode: Record<string,unknown>): Promise<QCResult> {
    const issues: QCIssue[] = []
    const shots = sortShotsForTimeline((episode.shots as unknown[]) || [])

    if (!episode.title) issues.push({ level: 'medium', field: 'episode.title', problem: '缺少集名', suggestion: '补充集名' })
    if (!episode.coreTask) issues.push({ level: 'medium', field: 'episode.coreTask', problem: '缺少核心任务', suggestion: '定义本集核心剧情任务' })
    if (!episode.openingHook && !(episode as Record<string,unknown>).opening_hook) issues.push({ level: 'high', field: 'opening_hook', problem: '缺少开场钩子', suggestion: '0-3 秒必须有强冲击' })
    if (!episode.endingHook && !(episode as Record<string,unknown>).ending_hook) issues.push({ level: 'high', field: 'ending_hook', problem: '缺少结尾悬念', suggestion: '每集结尾必须留下悬念' })

    if (shots.length === 0) {
      issues.push({ level: 'high', field: 'shots', problem: '分镜没有镜头', suggestion: '至少生成 4-8 个镜头' })
    } else {
      // 检查镜头时间
      let prevEnd = 0
      for (const s of shots) {
        const shot = s as Record<string,unknown>
        const start = (shot.startTime as number) || (shot.start_time as number) || 0
        const end = (shot.endTime as number) || (shot.end_time as number) || 0
        if (start < prevEnd) issues.push({ level: 'medium', field: `shot_${shot.shotNo}`, problem: '镜头时间重叠', suggestion: '调整起止时间' })
        prevEnd = end

        const imagePrompts = (shot.imagePrompts as unknown[]) || []
        if (imagePrompts.length === 0) issues.push({ level: 'medium', field: `shot_${shot.shotNo}.imagePrompt`, problem: '缺少图片 Prompt', suggestion: '为镜头补充图片生成 Prompt' })

        const videoPrompts = (shot.videoPrompts as unknown[]) || []
        if (videoPrompts.length === 0) issues.push({ level: 'medium', field: `shot_${shot.shotNo}.videoPrompt`, problem: '缺少视频 Prompt', suggestion: '为镜头补充视频生成 Prompt' })
      }
    }

    const score = Math.max(0, 100 - issues.filter(i=>i.level==='high').length*15 - issues.filter(i=>i.level==='medium').length*8 - issues.filter(i=>i.level==='low').length*3)
    return this.buildResult(score, issues, `分镜脚本 QC 完成 (${shots.length} 个镜头)`)
  }

  /** 图片 QC */
  async qcImages(projectId: string, episodeId?: string): Promise<QCResult> {
    const issues: QCIssue[] = []
    const charImages = await prisma.characterImage.findMany({ where: { projectId } })
    const shotImages = episodeId ? await prisma.shotImage.findMany({ where: { projectId, shot: { episodeId } } }) : []

    if (charImages.length === 0 && shotImages.length === 0) {
      return this.buildResult(100, [], '暂无图片数据，无需 QC')
    }

    // 角色图检查
    const charImgCount = charImages.filter(i => i.isConfirmed).length
    const chars = await prisma.character.findMany({ where: { projectId, confirmed: true } })
    if (chars.length > charImgCount) {
      issues.push({ level: 'high', field: 'character_images', problem: `${chars.length - charImgCount} 个角色缺少确认的标准图`, suggestion: '为每个角色确认标准图', issueType: 'reference_count', severity: 'P1', recommendedAction: 'rerun_shot_image' })
    }
    for (const c of chars) {
      const refs = charImages.filter(i => i.characterId === c.id && i.isConfirmed && i.isSelected)
      if (refs.length > 0 && refs.length < 3) {
        issues.push({
          level: 'medium',
          field: `character_images.${c.name || c.id}`,
          problem: `${c.name || '角色'} 已确认参考图少于 3 张，多角度一致性约束偏弱`,
          suggestion: '补齐正面半身、正面全身、侧面或背面等参考图',
          issueType: 'reference_count',
          severity: 'P2',
          recommendedAction: 'rerun_shot_image',
        })
      }
    }

    // 分镜图检查
    if (episodeId) {
      const shots = await prisma.shot.findMany({ where: { episodeId, projectId }, include: { scene: { include: { sceneImages: true } } } })
      let confirmedCount = 0
      for (const shot of shots) {
        const has = shotImages.filter(i => i.shotId === shot.id && i.isConfirmed).length
        if (has > 0) confirmedCount++
        const confirmedImage = shotImages.find(i => i.shotId === shot.id && i.isConfirmed)
        const refCount = Array.isArray(confirmedImage?.referenceImages) ? confirmedImage.referenceImages.length : 0
        const charCount = Array.isArray(shot.characters) ? shot.characters.length : 0
        if (confirmedImage) {
          const renderSource = await resolveMediaRenderSource(confirmedImage.storageObjectKey, confirmedImage.imageUrl)
          if (renderSource && !/^https?:\/\//i.test(renderSource)) {
            try {
              const visualQuality = await analyzeImageVisualQuality(renderSource)
              const storedVisualQuality = toStoredVisualQuality(visualQuality)
              await prisma.shotImage.update({
                where: { id: confirmedImage.id },
                data: { params: this.mergeVisualQualityParams(confirmedImage.params, storedVisualQuality) },
              })
              if (hasBlockingVisualIssues(visualQuality)) {
                issues.push({
                  level: 'high',
                  field: `shot_${shot.shotNo}.image.visual_quality`,
                  problem: `镜头 ${shot.shotNo} 确认分镜图存在视觉质量问题：${this.visualQualityProblem(visualQuality)}`,
                  suggestion: '跳过该候选并重生成分镜图，再重新生成对应视频片段',
                  shotId: shot.id,
                  shotNo: shot.shotNo,
                  timeRange: this.timeRangeForShot(shot),
                  issueType: 'shot_image_partial_black',
                  severity: 'P1',
                  recommendedAction: 'rerun_shot_image',
                })
              }
            } catch (error) {
              issues.push({
                level: 'low',
                field: `shot_${shot.shotNo}.image.visual_quality`,
                problem: `镜头 ${shot.shotNo} 分镜图视觉检测失败：${(error as Error).message}`,
                suggestion: '人工复核该分镜图，必要时重跑 QC',
                shotId: shot.id,
                shotNo: shot.shotNo,
                timeRange: this.timeRangeForShot(shot),
                issueType: 'visual_qc_unavailable',
                severity: 'P3',
                recommendedAction: 'accept',
              })
            }
          }
        }
        if (confirmedImage && charCount > 0 && refCount === 0) {
          issues.push({
            level: 'medium',
            field: `shot_${shot.shotNo}.referenceImages`,
            problem: `镜头 ${shot.shotNo} 已确认分镜图缺少角色/场景参考记录`,
            suggestion: '使用带参考图约束的重生成入口追加候选',
            shotId: shot.id,
            shotNo: shot.shotNo,
            timeRange: this.timeRangeForShot(shot),
            issueType: 'reference_count',
            severity: 'P2',
            recommendedAction: 'rerun_shot_image',
          })
        }
      }
      if (confirmedCount < shots.length) {
        issues.push({ level: 'medium', field: 'shot_images', problem: `${shots.length - confirmedCount} 个镜头缺少确认的分镜图`, suggestion: '为每个镜头确认分镜图', issueType: 'shot_image_missing', severity: 'P2', recommendedAction: 'rerun_shot_image' })
      }

      const scenes = new Map<string, NonNullable<(typeof shots)[number]['scene']>>()
      for (const shot of shots) {
        if (shot.scene) scenes.set(shot.scene.id, shot.scene)
      }
      for (const scene of scenes.values()) {
        const confirmedRefs = scene.sceneImages.filter(img => img.isConfirmed && img.isSelected)
        if (confirmedRefs.length === 0) {
          issues.push({
            level: 'high',
            field: `scene_${scene.id}.references`,
            problem: `场景「${scene.name}」缺少确认的场景参考图`,
            suggestion: '先补齐场景参考图，再重跑对应分镜图或视频',
            issueType: 'reference_count',
            severity: 'P1',
            recommendedAction: 'rerun_shot_image',
          })
        }
      }
    }

    const score = Math.max(0, 100 - issues.filter(i=>i.level==='high').length*15 - issues.filter(i=>i.level==='medium').length*8 - issues.filter(i=>i.level==='low').length*3)
    return this.buildResult(score, issues, `图片 QC 完成 (角色图:${charImages.length}, 分镜图:${shotImages.length})`)
  }

  /** 视频 QC */
  async qcVideos(projectId: string, episodeId?: string): Promise<QCResult> {
    const issues: QCIssue[] = []
    if (!episodeId) return this.buildResult(100, [], '未指定剧集，跳过视频 QC')

    const shots = await prisma.shot.findMany({ where: { episodeId, projectId }, include: { videoPrompts: { orderBy: { createdAt: 'desc' }, take: 1 } } })
    const videos = await prisma.shotVideo.findMany({ where: { projectId, shot: { episodeId } } })

    if (videos.length === 0) {
      return this.buildResult(60, [{ level: 'medium', field: 'shot_videos', problem: '没有视频片段', suggestion: '生成视频片段' }], '暂无视频数据')
    }

    let confirmedCount = 0
    for (const shot of shots) {
      const confirmedVideo = videos.find(v => v.shotId === shot.id && v.isConfirmed)
      if (confirmedVideo) confirmedCount++
      const shotText = [
        shot.shotName,
        shot.location,
        shot.action,
        shot.details,
        shot.dialogue,
        typeof shot.visual === 'object' && shot.visual ? JSON.stringify(shot.visual) : '',
      ].filter(Boolean).join(' ')
      const involvesPhone = /手机|直播|屏幕|支架|phone|livestream|screen/i.test(shotText)
      if (involvesPhone) {
        const latestVideo = videos.filter(v => v.shotId === shot.id).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0]
        const prompt = confirmedVideo?.prompt || latestVideo?.prompt || shot.videoPrompts[0]?.prompt
        if (!this.hasPhoneSafetyGuard(prompt)) {
          issues.push({
            level: 'high',
            field: `shot_${shot.shotNo}.videoPrompt`,
            problem: `镜头 ${shot.shotNo} 涉及手机/直播画面，但视频 prompt 缺少对平台 UI、对勾、爱心、logo 和伪文字的禁用项`,
            suggestion: '选择“手机伪 UI/文字”后重跑视频片段',
            shotId: shot.id,
            shotNo: shot.shotNo,
            timeRange: this.timeRangeForShot(shot),
            issueType: 'prompt_phone_safety',
            severity: 'P1',
            recommendedAction: 'rerun_shot_video',
          })
        }
      }

      if (confirmedVideo) {
        const renderSource = await resolveMediaRenderSource(confirmedVideo.storageObjectKey, confirmedVideo.videoUrl)
        if (renderSource && !/^https?:\/\//i.test(renderSource)) {
          try {
            const visualQuality = await analyzeVideoVisualQuality(renderSource, { duration: confirmedVideo.duration })
            const storedVisualQuality = toStoredVisualQuality(visualQuality)
            await prisma.shotVideo.update({
              where: { id: confirmedVideo.id },
              data: { params: this.mergeVisualQualityParams(confirmedVideo.params, storedVisualQuality) },
            })
            if (hasBlockingVisualIssues(visualQuality)) {
              issues.push({
                level: 'high',
                field: `shot_${shot.shotNo}.video.visual_quality`,
                problem: `镜头 ${shot.shotNo} 视频片段存在视觉质量问题：${this.visualQualityProblem(visualQuality)}`,
                suggestion: '先重生成分镜图或视频片段，再重新合成最终成片',
                shotId: shot.id,
                shotNo: shot.shotNo,
                timeRange: this.visualQualityTimeRange(visualQuality) || this.timeRangeForShot(shot),
                issueType: 'shot_video_partial_black',
                severity: 'P1',
                recommendedAction: 'rerun_shot_video',
              })
            }
          } catch (error) {
            issues.push({
              level: 'low',
              field: `shot_${shot.shotNo}.video.visual_quality`,
              problem: `镜头 ${shot.shotNo} 视频视觉检测失败：${(error as Error).message}`,
              suggestion: '人工复核该视频片段，必要时重跑 QC',
              shotId: shot.id,
              shotNo: shot.shotNo,
              timeRange: this.timeRangeForShot(shot),
              issueType: 'visual_qc_unavailable',
              severity: 'P3',
              recommendedAction: 'accept',
            })
          }
        }
      }
    }
    if (confirmedCount < shots.length) {
      issues.push({ level: 'medium', field: 'shot_videos', problem: `${shots.length - confirmedCount} 个镜头缺少确认视频`, suggestion: '为每个镜头确认视频片段', issueType: 'shot_video_missing', severity: 'P2', recommendedAction: 'rerun_shot_video' })
    }

    const score = Math.max(0, 100 - issues.filter(i=>i.level==='high').length*15 - issues.filter(i=>i.level==='medium').length*8)
    return this.buildResult(score, issues, `视频 QC 完成 (${videos.length} 个片段)`)
  }

  /** 成片 QC */
  async qcFinalVideo(projectId: string, episodeId?: string): Promise<QCResult> {
    const issues: QCIssue[] = []
    if (!episodeId) return this.buildResult(100, [], '未指定剧集，跳过成片 QC')

    const fv = await prisma.finalVideo.findFirst({
      where: { episodeId, projectId, status: 'READY' },
      orderBy: { createdAt: 'desc' },
    })

    if (!fv) {
      return this.buildResult(50, [{ level: 'medium', field: 'final_video', problem: '没有已生成的成片', suggestion: '合成最终视频' }], '尚无成片')
    }

    const shots = await prisma.shot.findMany({
      where: { episodeId, projectId },
      orderBy: { shotNo: 'asc' },
      select: { id: true, shotNo: true, startTime: true, endTime: true },
    })

    if (!fv.videoUrl) issues.push({ level: 'high', field: 'videoUrl', problem: '缺少视频 URL', suggestion: '重新合成', issueType: 'final_video_missing', severity: 'P1', recommendedAction: 'rerender_final' })
    if (!fv.duration) issues.push({ level: 'medium', field: 'duration', problem: '缺少时长信息', suggestion: '', issueType: 'final_duration_missing', severity: 'P2', recommendedAction: 'rerender_final' })
    if (!fv.fps) issues.push({ level: 'low', field: 'fps', problem: '缺少帧率信息', suggestion: '' })

    let localPath = this.resolveLocalFinalVideoPath(fv.videoUrl)
    const tempRoot = path.join(UPLOAD_DIR, 'qc_temp')
    let tempDir: string | null = null
    if (!localPath && fv.storageObjectKey) {
      try {
        const renderSource = await resolveMediaRenderSource(fv.storageObjectKey, fv.videoUrl)
        if (renderSource && !/^https?:\/\//i.test(renderSource)) {
          localPath = renderSource
        } else if (renderSource && /^https?:\/\//i.test(renderSource)) {
          fs.mkdirSync(tempRoot, { recursive: true })
          tempDir = createTaskTempDir(tempRoot)
          const downloaded = await downloadVideo(renderSource, tempDir)
          localPath = downloaded.localPath
        } else {
          const readUrl = await resolveMediaReadUrl(fv.storageObjectKey, fv.videoUrl)
          if (readUrl && /^https?:\/\//i.test(readUrl)) {
            fs.mkdirSync(tempRoot, { recursive: true })
            tempDir = createTaskTempDir(tempRoot)
            const downloaded = await downloadVideo(readUrl, tempDir)
            localPath = downloaded.localPath
          }
        }
      } catch (error) {
        issues.push({
          level: 'high',
          field: 'final_video.media',
          problem: `成片存储对象无法下载校验：${(error as Error).message}`,
          suggestion: '检查 OSS 对象、签名 URL 和存储配置后重新运行 QC',
          issueType: 'final_media_unavailable',
          severity: 'P1',
          recommendedAction: 'rerender_final',
        })
      }
    }
    try {
    if (localPath) {
      const media = await this.analyzeFinalVideoMedia(localPath)
      if (!media.valid) {
        issues.push({
          level: 'high',
          field: 'final_video.media',
          problem: '成片文件 ffprobe 校验失败',
          suggestion: '重新合成最终视频',
          issueType: 'final_media_invalid',
          severity: 'P1',
          recommendedAction: 'rerender_final',
        })
      }
      if (!media.hasAudio) {
        issues.push({
          level: 'high',
          field: 'final_video.audio',
          problem: '成片缺少音频轨',
          suggestion: '重新合成，确认无音频输入已补静音音轨',
          issueType: 'final_audio_missing',
          severity: 'P1',
          recommendedAction: 'rerender_final',
        })
      }
      if (media.meanVolumeDb !== null && media.meanVolumeDb < -28) {
        issues.push({
          level: 'high',
          field: 'final_video.loudness',
          problem: `成片平均响度约 ${media.meanVolumeDb.toFixed(1)} dB，低于短视频发布建议`,
          suggestion: '启用响度归一化后重新合成最终视频',
          issueType: 'final_loudness_low',
          severity: 'P1',
          recommendedAction: 'rerender_final',
        })
      }
      if (media.hasBlackFrames) {
        issues.push({
          level: 'high',
          field: 'final_video.blackdetect',
          problem: '成片检测到持续黑屏片段',
          suggestion: '定位对应镜头并重跑视频片段或重新合成',
          issueType: 'final_black_frames',
          severity: 'P1',
          recommendedAction: 'rerun_shot_video',
        })
      }
      if (media.hasFreeze) {
        issues.push({
          level: 'medium',
          field: 'final_video.freezedetect',
          problem: '成片检测到疑似冻结片段',
          suggestion: '检查对应时间段，必要时重跑视频片段',
          issueType: 'final_freeze',
          severity: 'P2',
          recommendedAction: 'rerun_shot_video',
        })
      }
      try {
        const visualQuality = await analyzeVideoVisualQuality(localPath, {
          duration: media.duration ?? fv.duration,
          sampleIntervalSeconds: 1,
          maxSamples: 90,
        })
        if (hasBlockingVisualIssues(visualQuality)) {
          const issueTime = this.visualQualityIssueTime(visualQuality)
          const issueShot = this.findShotForFinalTime(shots, issueTime)
          issues.push({
            level: 'high',
            field: 'final_video.visual_quality',
            problem: `成片存在局部大面积黑边或无效画面区域：${this.visualQualityProblem(visualQuality)}`,
            suggestion: '定位对应镜头，重生成分镜图/视频片段后重新合成',
            shotId: issueShot?.id,
            shotNo: issueShot?.shotNo,
            timeRange: this.visualQualityTimeRange(visualQuality) || (issueShot ? this.timeRangeForShot(issueShot) : undefined),
            issueType: 'final_visual_partial_black',
            severity: 'P1',
            recommendedAction: 'rerun_shot_video',
          })
        }
      } catch (error) {
        issues.push({
          level: 'low',
          field: 'final_video.visual_quality',
          problem: `成片视觉质量检测失败：${(error as Error).message}`,
          suggestion: '人工复核成片抽帧，必要时重跑 QC',
          issueType: 'visual_qc_unavailable',
          severity: 'P3',
          recommendedAction: 'accept',
        })
      }
    }
    } finally {
      if (tempDir) safeCleanupDir(tempDir, tempRoot)
    }

    const score = Math.max(0, 100 - issues.filter(i=>i.level==='high').length*20 - issues.filter(i=>i.level==='medium').length*10)
    return this.buildResult(score, issues, `成片 QC 完成`)
  }

  private buildResult(score: number, issues: QCIssue[], summary: string): QCResult {
    const normalizedIssues = issues.map(issue => this.normalizeIssue(issue))
    const level = score >= 90 ? 'excellent' : score >= 75 ? 'good' : score >= 60 ? 'warning' : 'failed'
    return {
      score: Math.min(100, Math.max(0, score)),
      passed: score >= 60,
      level,
      issues: normalizedIssues,
      summary,
      rewrite_required: score < 75,
      rewrite_instruction: score < 75 ? '建议根据问题列表优化后重新生成' : '',
    }
  }

  /** 保存报告 */
  async saveReport(projectId: string, episodeId: string | null, result: QCResult) {
    await prisma.qCReport.create({
      data: {
        projectId,
        targetType: 'QC_CHECK',
        targetId: episodeId || projectId,
        score: result.score,
        passed: result.passed,
        issues: result.issues as unknown[] as unknown as JsonValue,
      },
    })
  }

  /** 读取历史报告 */
  async getReports(projectId: string, episodeId?: string) {
    return prisma.qCReport.findMany({
      where: { projectId, ...(episodeId ? { targetId: episodeId } : {}) },
      orderBy: { createdAt: 'desc' },
      take: 20,
    })
  }

  async getReport(reportId: string) {
    return prisma.qCReport.findUnique({ where: { id: reportId } })
  }
}

export const qcService = new QCService()
