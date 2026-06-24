const GENERATOR_NAME = 'Afilmory Feed Generator'

type FeedPhotoExifValue = string | number | null | undefined

export interface FeedPhotoExif {
  Model?: FeedPhotoExifValue
  LensModel?: FeedPhotoExifValue
  FNumber?: FeedPhotoExifValue
  ExposureTime?: FeedPhotoExifValue
}

export interface FeedPhoto {
  id: string
  title?: string | null
  titles?: Record<string, string> | null
  description?: string | null
  tags?: readonly string[] | null
  dateTaken?: string | null
  lastModified?: string | null
  exif?: FeedPhotoExif | null
}

export interface FeedSiteAuthor {
  name: string
  url?: string | null
  avatar?: string | null
}

export interface FeedSiteConfig {
  title: string
  description?: string | null
  url: string
  author?: FeedSiteAuthor
  locale?: string | null
}

export function generateRSSFeed(photos: readonly FeedPhoto[], config: FeedSiteConfig): string {
  const baseUrl = normalizeBaseUrl(config.url)
  const sortedPhotos = [...photos].sort((a, b) => resolveDate(b) - resolveDate(a))
  const lastBuildDate = new Date().toUTCString()
  const channelDescription = escapeXml(config.description ?? config.title ?? 'Photo feed')
  const channelLanguage = escapeXml(config.locale ?? 'en')

  const itemsXml = sortedPhotos.map((photo) => createItemXml(photo, baseUrl)).join('\n')

  const author = config.author?.name ? escapeXml(config.author.name) : null
  const managingEditor = author && config.author?.url ? `${author} (${config.author.url})` : author

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>${escapeXml(config.title)}</title>
    <link>${baseUrl}</link>
    <description>${channelDescription}</description>
    <language>${channelLanguage}</language>
    <lastBuildDate>${lastBuildDate}</lastBuildDate>
    <generator>${GENERATOR_NAME}</generator>
    ${managingEditor ? `<managingEditor>${managingEditor}</managingEditor>` : ''}
${itemsXml}
  </channel>
</rss>`
}

function createItemXml(photo: FeedPhoto, baseUrl: string): string {
  const link = `${baseUrl}/photos/${encodeURIComponent(photo.id)}/`
  const pubDate = new Date(resolveDate(photo)).toUTCString()
  const title = escapeXml(getPhotoTitle(photo))
  const summary = buildDescription(photo)
  const categories =
    Array.isArray(photo.tags) && photo.tags.length > 0
      ? photo.tags.map((tag) => `      <category>${escapeXml(tag)}</category>`).join('\n')
      : ''

  return `    <item>
      <title>${title}</title>
      <link>${link}</link>
      <guid isPermaLink="false">${escapeXml(photo.id)}</guid>
      <pubDate>${pubDate}</pubDate>
      <description><![CDATA[${summary}]]></description>
${categories}
    </item>`
}

function buildDescription(photo: FeedPhoto): string {
  const segments: string[] = []
  if (photo.description) {
    segments.push(escapeHtmlBlock(photo.description))
  }
  if (Array.isArray(photo.tags) && photo.tags.length > 0) {
    segments.push(`<p><strong>Tags:</strong> ${photo.tags.map(escapeXml).join(', ')}</p>`)
  }

  if (photo.exif) {
    const exifParts: string[] = []
    const model = formatExifValue(photo.exif.Model)
    if (model) {
      exifParts.push(escapeXml(model))
    }
    const lensModel = formatExifValue(photo.exif.LensModel)
    if (lensModel) {
      exifParts.push(escapeXml(lensModel))
    }
    const fNumber = formatExifValue(photo.exif.FNumber)
    if (fNumber) {
      exifParts.push(`f/${escapeXml(fNumber)}`)
    }
    const exposureTime = formatExifValue(photo.exif.ExposureTime)
    if (exposureTime) {
      exifParts.push(`${escapeXml(exposureTime)}s`)
    }
    if (exifParts.length > 0) {
      segments.push(`<p><strong>EXIF:</strong> ${exifParts.join(' · ')}</p>`)
    }
  }

  return segments.join('\n') || escapeXml(getPhotoTitle(photo))
}

function getPhotoTitle(photo: FeedPhoto): string {
  return photo.titles?.['zh-CN']?.trim() || photo.titles?.en?.trim() || photo.title?.trim() || photo.id
}

function formatExifValue(value: FeedPhotoExifValue): string | null {
  if (value === null || value === undefined || value === '') return null
  return String(value)
}

function escapeXml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function escapeHtmlBlock(value: string): string {
  return `<p>${escapeXml(value)}</p>`
}

function normalizeBaseUrl(url: string): string {
  if (!url) {
    return 'https://example.com'
  }
  return url.endsWith('/') ? url.slice(0, -1) : url
}

function resolveDate(photo: FeedPhoto): number {
  const date = photo.dateTaken ?? photo.lastModified
  const timestamp = date ? Date.parse(date) : Number.NaN
  if (!Number.isNaN(timestamp)) {
    return timestamp
  }
  return Date.now()
}
