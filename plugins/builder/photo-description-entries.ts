import { composePhotoTags, getPhotoCategory, normalizeCustomPhotoTags } from './photo-description-tags.js'

export type PhotoDescriptionTranslations = {
  'zh-CN': string
  en: string
}

export interface PhotoDescriptionAIContext {
  currentTitle: string
  dateTaken: string
  camera: string
  lens: string
  categoryTags: string[]
}

export interface PhotoDescriptionEntry {
  key: string
  title: string
  titles?: PhotoDescriptionTranslations
  descriptions: PhotoDescriptionTranslations
  tags: string[]
  aiContext: PhotoDescriptionAIContext
}

export interface PhotoDescriptionsFile {
  version: 1
  photos: PhotoDescriptionEntry[]
}

// 构建期能提供的最小字段集合：manifest 条目与照片仓库里刚拉下来的新照片都满足这个形状。
export interface PhotoDescriptionSource {
  title?: string
  titles?: Record<string, string> | null
  dateTaken?: string
  tags?: string[]
  s3Key?: string
  exif?: {
    Make?: string
    Model?: string
    LensMake?: string
    LensModel?: string
  } | null
}

export interface FillMissingEntriesResult {
  photos: PhotoDescriptionEntry[]
  createdKeys: string[]
}

export function normalizeStorageKey(key: string): string {
  return key
    .replaceAll('\\', '/')
    .replace(/^\/+/, '')
    .replace(/^photos\//, '')
    .trim()
}

export function createEmptyTranslations(): PhotoDescriptionTranslations {
  return {
    'zh-CN': '',
    en: '',
  }
}

export function normalizeTranslations(value: unknown): PhotoDescriptionTranslations {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return createEmptyTranslations()
  }

  const candidate = value as Partial<Record<keyof PhotoDescriptionTranslations, unknown>>
  return {
    'zh-CN': typeof candidate['zh-CN'] === 'string' ? candidate['zh-CN'] : '',
    en: typeof candidate.en === 'string' ? candidate.en : '',
  }
}

export function normalizeOptionalTranslations(value: unknown): PhotoDescriptionTranslations | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null
  }

  const translations = normalizeTranslations(value)
  return translations['zh-CN'] || translations.en ? translations : null
}

export function createAIContext(photo: PhotoDescriptionSource): PhotoDescriptionAIContext {
  const manifestTags = Array.isArray(photo.tags) ? photo.tags : []

  return {
    currentTitle: photo.title ?? '',
    dateTaken: photo.dateTaken ?? '',
    camera: formatCamera(photo),
    lens: formatLens(photo),
    categoryTags: composePhotoTags(manifestTags.slice(0, 1), manifestTags.slice(1)),
  }
}

// 与 `pnpm run photos:descriptions:sync` 写入的字段结构保持一致，标题与描述留空等待人工填写。
export function createDescriptionEntry(photo: PhotoDescriptionSource, key: string): PhotoDescriptionEntry {
  const titles = normalizeOptionalTranslations(photo.titles)
  const category = getPhotoCategory(key)
  const automaticTags = category ? [category] : []

  return {
    key,
    title: '',
    ...(titles ? { titles } : {}),
    descriptions: createEmptyTranslations(),
    tags: normalizeCustomPhotoTags([], automaticTags),
    aiContext: createAIContext(photo),
  }
}

/**
 * 只补缺失条目：已有条目原样保留（不重排、不刷新 `aiContext`），新条目按 manifest 顺序追加在末尾。
 * 因此重复运行是幂等的，提交的 diff 只会包含新照片的条目。
 */
export function addMissingDescriptionEntries(
  existing: readonly PhotoDescriptionEntry[],
  photos: readonly PhotoDescriptionSource[],
): FillMissingEntriesResult {
  const knownKeys = new Set(existing.map((entry) => normalizeStorageKey(entry.key)).filter(Boolean))
  const created: PhotoDescriptionEntry[] = []

  for (const photo of photos) {
    const key = normalizeStorageKey(typeof photo.s3Key === 'string' ? photo.s3Key : '')
    if (!key || knownKeys.has(key)) continue

    knownKeys.add(key)
    created.push(createDescriptionEntry(photo, key))
  }

  return {
    photos: [...existing, ...created],
    createdKeys: created.map((entry) => entry.key),
  }
}

export function parsePhotoDescriptions(raw: string, source: string): PhotoDescriptionsFile {
  const parsed = JSON.parse(raw) as Partial<PhotoDescriptionsFile>
  if (!parsed || !Array.isArray(parsed.photos)) {
    throw new TypeError(`Invalid photo descriptions file: expected "photos" to be an array in ${source}`)
  }

  return {
    version: 1,
    photos: parsed.photos.filter(isPhotoDescriptionEntry),
  }
}

export function serializePhotoDescriptions(file: PhotoDescriptionsFile): string {
  return `${JSON.stringify(file, null, 2)}\n`
}

export function isPhotoDescriptionEntry(value: unknown): value is PhotoDescriptionEntry {
  return Boolean(value && typeof value === 'object' && typeof (value as PhotoDescriptionEntry).key === 'string')
}

function formatCamera(photo: PhotoDescriptionSource): string {
  const make = photo.exif?.Make?.trim()
  const model = photo.exif?.Model?.trim()
  return make && model ? `${make} ${model}` : ''
}

function formatLens(photo: PhotoDescriptionSource): string {
  const lensMake = photo.exif?.LensMake?.trim()
  const lensModel = photo.exif?.LensModel?.trim()
  if (!lensModel) return ''

  return lensMake ? `${lensMake} ${lensModel}` : lensModel
}
