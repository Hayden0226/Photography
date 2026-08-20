import type { GitHubFile } from './github'
import {
  createOrUpdateRepoFile,
  deleteRepoFile,
  getRepoFile,
  isNotFound,
  MAIN_REPO_NAME,
  PHOTO_REPO_NAME,
} from './github'

export const DESCRIPTIONS_FILE_PATH = 'content/photo-descriptions.json'

export const getPhotoCategory = (s3Key: string): string | null => {
  const parts = s3Key.replaceAll('\\', '/').split('/').filter(Boolean)
  return parts.length > 1 ? parts[0] : null
}

export const buildNewS3Key = (s3Key: string, newCategory: string): string => {
  const normalizedCategory = newCategory.trim().replaceAll('\\', '').replaceAll('/', '')
  if (!normalizedCategory) {
    throw new Error('新分类不能为空')
  }
  const parts = s3Key.replaceAll('\\', '/').split('/').filter(Boolean)
  if (parts.length < 2) {
    throw new Error(`无法从照片路径解析分类：${s3Key}`)
  }
  return [normalizedCategory, ...parts.slice(1)].join('/')
}

interface PhotoDescriptionEntry {
  key: string
  title?: unknown
  descriptions?: unknown
  tags?: unknown
  aiContext?: {
    categoryTags?: string[]
  }
}

interface PhotoDescriptionsFile {
  version?: number
  photos?: PhotoDescriptionEntry[]
}

export interface UpdateDescriptionsResult {
  json: string
  updated: boolean
}

export const updateDescriptionsCategory = (
  rawJson: string,
  oldKey: string,
  newKey: string,
  oldCategory: string,
  newCategory: string,
): UpdateDescriptionsResult => {
  const parsed = JSON.parse(rawJson) as PhotoDescriptionsFile
  if (!parsed || !Array.isArray(parsed.photos)) {
    throw new Error('photo-descriptions.json 格式无效')
  }

  let updated = false
  for (const entry of parsed.photos) {
    const normalizedKey = (entry.key ?? '')
      .replaceAll('\\', '/')
      .replace(/^photos\//, '')
      .trim()
    if (normalizedKey === oldKey) {
      entry.key = newKey
      if (entry.aiContext && Array.isArray(entry.aiContext.categoryTags)) {
        entry.aiContext.categoryTags = entry.aiContext.categoryTags.map((tag) =>
          tag === oldCategory ? newCategory : tag,
        )
      }
      updated = true
    }
  }

  return { json: `${JSON.stringify(parsed, null, 2)}\n`, updated }
}

export interface RecategorizeStep {
  step: 'read-photo' | 'move-photo' | 'remove-photo' | 'update-descriptions'
  status: 'ok' | 'skipped' | 'failed'
  detail?: string
}

export interface RecategorizeResult {
  ok: boolean
  oldS3Key: string
  newS3Key: string
  steps: RecategorizeStep[]
  error?: string
}

const fail = (oldS3Key: string, newS3Key: string, steps: RecategorizeStep[], error: string): RecategorizeResult => ({
  ok: false,
  oldS3Key,
  newS3Key,
  steps,
  error,
})

const utf8ToBase64 = (value: string): string => {
  const bytes = new TextEncoder().encode(value)
  let binary = ''
  for (const byte of bytes) binary += String.fromCodePoint(byte)
  return btoa(binary)
}

const base64ToUtf8 = (value: string): string => {
  const binary = atob(value)
  const bytes = Uint8Array.from(binary, (char) => char.codePointAt(0) ?? 0)
  return new TextDecoder().decode(bytes)
}

export const recategorizePhoto = async (
  token: string,
  s3Key: string,
  newCategory: string,
): Promise<RecategorizeResult> => {
  const oldS3Key = s3Key.replaceAll('\\', '/')
  const newS3Key = buildNewS3Key(oldS3Key, newCategory)
  const oldCategory = getPhotoCategory(oldS3Key)
  const newCategoryValue = getPhotoCategory(newS3Key) ?? newCategory
  const steps: RecategorizeStep[] = []

  if (!oldCategory) {
    return fail(oldS3Key, newS3Key, steps, '无法从照片路径解析当前分类')
  }
  if (oldCategory === newCategoryValue) {
    return fail(oldS3Key, newS3Key, steps, '照片已经在该分类中')
  }

  // 1. 读取照片仓库中的原文件
  let file: GitHubFile
  try {
    file = await getRepoFile(token, PHOTO_REPO_NAME, oldS3Key)
    steps.push({ step: 'read-photo', status: 'ok' })
  } catch (error) {
    if (isNotFound(error)) {
      return fail(oldS3Key, newS3Key, steps, `照片仓库中找不到 ${oldS3Key}（可能已被移动）`)
    }
    return fail(oldS3Key, newS3Key, steps, error instanceof Error ? error.message : '读取照片失败')
  }

  // 2. 检查目标路径是否已存在，避免覆盖
  try {
    await getRepoFile(token, PHOTO_REPO_NAME, newS3Key)
    return fail(oldS3Key, newS3Key, steps, `目标路径已存在同名文件：${newS3Key}`)
  } catch (error) {
    if (!isNotFound(error)) {
      return fail(oldS3Key, newS3Key, steps, error instanceof Error ? error.message : '检查目标路径失败')
    }
  }

  // 3. 写入新路径
  try {
    await createOrUpdateRepoFile(token, PHOTO_REPO_NAME, newS3Key, {
      message: `chore: move photo ${oldS3Key} -> ${newS3Key}`,
      content: file.content,
    })
    steps.push({ step: 'move-photo', status: 'ok' })
  } catch (error) {
    return fail(oldS3Key, newS3Key, steps, error instanceof Error ? error.message : '写入新路径失败')
  }

  // 4. 删除旧路径
  try {
    await deleteRepoFile(token, PHOTO_REPO_NAME, oldS3Key, file.sha, `chore: remove ${oldS3Key} after move`)
    steps.push({ step: 'remove-photo', status: 'ok' })
  } catch (error) {
    const detail = error instanceof Error ? error.message : '删除旧文件失败'
    return fail(oldS3Key, newS3Key, steps, `照片已复制到新分类，但删除旧文件失败：${detail}`)
  }

  // 5. 更新主仓库 descriptions.json
  try {
    const descriptionsFile = await getRepoFile(token, MAIN_REPO_NAME, DESCRIPTIONS_FILE_PATH)
    const rawJson = base64ToUtf8(descriptionsFile.content)
    const { json, updated } = updateDescriptionsCategory(rawJson, oldS3Key, newS3Key, oldCategory, newCategoryValue)
    if (updated) {
      await createOrUpdateRepoFile(token, MAIN_REPO_NAME, DESCRIPTIONS_FILE_PATH, {
        message: `chore: recategorize photo ${oldS3Key} -> ${newS3Key}`,
        content: utf8ToBase64(json),
        sha: descriptionsFile.sha,
      })
      steps.push({ step: 'update-descriptions', status: 'ok' })
    } else {
      steps.push({ step: 'update-descriptions', status: 'skipped', detail: 'descriptions.json 中没有该照片条目' })
    }
  } catch (error) {
    const detail = error instanceof Error ? error.message : '更新描述文件失败'
    return fail(oldS3Key, newS3Key, steps, `照片文件已移动，但描述文件更新失败：${detail}`)
  }

  return { ok: true, oldS3Key, newS3Key, steps }
}
