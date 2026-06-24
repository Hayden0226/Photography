interface PhotoWithDescriptions {
  id?: string
  title?: string
  titles?: Record<string, string>
  description?: string
  descriptions?: Record<string, string>
}

const DEFAULT_INLINE_PHOTO_TEXT_LANGUAGE = 'zh-CN'
const DEFAULT_FALLBACK_PHOTO_TEXT_LANGUAGE = 'en'
const languageCandidatesCache = new Map<string, string[]>()

export function getLocalizedPhotoDescription(photo: PhotoWithDescriptions, language: string): string {
  return getLocalizedPhotoText(photo.descriptions, photo.description, language)
}

export function getLocalizedPhotoTitle(photo: PhotoWithDescriptions, language: string): string {
  return getLocalizedPhotoText(photo.titles, photo.title, language)
}

export function getSearchablePhotoTitles(photo: PhotoWithDescriptions): string[] {
  const titles = [...Object.values(photo.titles ?? {}), photo.title].map(trimText).filter((title) => title.length > 0)

  return Array.from(new Set(titles))
}

export function getSearchablePhotoDescriptions(photo: PhotoWithDescriptions): string[] {
  const descriptions = [...Object.values(photo.descriptions ?? {}), photo.description]
    .map(trimText)
    .filter((description) => description.length > 0)

  return Array.from(new Set(descriptions))
}

export function getPhotoAltText(photo: PhotoWithDescriptions, language: string, fallback = 'Photo'): string {
  const description = getLocalizedPhotoDescription(photo, language).trim()
  if (description) return description

  const title = getLocalizedPhotoTitle(photo, language).trim()
  if (title) return title

  const id = photo.id?.trim()
  return id || fallback
}

function getLanguageCandidates(language: string): string[] {
  const normalized = language.trim()
  const cached = languageCandidatesCache.get(normalized)
  if (cached) return cached

  const baseLanguage = normalized.split('-')[0]
  let candidates: string[]

  if (baseLanguage === 'zh') {
    candidates = [normalized, DEFAULT_INLINE_PHOTO_TEXT_LANGUAGE, DEFAULT_FALLBACK_PHOTO_TEXT_LANGUAGE]
  } else if (baseLanguage === 'en') {
    candidates = [normalized, DEFAULT_FALLBACK_PHOTO_TEXT_LANGUAGE, DEFAULT_INLINE_PHOTO_TEXT_LANGUAGE]
  } else {
    candidates = [normalized, baseLanguage, DEFAULT_FALLBACK_PHOTO_TEXT_LANGUAGE, DEFAULT_INLINE_PHOTO_TEXT_LANGUAGE]
  }

  const uniqueCandidates = Array.from(new Set(candidates.filter(Boolean)))
  languageCandidatesCache.set(normalized, uniqueCandidates)
  return uniqueCandidates
}

function getLocalizedPhotoText(
  values: Record<string, string> | undefined,
  legacyInlineText: string | undefined,
  language: string,
): string {
  const legacyText = trimText(legacyInlineText)
  if (!values) return legacyText

  const shouldPreferInlineFallback = isInlinePhotoTextLanguage(language)

  for (const candidate of getLanguageCandidates(language)) {
    const value = trimText(values[candidate])
    if (value) return value

    if (shouldPreferInlineFallback && candidate === DEFAULT_INLINE_PHOTO_TEXT_LANGUAGE && legacyText) {
      return legacyText
    }
  }

  return legacyText
}

function isInlinePhotoTextLanguage(language: string): boolean {
  return language.trim().split('-')[0]?.toLowerCase() === 'zh'
}

function trimText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}
