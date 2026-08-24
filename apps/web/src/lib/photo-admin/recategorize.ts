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
  titles?: Record<string, string>
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
  syncTitleTo?: string,
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
      if (syncTitleTo) {
        entry.title = syncTitleTo
        entry.titles = { ...entry.titles, 'zh-CN': syncTitleTo, en: syncTitleTo }
      }
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

export interface UpdateDescriptionsTextInput {
  title?: string
  zhCN?: string
  en?: string
}

export const updateDescriptionsText = (
  rawJson: string,
  key: string,
  input: UpdateDescriptionsTextInput,
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
    if (normalizedKey !== key) continue

    const nextTitle = input.title?.trim()
    if (input.title !== undefined && nextTitle !== ((entry.title as string | undefined) ?? '')) {
      if (nextTitle) {
        entry.title = nextTitle
      } else {
        delete entry.title
      }
      updated = true
    }

    const descriptions = { ...(entry.descriptions as Record<string, string> | undefined) }
    if (input.zhCN !== undefined) {
      const next = input.zhCN.trim()
      if (next !== (descriptions['zh-CN'] ?? '')) {
        if (next) {
          descriptions['zh-CN'] = next
        } else {
          delete descriptions['zh-CN']
        }
        updated = true
      }
    }
    if (input.en !== undefined) {
      const next = input.en.trim()
      if (next !== (descriptions.en ?? '')) {
        if (next) {
          descriptions.en = next
        } else {
          delete descriptions.en
        }
        updated = true
      }
    }
    if (Object.keys(descriptions).length > 0) {
      entry.descriptions = descriptions
    } else {
      delete entry.descriptions
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
  message?: string
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

const movePhotoFile = async (
  token: string,
  oldS3Key: string,
  newS3Key: string,
  oldCategory: string,
  newCategory: string,
  verb = 'recategorize',
): Promise<RecategorizeResult> => {
  const steps: RecategorizeStep[] = []

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
      message: `chore: ${verb} photo ${oldS3Key} -> ${newS3Key}`,
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
    return fail(oldS3Key, newS3Key, steps, `照片已复制到新路径，但删除旧文件失败：${detail}`)
  }

  // 5. 更新主仓库 descriptions.json
  try {
    const descriptionsFile = await getRepoFile(token, MAIN_REPO_NAME, DESCRIPTIONS_FILE_PATH)
    const rawJson = base64ToUtf8(descriptionsFile.content)
    const syncedTitle = verb === 'rename' ? getFileBaseName(newS3Key) : undefined
    const { json, updated } = updateDescriptionsCategory(
      rawJson,
      oldS3Key,
      newS3Key,
      oldCategory,
      newCategory,
      syncedTitle,
    )
    if (updated) {
      await createOrUpdateRepoFile(token, MAIN_REPO_NAME, DESCRIPTIONS_FILE_PATH, {
        message: `chore: ${verb} photo ${oldS3Key} -> ${newS3Key}`,
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

  return movePhotoFile(token, oldS3Key, newS3Key, oldCategory, newCategoryValue)
}

export const updatePhotoDescriptions = async (
  token: string,
  s3Key: string,
  input: UpdateDescriptionsTextInput,
): Promise<RecategorizeResult> => {
  const normalizedKey = s3Key.replaceAll('\\', '/')
  const steps: RecategorizeStep[] = []

  try {
    const descriptionsFile = await getRepoFile(token, MAIN_REPO_NAME, DESCRIPTIONS_FILE_PATH)
    const rawJson = base64ToUtf8(descriptionsFile.content)
    const { json, updated } = updateDescriptionsText(rawJson, normalizedKey, input)
    if (!updated) {
      return fail(normalizedKey, normalizedKey, steps, '没有检测到需要更新的字段')
    }
    await createOrUpdateRepoFile(token, MAIN_REPO_NAME, DESCRIPTIONS_FILE_PATH, {
      message: `chore: update photo description ${normalizedKey}`,
      content: utf8ToBase64(json),
      sha: descriptionsFile.sha,
    })
    steps.push({ step: 'update-descriptions', status: 'ok' })
    return { ok: true, oldS3Key: normalizedKey, newS3Key: normalizedKey, steps, message: '已更新标题与描述' }
  } catch (error) {
    const detail = error instanceof Error ? error.message : '更新描述文件失败'
    return fail(normalizedKey, normalizedKey, steps, detail)
  }
}

export const getFileBaseName = (s3Key: string): string => {
  const parts = s3Key.replaceAll('\\', '/').split('/').filter(Boolean)
  return (parts.at(-1) ?? '').replace(/\.[a-z0-9]+$/i, '')
}

export const buildRenamedS3Key = (s3Key: string, newFileName: string): string => {
  const normalizedName = newFileName.trim().replaceAll('\\', '').replaceAll('/', '')
  if (!normalizedName) {
    throw new Error('新文件名不能为空')
  }
  const parts = s3Key.replaceAll('\\', '/').split('/').filter(Boolean)
  if (parts.length < 2) {
    throw new Error(`无法从照片路径解析文件名：${s3Key}`)
  }
  const oldFileName = parts.at(-1) ?? ''
  const extensionMatch = /(\.[a-z0-9]+)$/i.exec(oldFileName)
  const extension = extensionMatch?.[1] ?? ''
  const hasOwnExtension = /\.[a-z0-9]+$/i.test(normalizedName)
  const finalName = hasOwnExtension ? normalizedName : `${normalizedName}${extension}`
  return [...parts.slice(0, -1), finalName].join('/')
}

export const renamePhoto = async (token: string, s3Key: string, newFileName: string): Promise<RecategorizeResult> => {
  const oldS3Key = s3Key.replaceAll('\\', '/')
  let newS3Key: string
  try {
    newS3Key = buildRenamedS3Key(oldS3Key, newFileName)
  } catch (error) {
    return fail(oldS3Key, oldS3Key, [], error instanceof Error ? error.message : '新文件名无效')
  }
  if (newS3Key === oldS3Key) {
    return fail(oldS3Key, newS3Key, [], '新文件名与当前文件名相同')
  }
  const oldCategory = getPhotoCategory(oldS3Key)
  if (!oldCategory) {
    return fail(oldS3Key, newS3Key, [], '无法从照片路径解析分类')
  }
  return movePhotoFile(token, oldS3Key, newS3Key, oldCategory, oldCategory, 'rename')
}
