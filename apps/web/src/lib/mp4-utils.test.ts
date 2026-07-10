import { describe, expect, it, vi } from 'vitest'

import { transmuxMovToMp4Simple } from './mp4-utils'

describe('transmuxMovToMp4Simple cancellation', () => {
  it('rejects before fetching when the caller already aborted', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    const controller = new AbortController()
    controller.abort()

    await expect(
      transmuxMovToMp4Simple('/fixtures/live-photo.mov', { signal: controller.signal }),
    ).rejects.toMatchObject({ name: 'AbortError' })
    expect(fetchSpy).not.toHaveBeenCalled()

    fetchSpy.mockRestore()
  })
})
