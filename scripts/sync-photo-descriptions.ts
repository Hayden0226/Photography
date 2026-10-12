import fs from 'node:fs/promises'
import path from 'node:path'

import type {PhotoDescriptionEntry, PhotoDescriptionsFile, PhotoDescriptionSource} from '../plugins/builder/photo-description-entries.js';
import {
  createAIContext,
  createDescriptionEntry,
  isPhotoDescriptionEntry,
  normalizeOptionalTranslations,
  normalizeStorageKey,
  normalizeTranslations,
  parsePhotoDescriptions,
  serializePhotoDescriptions
} from '../plugins/builder/photo-description-entries.js'
import { getPhotoCategory, normalizeCustomPhotoTags } from '../plugins/builder/photo-description-tags.js'

interface ManifestFile {
  data?: ManifestPhoto[]
}

interface ManifestPhoto extends PhotoDescriptionSource {
  titles?: Record<string, string>
}

const DESCRIPTIONS_PATH = path.resolve(process.cwd(), 'content/photo-descriptions.json')
const MANIFEST_PATH = path.resolve(process.cwd(), 'apps/web/src/data/photos-manifest.json')

async function main() {
  const shouldPrune = process.argv.includes('--prune')
  const manifest = await readManifest()
  const existing = await readExistingDescriptions()
  const existingByKey = new Map(existing.photos.map((entry) => [normalizeStorageKey(entry.key), entry]))
  const activeKeys = new Set<string>()

  const activeEntries = manifest.data
    .filter((photo): photo is ManifestPhoto & { s3Key: string } => typeof photo.s3Key === 'string')
    .map((photo) => {
      const key = normalizeStorageKey(photo.s3Key)
      activeKeys.add(key)

      return mergeEntry(existingByKey.get(key), photo, key)
    })

  const staleEntries = shouldPrune
    ? []
    : existing.photos.filter((entry) => !activeKeys.has(normalizeStorageKey(entry.key)))

  const next: PhotoDescriptionsFile = {
    version: 1,
    photos: [...activeEntries, ...staleEntries],
  }

  await fs.writeFile(DESCRIPTIONS_PATH, serializePhotoDescriptions(next))

  const staleSummary = staleEntries.length > 0 ? ` and kept ${staleEntries.length} stale entries` : ''
  console.info(
    `Synced ${activeEntries.length} active photo description entries${staleSummary} -> ${path.relative(process.cwd(), DESCRIPTIONS_PATH)}`,
  )
}

async function readManifest(): Promise<{ data: ManifestPhoto[] }> {
  try {
    const raw = await fs.readFile(MANIFEST_PATH, 'utf-8')
    const parsed = JSON.parse(raw) as ManifestFile
    if (!Array.isArray(parsed.data)) {
      throw new TypeError('manifest "data" must be an array')
    }

    return { data: parsed.data }
  } catch (error) {
    console.error(`Failed to read ${path.relative(process.cwd(), MANIFEST_PATH)}.`)
    console.error('Run `pnpm run build:manifest` first, then run `pnpm photos:descriptions:sync`.')
    throw error
  }
}

async function readExistingDescriptions(): Promise<PhotoDescriptionsFile> {
  try {
    const raw = await fs.readFile(DESCRIPTIONS_PATH, 'utf-8')
    const parsed = parsePhotoDescriptions(raw, path.relative(process.cwd(), DESCRIPTIONS_PATH))

    return {
      version: 1,
      photos: parsed.photos.map(normalizeEntry).filter(isPresent),
    }
  } catch (error) {
    if (isNodeError(error) && error.code === 'ENOENT') {
      return { version: 1, photos: [] }
    }

    throw error
  }
}

function mergeEntry(
  existing: PhotoDescriptionEntry | undefined,
  photo: ManifestPhoto & { s3Key: string },
  key: string,
): PhotoDescriptionEntry {
  const base = existing ?? createDescriptionEntry(photo, key)
  const category = getPhotoCategory(key)
  const automaticTags = category ? [category] : []

  return {
    ...base,
    key,
    tags: normalizeCustomPhotoTags(base.tags, automaticTags),
    aiContext: createAIContext(photo),
  }
}

function normalizeEntry(entry: unknown): PhotoDescriptionEntry | null {
  if (!isPhotoDescriptionEntry(entry)) return null

  const key = normalizeStorageKey(entry.key)
  if (!key) return null
  const candidate = entry as Partial<PhotoDescriptionEntry>
  const titles = normalizeOptionalTranslations(candidate.titles)
  const category = getPhotoCategory(key)

  return {
    key,
    title: typeof candidate.title === 'string' ? candidate.title : '',
    ...(titles ? { titles } : {}),
    descriptions: normalizeTranslations(candidate.descriptions),
    tags: normalizeCustomPhotoTags(candidate.tags, category ? [category] : []),
    aiContext: {
      currentTitle: '',
      dateTaken: '',
      camera: '',
      lens: '',
      categoryTags: [],
    },
  }
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error
}

function isPresent<T>(value: T | null): value is T {
  return value !== null
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
