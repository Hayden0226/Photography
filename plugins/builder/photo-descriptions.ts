import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import type { BuilderPlugin, PhotoManifestItem } from '@afilmory/builder'

import { composePhotoTags, getPhotoCategory } from './photo-description-tags.js'

export interface PhotoDescriptionsPluginOptions {
  file?: string
}

interface PhotoDescriptionEntry {
  key: string
  title?: unknown
  titles?: unknown
  descriptions?: unknown
  tags?: unknown
}

interface PhotoDescriptionsFile {
  version?: unknown
  photos?: unknown
}

const DEFAULT_DESCRIPTIONS_FILE = 'content/photo-descriptions.json'
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')

export function createPhotoDescriptionsPlugin(options: PhotoDescriptionsPluginOptions = {}): BuilderPlugin {
  const filePath = path.isAbsolute(options.file ?? '')
    ? options.file!
    : path.resolve(REPO_ROOT, options.file ?? DEFAULT_DESCRIPTIONS_FILE)

  return {
    name: 'jacky:photo-descriptions',
    hooks: {
      beforeSaveManifest: async ({ logger, payload }) => {
        const descriptions = await loadDescriptions(filePath)
        if (!descriptions) {
          logger.main.info(`[photo-descriptions] 未找到 ${path.relative(REPO_ROOT, filePath)}，跳过人工描述合并`)
          return
        }

        const entriesByKey = new Map<string, PhotoDescriptionEntry>()
        for (const entry of descriptions.photos) {
          const key = normalizeStorageKey(entry.key)
          if (!key) continue
          entriesByKey.set(key, entry)
        }

        let changedCount = 0
        let matchedCount = 0

        for (const item of payload.manifest) {
          const entry = entriesByKey.get(normalizeStorageKey(item.s3Key))
          if (!entry) continue

          matchedCount++
          if (applyDescriptionEntry(item, entry)) {
            changedCount++
          }
        }

        logger.main.info(`[photo-descriptions] 已匹配 ${matchedCount} 条人工描述，更新 ${changedCount} 个 manifest 项`)
      },
    },
  }
}

export default createPhotoDescriptionsPlugin

async function loadDescriptions(filePath: string): Promise<{ photos: PhotoDescriptionEntry[] } | null> {
  let raw: string
  try {
    raw = await fs.readFile(filePath, 'utf-8')
  } catch (error) {
    if (isNodeError(error) && error.code === 'ENOENT') {
      return null
    }
    throw error
  }

  const parsed = JSON.parse(raw) as PhotoDescriptionsFile
  if (!parsed || !Array.isArray(parsed.photos)) {
    throw new Error(`Invalid photo descriptions file: expected "photos" to be an array in ${filePath}`)
  }

  return {
    photos: parsed.photos.filter(isPhotoDescriptionEntry),
  }
}

function applyDescriptionEntry(item: PhotoManifestItem, entry: PhotoDescriptionEntry): boolean {
  let changed = false
  const title = readNonEmptyString(entry.title)
  const titles = readLocalizedStrings(entry.titles)
  const descriptions = readDescriptions(entry.descriptions)

  if (titles && !areDescriptionMapsEqual(item.titles, titles)) {
    item.titles = titles
    changed = true
  }

  const fallbackTitle = titles?.['zh-CN'] || titles?.en || title
  if (title && item.title !== title) {
    item.title = title
    changed = true
  } else if (fallbackTitle && item.title !== fallbackTitle) {
    item.title = fallbackTitle
    changed = true
  }

  if (descriptions && !areDescriptionMapsEqual(item.descriptions, descriptions)) {
    item.descriptions = descriptions
    changed = true
  }

  const fallbackDescription = descriptions?.['zh-CN'] || descriptions?.en
  if (fallbackDescription && item.description !== fallbackDescription) {
    item.description = fallbackDescription
    changed = true
  }

  if (Array.isArray(entry.tags)) {
    const category = getPhotoCategory(item.s3Key)
    const automaticTags = category ? [category] : item.tags.slice(0, 1)
    const mergedTags = composePhotoTags(automaticTags, entry.tags)
    if (!areStringArraysEqual(item.tags, mergedTags)) {
      item.tags = mergedTags
      changed = true
    }
  }

  return changed
}

function normalizeStorageKey(key: string): string {
  return key
    .replaceAll('\\', '/')
    .replace(/^\/+/, '')
    .replace(/^photos\//, '')
    .trim()
}

function readNonEmptyString(value: unknown): string | null {
  if (typeof value !== 'string') return null

  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function readDescriptions(value: unknown): Record<string, string> | null {
  return readLocalizedStrings(value)
}

function readLocalizedStrings(value: unknown): Record<string, string> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null

  const localizedStrings = Object.fromEntries(
    Object.entries(value)
      .map(([language, description]) => [language.trim(), readNonEmptyString(description)] as const)
      .filter((entry): entry is [string, string] => entry[0].length > 0 && entry[1] !== null),
  )

  return Object.keys(localizedStrings).length > 0 ? localizedStrings : null
}

function areStringArraysEqual(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index])
}

function areDescriptionMapsEqual(left: Record<string, string> | undefined, right: Record<string, string>): boolean {
  if (!left) return false

  const leftEntries = Object.entries(left)
  const rightEntries = Object.entries(right)
  return (
    leftEntries.length === rightEntries.length &&
    rightEntries.every(([language, description]) => left[language] === description)
  )
}

function isPhotoDescriptionEntry(value: unknown): value is PhotoDescriptionEntry {
  return Boolean(value && typeof value === 'object' && typeof (value as PhotoDescriptionEntry).key === 'string')
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error
}
