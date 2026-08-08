export const MAX_CUSTOM_PHOTO_TAGS = 3
export const MAX_PHOTO_TAGS = 4

export function getPhotoCategory(storageKey: string): string {
  return (
    storageKey
      .replaceAll('\\', '/')
      .replace(/^\/+/, '')
      .replace(/^photos\//, '')
      .split('/')[0]
      ?.trim() ?? ''
  )
}

export function normalizeCustomPhotoTags(value: unknown, automaticTags: readonly string[] = []): string[] {
  if (!Array.isArray(value)) return []

  const seen = new Set(automaticTags.map(normalizeTagIdentity).filter(Boolean))
  const tags: string[] = []

  for (const candidate of value) {
    if (typeof candidate !== 'string') continue

    const tag = candidate.trim()
    const identity = normalizeTagIdentity(tag)
    if (!identity || seen.has(identity)) continue

    seen.add(identity)
    tags.push(tag)
    if (tags.length === MAX_CUSTOM_PHOTO_TAGS) break
  }

  return tags
}

export function composePhotoTags(automaticTags: unknown, customTags: unknown): string[] {
  const automatic = normalizeAutomaticPhotoTags(automaticTags)
  return [...automatic, ...normalizeCustomPhotoTags(customTags, automatic)].slice(0, MAX_PHOTO_TAGS)
}

function normalizeAutomaticPhotoTags(value: unknown): string[] {
  if (!Array.isArray(value)) return []

  for (const candidate of value) {
    if (typeof candidate !== 'string') continue

    const tag = candidate.trim()
    if (tag) return [tag]
  }

  return []
}

function normalizeTagIdentity(tag: string): string {
  return tag.trim().toLocaleLowerCase()
}
