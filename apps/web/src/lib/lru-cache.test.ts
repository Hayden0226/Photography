import { describe, expect, it, vi } from 'vitest'

import { LRUCache } from './lru-cache'

describe('LRUCache byte budgets', () => {
  it('evicts least-recently-used entries when the weight budget is exceeded', () => {
    const cleanup = vi.fn()
    const cache = new LRUCache<string, { bytes: number }>(10, cleanup, {
      maxWeight: 5,
      getWeight: (value) => value.bytes,
    })

    cache.set('first', { bytes: 3 })
    cache.set('second', { bytes: 3 })

    expect(cache.has('first')).toBe(false)
    expect(cache.has('second')).toBe(true)
    expect(cache.getStats()).toMatchObject({ size: 1, totalWeight: 3, maxWeight: 5 })
    expect(cleanup).toHaveBeenCalledWith(expect.objectContaining({ bytes: 3 }), 'first', expect.any(String))
  })

  it('uses reads to promote entries before weighted eviction', () => {
    const cache = new LRUCache<string, { bytes: number }>(10, undefined, {
      maxWeight: 6,
      getWeight: (value) => value.bytes,
    })

    cache.set('first', { bytes: 2 })
    cache.set('second', { bytes: 2 })
    cache.get('first')
    cache.set('third', { bytes: 3 })

    expect(cache.has('first')).toBe(true)
    expect(cache.has('second')).toBe(false)
    expect(cache.has('third')).toBe(true)
  })

  it('retains a single oversized entry so its resource remains usable', () => {
    const cache = new LRUCache<string, { bytes: number }>(10, undefined, {
      maxWeight: 5,
      getWeight: (value) => value.bytes,
    })

    cache.set('large', { bytes: 8 })

    expect(cache.has('large')).toBe(true)
    expect(cache.getStats().totalWeight).toBe(8)
  })
})
