import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { adapterFactory } from '@/server/model-adapters/adapter.factory'
import { getRuntimeModelName } from '@/server/model-adapters/model-config'
import { resolveImageUrlForModel } from '@/server/services/media-reference-url'
import {
  analyzePersistedImageVisualQuality,
  hasBlockingVisualIssues,
  toStoredVisualQuality,
} from '@/server/services/media-visual-qc.service'
import {
  buildCharacterAppearanceMap,
  buildIssueFixOverlay,
  buildShotContinuityContext,
  buildShotImageNegativePrompt,
  buildShotImagePrompt,
  matchShotCharacterReferences,
  normalizeIssueTypes,
  sanitizeFixNote,
  selectReferenceImageUrls,
  type CharacterReferenceEntry,
  type MotionStrength,
} from '@/server/services/shot-regeneration-quality'
import type { ImageGenerationRequest } from '@/server/model-adapters/types'

type JsonValue = import('@prisma/client').Prisma.InputJsonValue

const ALLOWED_MOTION = ['low', 'medium', 'high'] as const

interface RegenerateBody {
  issueTypes?: unknown
  fixNote?: unknown
  motionStrength?: unknown
  clientRequestId?: unknown
}

function parseBody(body: unknown): {
  issueTypes: ReturnType<typeof normalizeIssueTypes>
  fixNote: string
  motionStrength: MotionStrength | undefined
  clientRequestId: string | null
} | { error: string } {
  if (body === null || typeof body !== 'object') {
    return { issueTypes: [], fixNote: '', motionStrength: undefined, clientRequestId: null }
  }

  const b = body as RegenerateBody
  const issueTypes = normalizeIssueTypes(b.issueTypes)
  const fixNote = sanitizeFixNote(b.fixNote)

  let motionStrength: MotionStrength | undefined
  if (b.motionStrength !== undefined) {
    if (typeof b.motionStrength !== 'string' || !ALLOWED_MOTION.includes(b.motionStrength as (typeof ALLOWED_MOTION)[number])) {
      return { error: 'motionStrength 必须为 low / medium / high 之一' }
    }
    motionStrength = b.motionStrength as MotionStrength
  }

  let clientRequestId: string | null = null
  if (b.clientRequestId !== undefined && b.clientRequestId !== null) {
    if (typeof b.clientRequestId !== 'string') return { error: 'clientRequestId 必须为字符串' }
    const trimmed = b.clientRequestId.trim()
    if (trimmed.length === 0 || trimmed.length > 128) return { error: 'clientRequestId 格式无效' }
    clientRequestId = trimmed
  }

  return { issueTypes, fixNote, motionStrength, clientRequestId }
}

function getParamsRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value as Record<string, unknown>
  return {}
}

function safeError(message: string, status = 500) {
  return NextResponse.json({ success: false, error: message }, { status })
}

