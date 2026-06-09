// ============================================
// QC 质量检查服务
// ============================================
import prisma from '@/lib/prisma'
import { promptTemplateService } from './prompt-template.service'
import { adapterFactory } from '@/server/model-adapters/adapter.factory'

export interface QCIssue {
  level: 'high' | 'medium' | 'low'
  field: string
  problem: string
  suggestion: string
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

export class QCService {
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
        include: { shots: { include: { imagePrompts: true, videoPrompts: true } } },
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

    // 保存报告
    for (const result of results) {
      await this.saveReport(projectId, episodeId || null, result)
    }

    return results
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
      let hasHook = false, hasCliff = false
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
    const shots = (episode.shots as unknown[]) || []

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
      issues.push({ level: 'high', field: 'character_images', problem: `${chars.length - charImgCount} 个角色缺少确认的标准图`, suggestion: '为每个角色确认标准图' })
    }

    // 分镜图检查
    if (episodeId) {
      const shots = await prisma.shot.findMany({ where: { episodeId, projectId } })
      let confirmedCount = 0
      for (const shot of shots) {
        const has = shotImages.filter(i => i.shotId === shot.id && i.isConfirmed).length
        if (has > 0) confirmedCount++
      }
      if (confirmedCount < shots.length) {
        issues.push({ level: 'medium', field: 'shot_images', problem: `${shots.length - confirmedCount} 个镜头缺少确认的分镜图`, suggestion: '为每个镜头确认分镜图' })
      }
    }

    const score = Math.max(0, 100 - issues.filter(i=>i.level==='high').length*15 - issues.filter(i=>i.level==='medium').length*8 - issues.filter(i=>i.level==='low').length*3)
    return this.buildResult(score, issues, `图片 QC 完成 (角色图:${charImages.length}, 分镜图:${shotImages.length})`)
  }

  /** 视频 QC */
  async qcVideos(projectId: string, episodeId?: string): Promise<QCResult> {
    const issues: QCIssue[] = []
    if (!episodeId) return this.buildResult(100, [], '未指定剧集，跳过视频 QC')

    const shots = await prisma.shot.findMany({ where: { episodeId, projectId } })
    const videos = await prisma.shotVideo.findMany({ where: { projectId, shot: { episodeId } } })

    if (videos.length === 0) {
      return this.buildResult(60, [{ level: 'medium', field: 'shot_videos', problem: '没有视频片段', suggestion: '生成视频片段' }], '暂无视频数据')
    }

    let confirmedCount = 0
    for (const shot of shots) {
      if (videos.some(v => v.shotId === shot.id && v.isConfirmed)) confirmedCount++
    }
    if (confirmedCount < shots.length) {
      issues.push({ level: 'medium', field: 'shot_videos', problem: `${shots.length - confirmedCount} 个镜头缺少确认视频`, suggestion: '为每个镜头确认视频片段' })
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

    if (!fv.videoUrl) issues.push({ level: 'high', field: 'videoUrl', problem: '缺少视频 URL', suggestion: '重新合成' })
    if (!fv.duration) issues.push({ level: 'medium', field: 'duration', problem: '缺少时长信息', suggestion: '' })
    if (!fv.fps) issues.push({ level: 'low', field: 'fps', problem: '缺少帧率信息', suggestion: '' })

    const score = Math.max(0, 100 - issues.filter(i=>i.level==='high').length*20 - issues.filter(i=>i.level==='medium').length*10)
    return this.buildResult(score, issues, `成片 QC 完成`)
  }

  private buildResult(score: number, issues: QCIssue[], summary: string): QCResult {
    const level = score >= 90 ? 'excellent' : score >= 75 ? 'good' : score >= 60 ? 'warning' : 'failed'
    return {
      score: Math.min(100, Math.max(0, score)),
      passed: score >= 60,
      level,
      issues,
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
        issues: result.issues as unknown[],
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
