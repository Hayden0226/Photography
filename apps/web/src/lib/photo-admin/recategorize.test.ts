import { afterEach, describe, expect, it, vi } from 'vitest'

import { buildNewS3Key, getPhotoCategory, recategorizePhoto, updateDescriptionsCategory } from './recategorize'

describe('getPhotoCategory', () => {
  it('extracts the first path segment as category', () => {
    expect(getPhotoCategory('随手/20250901221543.jpg')).toBe('随手')
  })

  it('returns null when there is no folder', () => {
    expect(getPhotoCategory('20250901221543.jpg')).toBeNull()
    expect(getPhotoCategory('')).toBeNull()
  })

  it('handles backslash keys', () => {
    expect(getPhotoCategory('随手\\20250901221543.jpg')).toBe('随手')
  })
})

describe('buildNewS3Key', () => {
  it('replaces the category segment', () => {
    expect(buildNewS3Key('随手/20250901221543.jpg', '风景')).toBe('风景/20250901221543.jpg')
  })

  it('normalizes the new category', () => {
    expect(buildNewS3Key('随手/A.jpg', ' 风景/ ')).toBe('风景/A.jpg')
  })

  it('throws on empty category', () => {
    expect(() => buildNewS3Key('随手/A.jpg', '   ')).toThrow('新分类不能为空')
  })

  it('throws when the key has no folder', () => {
    expect(() => buildNewS3Key('A.jpg', '风景')).toThrow('无法从照片路径解析分类')
  })
})

const sampleDescriptions = JSON.stringify(
  {
    version: 1,
    photos: [
      {
        key: '随手/20250901221543.jpg',
        title: 'x',
        aiContext: { categoryTags: ['随手'] },
      },
      {
        key: '城市/IMG_20251031_173316.jpg',
        aiContext: { categoryTags: ['城市'] },
      },
    ],
  },
  null,
  2,
)

describe('updateDescriptionsCategory', () => {
  it('updates the matching entry key and category tags', () => {
    const { json, updated } = updateDescriptionsCategory(
      sampleDescriptions,
      '随手/20250901221543.jpg',
      '风景/20250901221543.jpg',
      '随手',
      '风景',
    )
    expect(updated).toBe(true)
    const parsed = JSON.parse(json) as { photos: Array<{ key: string; aiContext: { categoryTags: string[] } }> }
    expect(parsed.photos[0].key).toBe('风景/20250901221543.jpg')
    expect(parsed.photos[0].aiContext.categoryTags).toEqual(['风景'])
    expect(parsed.photos[1].key).toBe('城市/IMG_20251031_173316.jpg')
  })

  it('keeps the file unchanged when no entry matches', () => {
    const { json, updated } = updateDescriptionsCategory(
      sampleDescriptions,
      '街拍/none.jpg',
      '风景/none.jpg',
      '街拍',
      '风景',
    )
    expect(updated).toBe(false)
    expect(json.trimEnd()).toBe(sampleDescriptions.trimEnd())
  })

  it('throws on invalid format', () => {
    expect(() => updateDescriptionsCategory('not-json', 'a.jpg', 'b.jpg', 'a', 'b')).toThrow()
  })
})

const jsonResponse = (data: unknown, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => data,
})

const fileResponse = (overrides: Partial<{ content: string; sha: string }> = {}) =>
  jsonResponse({
    path: 'x',
    sha: 'abc123',
    size: 10,
    content: overrides.content ?? 'aGVsbG8=',
    encoding: 'base64',
  })

const notFoundResponse = () => jsonResponse({ message: 'Not Found' }, 404)

describe('recategorizePhoto', () => {
  const token = 'test-token'

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('moves the photo file and updates descriptions', async () => {
    const calls: Array<{ method: string; url: string; body?: string }> = []
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = decodeURIComponent(String(input))
      const method = init?.method ?? 'GET'
      calls.push({ method, url, body: typeof init?.body === 'string' ? init.body : undefined })

      if (url.includes('/contents/随手/20250901221543.jpg')) {
        if (method === 'GET') return fileResponse({ content: 'aGVsbG8=' })
        if (method === 'DELETE') return jsonResponse({})
      }
      if (url.includes('/contents/风景/20250901221543.jpg')) {
        if (method === 'GET') return notFoundResponse()
        if (method === 'PUT') return jsonResponse({})
      }
      if (url.includes('/contents/content/photo-descriptions.json')) {
        if (method === 'GET') {
          const encoded = Buffer.from(sampleDescriptions, 'utf-8').toString('base64')
          return fileResponse({ content: encoded })
        }
        if (method === 'PUT') return jsonResponse({})
      }
      throw new Error(`unexpected request: ${method} ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)

    const result = await recategorizePhoto(token, '随手/20250901221543.jpg', '风景')

    expect(result.ok).toBe(true)
    expect(result.oldS3Key).toBe('随手/20250901221543.jpg')
    expect(result.newS3Key).toBe('风景/20250901221543.jpg')
    expect(result.steps.map((step) => step.status)).toEqual(['ok', 'ok', 'ok', 'ok'])

    const putBodies = calls.filter((call) => call.method === 'PUT').map((call) => JSON.parse(call.body ?? '{}'))
    expect(putBodies[0].content).toBe('aGVsbG8=')
    expect(putBodies[0].sha).toBeUndefined()
    const decoded = Buffer.from(putBodies[1].content, 'base64').toString('utf-8')
    expect(decoded).toContain('风景/20250901221543.jpg')
  })

  it('fails when the target already exists', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = decodeURIComponent(String(input))
      const method = init?.method ?? 'GET'
      if (url.includes('/contents/随手/A.jpg') && method === 'GET') return fileResponse()
      if (url.includes('/contents/风景/A.jpg') && method === 'GET') return fileResponse()
      throw new Error(`unexpected request: ${method} ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)

    const result = await recategorizePhoto(token, '随手/A.jpg', '风景')
    expect(result.ok).toBe(false)
    expect(result.error).toContain('已存在')
  })

  it('fails when the source photo is missing', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      if (decodeURIComponent(String(input)).includes('/contents/随手/A.jpg')) return notFoundResponse()
      throw new Error('unexpected request')
    })
    vi.stubGlobal('fetch', fetchMock)

    const result = await recategorizePhoto(token, '随手/A.jpg', '风景')
    expect(result.ok).toBe(false)
    expect(result.error).toContain('找不到')
  })

  it('skips descriptions update when the entry is absent', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = decodeURIComponent(String(input))
      const method = init?.method ?? 'GET'
      if (url.includes('/contents/随手/A.jpg')) {
        if (method === 'GET') return fileResponse()
        if (method === 'DELETE') return jsonResponse({})
      }
      if (url.includes('/contents/风景/A.jpg')) {
        if (method === 'GET') return notFoundResponse()
        if (method === 'PUT') return jsonResponse({})
      }
      if (url.includes('/contents/content/photo-descriptions.json')) {
        if (method === 'GET') {
          return fileResponse({ content: Buffer.from('{"version":1,"photos":[]}', 'utf-8').toString('base64') })
        }
        if (method === 'PUT') return jsonResponse({})
      }
      throw new Error(`unexpected request: ${method} ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)

    const result = await recategorizePhoto(token, '随手/A.jpg', '风景')
    expect(result.ok).toBe(true)
    expect(result.steps[3]).toEqual({
      step: 'update-descriptions',
      status: 'skipped',
      detail: expect.stringContaining('没有'),
    })
  })
})