/**
 * POST /api/projects/:id/episodes/:eid/shots/:shotId/images/regenerate
 * 重新生成单个镜头分镜图候选。新图追加为候选，旧确认图不删除。
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; episodeId: string; shotId: string }> }
) {
  try {
    const { id: projectId, episodeId, shotId } = await params

    let rawBody: unknown = null
    try {
      const text = await request.text()
      if (text) rawBody = JSON.parse(text)
    } catch {
      rawBody = null
    }

    const parsed = parseBody(rawBody)
    if ('error' in parsed) return safeError(parsed.error, 400)
    const { issueTypes, fixNote, clientRequestId } = parsed
    const overlay = buildIssueFixOverlay({ issueTypes, fixNote })

    const shot = await prisma.shot.findFirst({ where: { id: shotId, episodeId, projectId } })
    if (!shot) return safeError('镜头不存在', 404)
    const episodeShots = await prisma.shot.findMany({
      where: { projectId, episodeId },
      orderBy: { shotNo: 'asc' },
      select: {
        id: true,
        shotNo: true,
        shotName: true,
        characters: true,
        action: true,
        details: true,
        camera: true,
        visual: true,
        location: true,
        sceneTime: true,
        emotion: true,
        dialogue: true,
      },
    })
    const continuityContext = buildShotContinuityContext(
      episodeShots,
      episodeShots.findIndex(item => item.id === shotId),
    )

    const project = await prisma.project.findUnique({ where: { id: projectId } })
    if (!project) return safeError('项目不存在', 404)

    if (clientRequestId) {
      const sameRequestCandidates = (await prisma.shotImage.findMany({
        where: { shotId, projectId },
        orderBy: { createdAt: 'desc' },
      })).filter(img => getParamsRecord(img.params).client_request_id === clientRequestId)

      if (sameRequestCandidates.length > 0) {
        return NextResponse.json({
          success: true,
          data: {
            shotId,
            images: sameRequestCandidates,
            count: sameRequestCandidates.length,
            candidateId: sameRequestCandidates[0].id,
            reused: true,
            appliedFixes: overlay.appliedFixes,
            requiresImageRerun: false,
          },
        })
      }
    }

    const imgPrompt = await prisma.imagePrompt.findFirst({ where: { shotId }, orderBy: { createdAt: 'desc' } })
    const scene = shot.sceneId
      ? await prisma.scene.findFirst({
          where: { id: shot.sceneId, projectId },
          include: { sceneImages: { where: { isConfirmed: true, isSelected: true }, orderBy: { createdAt: 'asc' } } },
        })
      : await prisma.scene.findFirst({
          where: { projectId, episodeId, location: shot.location || undefined },
          include: { sceneImages: { where: { isConfirmed: true, isSelected: true }, orderBy: { createdAt: 'asc' } } },
        })

    const style = project.artStyle || '韩漫'
    const aspectRatio = (project.aspectRatio || '9:16') as '9:16'

    const charImages = await prisma.characterImage.findMany({
      where: { projectId, isConfirmed: true, isSelected: true },
      include: { character: { select: { id: true, name: true } } },
    })

    const refByName = new Map<string, CharacterReferenceEntry[]>()
    for (const ci of charImages) {
      const name = ci.character.name?.trim()
      if (!name || !ci.imageUrl) continue
      if (!refByName.has(name)) refByName.set(name, [])
      refByName.get(name)!.push({
        characterId: ci.characterId,
        characterName: name,
        imageUrl: ci.imageUrl,
        referenceType: ci.referenceType || 'front_full_body',
        storageObjectKey: ci.storageObjectKey,
        sourceUrl: ci.sourceUrl,
      })
    }

    const characters = await prisma.character.findMany({
      where: { projectId, confirmed: true },
      select: { id: true, name: true, gender: true, age: true, appearance: true, clothing: true, signatureFeatures: true },
    })
    const charAppearanceByName = buildCharacterAppearanceMap(characters)

    const references = matchShotCharacterReferences(shot.characters, {
      action: shot.action,
      camera: shot.camera,
      emotion: shot.emotion,
    }, refByName)

    const sceneReferences = (scene?.sceneImages || []).map(img => ({
      scene_id: scene!.id,
      scene_name: scene!.name,
      image_url: img.imageUrl || '',
      reference_type: img.referenceType || 'scene',
      storage_object_key: img.storageObjectKey,
      source_url: img.sourceUrl,
    })).filter(ref => !!ref.image_url || !!ref.storage_object_key)

    const basePrompt = imgPrompt?.enPrompt || imgPrompt?.zhPrompt || shot.action || ''
    const prompt = buildShotImagePrompt(basePrompt, {
      shotNo: shot.shotNo,
      shotName: shot.shotName,
      characters: shot.characters,
      action: shot.action,
      details: shot.details,
      camera: shot.camera,
      visual: shot.visual,
      location: shot.location,
      sceneTime: shot.sceneTime,
      emotion: shot.emotion,
      continuityContext,
    }, style, charAppearanceByName, scene, { issueTypes, fixNote })

    const negative = buildShotImageNegativePrompt(imgPrompt?.negativePrompt, { issueTypes, fixNote })

    const genReq: ImageGenerationRequest = {
      taskType: 'shot_image',
      prompt,
      negativePrompt: negative,
      aspectRatio,
      style,
      numOutputs: 4,
    }

    const characterReferenceUrls = (await Promise.all(
      references.map(ref => resolveImageUrlForModel({
        imageUrl: ref.image_url,
        sourceUrl: ref.source_url,
        storageObjectKey: ref.storage_object_key,
      }))
    )).filter((url): url is string => !!url)

    const sceneReferenceUrls = (await Promise.all(
      sceneReferences.map(ref => resolveImageUrlForModel({
        imageUrl: ref.image_url,
        sourceUrl: ref.source_url,
        storageObjectKey: ref.storage_object_key,
      }))
    )).filter((url): url is string => !!url)

    const referenceImageUrls = selectReferenceImageUrls(
      characterReferenceUrls,
      sceneReferenceUrls,
      references.map(ref => ref.character_name),
    )
    if (referenceImageUrls.length > 0) {
      genReq.referenceImages = referenceImageUrls
    }

    const response = await adapterFactory.getImageAdapter(project.modelProvider).generate(genReq)

    if (!response.images.length) {
      return safeError('生成失败，旧图已保留', 500)
    }

    const { persistImageWithPolicy } = await import('@/server/services/media-persist')
    const persistedImages = (await Promise.all(
      response.images.map(async (img) => {
        const outcome = await persistImageWithPolicy(img.url, projectId, 'image')
        if (!outcome.persisted && outcome.imageUrl === '') {
          console.error(`[shot-images/regenerate] persist failed (prod, skipped): ${outcome.error}`)
          return null
        }
        let visualQuality: ReturnType<typeof toStoredVisualQuality> | null = null
        let visualQualityBlocked = false
        try {
          const visualQualityResult = await analyzePersistedImageVisualQuality(outcome.storageObjectKey, outcome.imageUrl)
          if (visualQualityResult) {
            visualQuality = toStoredVisualQuality(visualQualityResult)
            visualQualityBlocked = hasBlockingVisualIssues(visualQualityResult)
          }
        } catch (error) {
          console.warn(`[shot-images/regenerate] visual QC unavailable: ${(error as Error).message}`)
        }
        return {
          img,
          storageObjectKey: outcome.storageObjectKey,
          storageProvider: outcome.storageProvider,
          imageUrlForDb: outcome.imageUrl,
          sourceUrlForAudit: outcome.sourceUrl,
          visualQuality,
          visualQualityBlocked,
        }
      })
    )).filter((x): x is NonNullable<typeof x> => x !== null)

    if (persistedImages.length === 0) {
      return safeError('图片转存失败，旧图已保留', 500)
    }

    const created = await Promise.all(persistedImages.map(({ img, storageObjectKey, storageProvider, imageUrlForDb, sourceUrlForAudit, visualQuality }) =>
      prisma.shotImage.create({
        data: {
          shotId,
          projectId,
          imageUrl: imageUrlForDb,
          storageObjectKey,
          storageProvider,
          sourceUrl: sourceUrlForAudit,
          prompt,
          negativePrompt: negative,
          seed: String(img.seed || ''),
          style,
          aspectRatio,
          modelName: getRuntimeModelName('image'),
          referenceImages: [...sceneReferences, ...references] as unknown as JsonValue,
          params: {
            ...img.params,
            num_outputs: 4,
            generation_method: 'single_regenerate_candidate',
            character_reference_image_count: references.length,
            scene_reference_image_count: sceneReferences.length,
            sent_reference_image_count: genReq.referenceImages?.length || 0,
            issue_types: issueTypes,
            applied_fixes: overlay.appliedFixes,
            fix_note: fixNote || undefined,
            client_request_id: clientRequestId || undefined,
            continuity_context: continuityContext || null,
            visual_quality: visualQuality,
          } as unknown as JsonValue,
          isSelected: false,
          isConfirmed: false,
        },
      })
    ))
    const blockedVisualQualityCount = persistedImages.filter(image => image.visualQualityBlocked).length

    return NextResponse.json({
      success: true,
      data: {
        shotId,
        images: created,
        count: created.length,
        candidateId: created[0]?.id,
        reused: false,
        appliedFixes: overlay.appliedFixes,
        requiresImageRerun: blockedVisualQualityCount > 0 && blockedVisualQualityCount === created.length,
        blockedVisualQualityCount,
      },
    })
  } catch (error) {
    console.error('Failed to regenerate shot images:', error)
    return safeError('重新生成失败，旧图已保留')
  }
}
