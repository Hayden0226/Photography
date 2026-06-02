import { describe, expect, it } from 'vitest'

import type { FeedPhoto } from './rss'
import { generateRSSFeed } from './rss'

describe('generateRSSFeed', () => {
  it('escapes textual FNumber and ExposureTime values in item descriptions', () => {
    const photos: FeedPhoto[] = [
      {
        id: 'unsafe-exif',
        title: 'Unsafe EXIF',
        dateTaken: '2026-01-01T00:00:00.000Z',
        exif: {
          Model: 'Camera <escaped>',
          LensModel: 'Lens <escaped>',
          FNumber: '1.8</p><img src=x onerror="alert(1)"><p>',
          ExposureTime: '1/60</p><svg onload="alert(2)"><p>',
        },
      },
    ]

    const feed = generateRSSFeed(photos, {
      title: 'Photo Feed',
      url: 'https://example.com',
    })

    expect(feed).not.toContain('<img src=x')
    expect(feed).not.toContain('<svg onload=')
    expect(feed).toContain('f/1.8&lt;/p&gt;&lt;img src=x onerror=&quot;alert(1)&quot;&gt;&lt;p&gt;')
    expect(feed).toContain('1/60&lt;/p&gt;&lt;svg onload=&quot;alert(2)&quot;&gt;&lt;p&gt;s')
  })

  it('prevents CDATA terminators from textual EXIF fields ending the description', () => {
    const photos: FeedPhoto[] = [
      {
        id: 'cdata-break',
        title: 'CDATA break',
        dateTaken: '2026-01-01T00:00:00.000Z',
        exif: {
          FNumber: '2.8]]></description><injected>CDATA_BREAK</injected><description><![CDATA[',
        },
      },
    ]

    const feed = generateRSSFeed(photos, {
      title: 'Photo Feed',
      url: 'https://example.com',
    })

    expect(feed).not.toContain('<injected>CDATA_BREAK</injected>')
    expect(feed).toContain('f/2.8]]&gt;&lt;/description&gt;&lt;injected&gt;CDATA_BREAK&lt;/injected&gt;')
  })
})
