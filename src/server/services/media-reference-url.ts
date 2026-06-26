import fs from 'fs'
import path from 'path'
import { UPLOAD_DIR } from './ffmpeg-utils'
import { getReadUrl } from './media-persist'
import { checkImageAccessible } from './media-resource-check'

export interface ModelImageReferenceInput {
  imageUrl?: string | null
  sourceUrl?: string | null
  storageObjectKey?: string | null
}

function isHttpUrl(url: string | null | undefined): url is string {
  return !!url && (url.startsWith('https://') || url.startsWith('http://'))
}

function localObjectToDataUri(storageObjectKey: string): string | undefined {
  const localPath = path.join(UPLOAD_DIR, 'media', storageObjectKey)
  if (!fs.existsSync(localPath)) return undefined

  const buffer = fs.readFileSync(localPath)
  const ext = path.extname(localPath).toLowerCase()
  const mimeType = ext === '.png' ? 'image/png'
    : ext === '.webp' ? 'image/webp'
    : 'image/jpeg'

  return `data:${mimeType};base64,${buffer.toString('base64')}`
}

async function isAccessibleHttpImage(url: string): Promise<boolean> {
  const result = await checkImageAccessible(url)
  return result.accessible
}

/**
 * Resolve an image reference into a value that a remote model can read.
 *
 * Storage-backed media is preferred because legacy provider URLs may expire.
 * Local storage read URLs are relative, so they are converted to data URIs.
 */
export async function resolveImageUrlForModel(input: ModelImageReferenceInput): Promise<string | undefined> {
  const { imageUrl, sourceUrl, storageObjectKey } = input

  if (storageObjectKey) {
    try {
      const readUrl = await getReadUrl(storageObjectKey)
      if (isHttpUrl(readUrl)) return readUrl
    } catch {
      // Fall through to legacy URL or local data URI.
    }

    const dataUri = localObjectToDataUri(storageObjectKey)
    if (dataUri) return dataUri
  }

  if (isHttpUrl(imageUrl) && await isAccessibleHttpImage(imageUrl)) {
    return imageUrl
  }

  if (isHttpUrl(sourceUrl) && await isAccessibleHttpImage(sourceUrl)) {
    return sourceUrl
  }

  if (storageObjectKey) {
    return localObjectToDataUri(storageObjectKey)
  }

  return isHttpUrl(imageUrl) ? imageUrl : undefined
}

export async function resolveStructuredReferenceImagesForModel(
  rawReferences: unknown,
  limit = 4,
): Promise<string[]> {
  if (!Array.isArray(rawReferences) || limit <= 0) return []

  const resolved: string[] = []
  const seen = new Set<string>()

  for (const raw of rawReferences) {
    if (!raw || typeof raw !== 'object') continue
    const ref = raw as Record<string, unknown>
    const url = await resolveImageUrlForModel({
      imageUrl: (ref.image_url as string | undefined) || (ref.imageUrl as string | undefined),
      sourceUrl: (ref.source_url as string | undefined) || (ref.sourceUrl as string | undefined),
      storageObjectKey: (ref.storage_object_key as string | undefined) || (ref.storageObjectKey as string | undefined),
    })

    if (!url || seen.has(url)) continue
    seen.add(url)
    resolved.push(url)
    if (resolved.length >= limit) break
  }

  return resolved
}
