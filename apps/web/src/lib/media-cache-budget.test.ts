import { afterEach, describe, expect, it, vi } from 'vitest'

import { getMediaCacheBudgetBytes } from './media-cache-budget'

const MiB = 1024 * 1024

afterEach(() => vi.unstubAllGlobals())

describe('media cache budget', () => {
  it('uses a 64 MiB budget on mobile viewports', () => {
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => ({ matches: true })),
    )
    expect(getMediaCacheBudgetBytes()).toBe(64 * MiB)
  })

  it('uses a 192 MiB budget on desktop viewports', () => {
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => ({ matches: false })),
    )
    expect(getMediaCacheBudgetBytes()).toBe(192 * MiB)
  })
})
