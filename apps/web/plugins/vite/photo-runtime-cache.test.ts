import { describe, expect, it } from 'vitest'

import { ACTIVE_PHOTO_RUNTIME_CACHES, createPhotoRuntimeCaching } from './photo-runtime-cache'

describe('photo runtime caching', () => {
  it('refreshes thumbnails in the background and prefers the network for originals', () => {
    const [thumbnails, originals] = createPhotoRuntimeCaching()

    expect(thumbnails?.handler).toBe('StaleWhileRevalidate')
    expect(thumbnails?.options?.cacheName).toBe(ACTIVE_PHOTO_RUNTIME_CACHES.thumbnails)
    expect(thumbnails?.options?.expiration?.maxEntries).toBe(240)
    expect(thumbnails?.options?.expiration?.maxAgeSeconds).toBe(60 * 60 * 24 * 3)
    expect(originals?.handler).toBe('NetworkFirst')
    expect(originals?.options?.cacheName).toBe(ACTIVE_PHOTO_RUNTIME_CACHES.originals)
    expect(originals?.options?.networkTimeoutSeconds).toBe(4)
    expect(originals?.options?.expiration?.maxEntries).toBe(12)
    expect(originals?.options?.expiration?.maxAgeSeconds).toBe(60 * 60 * 3)
  })

  it('matches only the intended thumbnail and original photo URLs', () => {
    const [thumbnails, originals] = createPhotoRuntimeCaching()
    const thumbnailPattern = thumbnails?.urlPattern as RegExp
    const originalPattern = originals?.urlPattern as RegExp

    expect(thumbnailPattern.test('https://photo.example/thumbnails/example.webp')).toBe(true)
    expect(thumbnailPattern.test('https://photo.example/photos/example.webp')).toBe(false)
    expect(originalPattern.test('https://photo.example/photos/example.jpg?v=2')).toBe(true)
    expect(originalPattern.test('https://photo.example/private/example.txt')).toBe(false)
  })
})
