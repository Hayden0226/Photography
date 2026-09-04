import { afterEach, describe, expect, it, vi } from 'vitest'

import { getRepoFile } from './github'

const jsonResponse = (data: unknown, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => data,
})

describe('github network retry', () => {
  const token = 'test-token'

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('retries transient network failures and succeeds', async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('fetch failed'))
      .mockRejectedValueOnce(new TypeError('fetch failed'))
      .mockResolvedValueOnce(
        jsonResponse({ path: 'x.jpg', sha: 'abc123', size: 3, content: 'aGk=', encoding: 'base64' }),
      )
    vi.stubGlobal('fetch', fetchMock)

    const file = await getRepoFile(token, 'Photography-Photos', '随手/A.jpg')

    expect(file.sha).toBe('abc123')
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  it('gives up after all retries when the network keeps failing', async () => {
    const fetchMock = vi.fn(async () => {
      throw new TypeError('fetch failed')
    })
    vi.stubGlobal('fetch', fetchMock)

    await expect(getRepoFile(token, 'Photography-Photos', '随手/A.jpg')).rejects.toThrow('fetch failed')
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  it('does not retry HTTP error responses', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ message: 'Not Found' }, 404))
    vi.stubGlobal('fetch', fetchMock)

    await expect(getRepoFile(token, 'Photography-Photos', '随手/A.jpg')).rejects.toThrow(/404/)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})
