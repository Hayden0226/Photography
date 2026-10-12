import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import type { BuilderPlugin, PhotoManifestItem } from '@afilmory/builder'

import type {PhotoDescriptionEntry, PhotoDescriptionsFile} from './photo-description-entries.js';
import {
  addMissingDescriptionEntries,
  normalizeStorageKey,
  parsePhotoDescriptions,
  serializePhotoDescriptions
} from './photo-description-entries.js'
import { composePhotoTags, getPhotoCategory } from './photo-description-tags.js'

export interface PhotoDescriptionsPluginOptions {
  file?: string
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
        const file = await loadDescriptions(filePath)

        // 从照片仓库拉进来的新照片在 descriptions 文件里还没有条目时，构建阶段自动补上占位条目
        // 并写回文件（CI 随后会提交），管理面板才编辑得了标题/描述，删除或改分类时也有条目可同步。
        const { photos, createdKeys } = addMissingDescriptionEntries(file?.photos ?? [], payload.manifest)

        if (createdKeys.length > 0) {
          await fs.writeFile(filePath, serializePhotoDescriptions({ version: 1, photos }), 'utf-8')
          logger.main.info(`[photo-descriptions] 自动补全 ${createdKeys.length} 条照片条目：${createdKeys.join('、')}`)
        }

        const entriesByKey = new Map<string, PhotoDescriptionEntry>()
        for (const entry of photos) {
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

async function loadDescriptions(filePath: string): Promise<PhotoDescriptionsFile | null> {
  let raw: string
  try {
    raw = await fs.readFile(filePath, 'utf-8')
  } catch (error) {
    if (isNodeError(error) && error.code === 'ENOENT') {
      return null
    }
    throw error
  }

  return parsePhotoDescriptions(raw, filePath)
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

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error
}
