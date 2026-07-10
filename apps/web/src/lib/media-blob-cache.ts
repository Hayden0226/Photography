import { LRUCache } from '~/lib/lru-cache'
import { getMediaCacheBudgetBytes } from '~/lib/media-cache-budget'

export type MediaBlobCacheNamespace = 'regular-image' | 'heic' | 'tiff' | 'video'

interface MediaBlobCacheEntry {
  namespace: MediaBlobCacheNamespace
  key: string
  value: unknown
  bytes: number
  revoke: () => void
}

const namespaceEntryLimits: Record<MediaBlobCacheNamespace, number> = {
  'regular-image': 50,
  heic: 10,
  tiff: 10,
  video: 10,
}

const maximumEntryCount = Object.values(namespaceEntryLimits).reduce((total, limit) => total + limit, 0)

const sharedMediaBlobCache = new LRUCache<string, MediaBlobCacheEntry>(maximumEntryCount, (entry) => entry.revoke(), {
  maxWeight: getMediaCacheBudgetBytes(),
  getWeight: (entry) => entry.bytes,
})

function toStorageKey(namespace: MediaBlobCacheNamespace, key: string): string {
  return `${namespace}\u0000${key}`
}

export function getMediaBlobCacheEntry<T>(namespace: MediaBlobCacheNamespace, key: string): T | undefined {
  return sharedMediaBlobCache.get(toStorageKey(namespace, key))?.value as T | undefined
}

export function setMediaBlobCacheEntry<T>(options: {
  namespace: MediaBlobCacheNamespace
  key: string
  value: T
  bytes: number
  revoke: (value: T) => void
}): void {
  const { namespace, key, value, bytes, revoke } = options
  const normalizedBytes = Number.isFinite(bytes) && bytes > 0 ? bytes : 0
  sharedMediaBlobCache.set(toStorageKey(namespace, key), {
    namespace,
    key,
    value,
    bytes: normalizedBytes,
    revoke: () => revoke(value),
  })

  const namespaceEntries = Array.from(sharedMediaBlobCache.entries()).filter(
    ([, entry]) => entry.namespace === namespace,
  )
  const entriesToRemove = namespaceEntries.length - namespaceEntryLimits[namespace]
  for (const [storageKey] of namespaceEntries.slice(0, Math.max(0, entriesToRemove))) {
    sharedMediaBlobCache.delete(storageKey)
  }
}

export function deleteMediaBlobCacheEntry(namespace: MediaBlobCacheNamespace, key: string): boolean {
  return sharedMediaBlobCache.delete(toStorageKey(namespace, key))
}

export function clearMediaBlobCacheNamespace(namespace: MediaBlobCacheNamespace): void {
  const storageKeys = Array.from(sharedMediaBlobCache.entries())
    .filter(([, entry]) => entry.namespace === namespace)
    .map(([storageKey]) => storageKey)

  for (const storageKey of storageKeys) sharedMediaBlobCache.delete(storageKey)
}

export function clearAllMediaBlobCaches(): void {
  sharedMediaBlobCache.clear()
}

export function getMediaBlobCacheNamespaceStats(namespace: MediaBlobCacheNamespace): {
  size: number
  maxSize: number
  totalBytes: number
  maxBytes?: number
  keys: string[]
} {
  const entries = Array.from(sharedMediaBlobCache.values()).filter((entry) => entry.namespace === namespace)
  const sharedStats = sharedMediaBlobCache.getStats()

  return {
    size: entries.length,
    maxSize: namespaceEntryLimits[namespace],
    totalBytes: entries.reduce((total, entry) => total + Math.max(0, entry.bytes), 0),
    maxBytes: sharedStats.maxWeight,
    keys: entries.map((entry) => entry.key),
  }
}

export function getSharedMediaBlobCacheStats(): {
  size: number
  totalBytes: number
  maxBytes?: number
} {
  const stats = sharedMediaBlobCache.getStats()
  return {
    size: stats.size,
    totalBytes: stats.totalWeight,
    maxBytes: stats.maxWeight,
  }
}
