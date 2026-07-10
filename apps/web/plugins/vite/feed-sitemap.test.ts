import type { PhotoManifestItem } from '@afilmory/builder'
import { describe, expect, it } from 'vitest'

import type { SiteConfig } from '../../../../site.config'
import { generateSitemap } from './sitemap'

describe('image sitemap', () => {
  it('adds escaped image metadata and safe photo routes', () => {
    const config = {
      name: 'Gallery',
      title: 'Gallery',
      description: 'Description',
      url: 'https://photos.example.com/',
      accentColor: '#000',
      author: { name: 'Jacky', url: 'https://example.com' },
    } satisfies SiteConfig
    const photo = {
      id: 'photo/1',
      title: 'Title & light',
      description: 'Sea < sky',
      dateTaken: '2026-01-02T03:04:05.000Z',
      lastModified: '2026-01-02T03:04:05.000Z',
      originalUrl: '/media/photo.jpg',
    } as PhotoManifestItem

    const sitemap = generateSitemap([photo], config)
    expect(sitemap).toContain('xmlns:image="http://www.google.com/schemas/sitemap-image/1.1"')
    expect(sitemap).toContain('<loc>https://photos.example.com/photos/photo%2F1/</loc>')
    expect(sitemap).toContain('<image:loc>https://photos.example.com/media/photo.jpg</image:loc>')
    expect(sitemap).toContain('<image:title>Title &amp; light</image:title>')
    expect(sitemap).toContain('<image:caption>Sea &lt; sky</image:caption>')
  })

  it('uses a web-indexable thumbnail for unsupported original image formats', () => {
    const config = {
      name: 'Gallery',
      title: 'Gallery',
      description: 'Description',
      url: 'https://photos.example.com/',
      accentColor: '#000',
      author: { name: 'Jacky', url: 'https://example.com' },
    } satisfies SiteConfig
    const photo = {
      id: 'heic-photo',
      title: 'HEIC photo',
      description: 'Converted thumbnail',
      dateTaken: '2026-01-02T03:04:05.000Z',
      lastModified: '2026-01-02T03:04:05.000Z',
      originalUrl: 'https://cdn.example.com/photos/photo.heic?version=1',
      thumbnailUrl: '/thumbnails/photo.jpg',
    } as PhotoManifestItem

    const sitemap = generateSitemap([photo], config)
    expect(sitemap).toContain('<image:loc>https://photos.example.com/thumbnails/photo.jpg</image:loc>')
    expect(sitemap).not.toContain('.heic')
  })
})
