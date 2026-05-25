import { describe, expect, it } from 'vitest'

import { createLightManifest, createThumbnailPreloadLinks, serializeForInlineScript } from './manifest-inject'

describe('manifest-inject helpers', () => {
  it('creates a light manifest with display metadata and compact gallery exif', () => {
    const manifest = createLightManifest({
      version: 'v9',
      cameras: [{ name: 'camera' }],
      lenses: [{ name: 'lens' }],
      data: [
        {
          id: 'photo-1',
          title: 'Photo 1',
          tags: ['travel'],
          thumbnailUrl: '/thumb.jpg',
          width: 100,
          height: 50,
          aspectRatio: 2,
          dateTaken: '2024:05:10 12:30:00',
          exif: {
            Make: 'Fujifilm',
            Model: 'X-T5',
            LensModel: '35mm',
            ISO: 200,
            Rating: 5,
          },
        },
      ],
    })

    expect(manifest.version).toBe('v9')
    expect(manifest.data[0]).toMatchObject({
      id: 'photo-1',
      cameraDisplayName: 'Fujifilm X-T5',
      lensDisplayName: '35mm',
      rating: 5,
      galleryExif: {
        ISO: 200,
      },
    })
    expect(manifest.data[0].sortTime).toBe(new Date('2024-05-10 12:30:00').getTime())
  })

  it('serializes inline script data safely', () => {
    expect(serializeForInlineScript({ html: '</script><img />' })).toContain('\\u003C/script\\u003E')
  })

  it('generates responsive thumbnail preload links', () => {
    const links = createThumbnailPreloadLinks({
      data: [
        {
          thumbnailUrl: '/fallback.jpg',
          thumbnailWebpSrcSet: '/one.webp 360w, /two.webp 640w',
        },
      ],
    })

    expect(links).toContain('rel="preload"')
    expect(links).toContain('href="/one.webp"')
    expect(links).toContain('imagesrcset="/one.webp 360w, /two.webp 640w"')
  })
})
