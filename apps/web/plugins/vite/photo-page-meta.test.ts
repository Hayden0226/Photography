import type { PhotoManifestItem } from '@afilmory/builder'
import { describe, expect, it } from 'vitest'

import type { SiteConfig } from '../../../../site.config'
import { applyPhotoPageMeta, createPhotoPageMeta, createPhotoPreloadLink } from './photo-page-meta'

const siteConfig: SiteConfig = {
  name: 'Gallery',
  title: 'Gallery',
  description: 'Site description',
  url: 'https://photos.example.com',
  accentColor: '#000000',
  author: { name: 'Jacky', url: 'https://example.com' },
}

const photo: PhotoManifestItem = {
  id: 'photo/unsafe',
  title: 'Fallback title',
  titles: { 'zh-CN': '标题 </script>' },
  description: 'Description',
  descriptions: { 'zh-CN': '图像描述' },
  dateTaken: '2026-01-02T03:04:05.000Z',
  tags: [],
  originalUrl: 'https://cdn.example.com/photos/photo.jpg',
  thumbnailUrl: '/thumbnails/photo.jpg',
  thumbnailSrcSet: '/thumbnails/photo.jpg 640w',
  thumbnailWebpSrcSet: '/thumbnails/photo-360.webp 360w, /thumbnails/photo-640.webp 640w',
  thumbHash: null,
  width: 1200,
  height: 800,
  aspectRatio: 1.5,
  s3Key: 'photo.jpg',
  lastModified: '2026-01-02T03:04:05.000Z',
  size: 123,
  exif: null,
  toneAnalysis: null,
}

describe('photo-page-meta', () => {
  it('replaces gallery preloads with the current photo and adds safe fallback SEO', () => {
    const baseHtml = `<!doctype html><html><head><title>Gallery</title><link rel="preload" as="image" data-afilmory-preload="gallery" href="/wrong.webp"></head><body><main></main></body></html>`
    const html = applyPhotoPageMeta(baseHtml, createPhotoPageMeta(photo, siteConfig))

    expect(html).not.toContain('/wrong.webp')
    expect(html).toContain('data-afilmory-preload="photo"')
    expect(html).toContain('imagesrcset="/thumbnails/photo-360.webp 360w, /thumbnails/photo-640.webp 640w"')
    expect(html).toContain('type="application/ld+json"')
    expect(html).toContain('"@type":"ImageObject"')
    expect(html).not.toContain('标题 </script>')
    expect(html).toContain('data-afilmory-photo-noscript')
    expect(html).toContain('photos/photo%2Funsafe/')
  })

  it('uses the first candidate of the selected responsive source for preload', () => {
    const preload = createPhotoPreloadLink(photo)
    expect(preload).toContain('href="/thumbnails/photo-360.webp"')
    expect(preload).toContain('type="image/webp"')
  })

  it('describes independent videos as VideoObject', () => {
    const video = {
      ...photo,
      mediaType: 'video' as const,
      videoUrl: 'https://cdn.example.com/photos/movie.mp4',
      mimeType: 'video/mp4',
      duration: 12.5,
    }
    const html = applyPhotoPageMeta(
      '<html><head><title>x</title></head><body></body></html>',
      createPhotoPageMeta(video, siteConfig),
    )
    expect(html).toContain('"@type":"VideoObject"')
    expect(html).toContain('"duration":"PT12.5S"')
    expect(html).toContain('<video controls')
  })
})
