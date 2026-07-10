import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  clearAllMediaBlobCaches,
  getMediaBlobCacheEntry,
  getSharedMediaBlobCacheStats,
  setMediaBlobCacheEntry,
} from './media-blob-cache'

const MiB = 1024 * 1024

afterEach(() => clearAllMediaBlobCaches())

describe('shared media blob cache', () => {
  it('enforces one byte budget across image and video namespaces', () => {
    const revokeImage = vi.fn()
    const revokeVideo = vi.fn()

    setMediaBlobCacheEntry({
      namespace: 'regular-image',
      key: 'large-image',
      value: 'blob:image',
      bytes: 100 * MiB,
      revoke: revokeImage,
    })
    setMediaBlobCacheEntry({
      namespace: 'video',
      key: 'large-video',
      value: 'blob:video',
      bytes: 100 * MiB,
      revoke: revokeVideo,
    })

    expect(getSharedMediaBlobCacheStats()).toMatchObject({
      size: 1,
      totalBytes: 100 * MiB,
      maxBytes: 192 * MiB,
    })
    expect(getMediaBlobCacheEntry('regular-image', 'large-image')).toBeUndefined()
    expect(getMediaBlobCacheEntry('video', 'large-video')).toBe('blob:video')
    expect(revokeImage).toHaveBeenCalledOnce()
    expect(revokeVideo).not.toHaveBeenCalled()
  })
})
