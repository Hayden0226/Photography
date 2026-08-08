import { describe, expect, it } from 'vitest'

import { hasVisibleIncomingEntries } from './standardize-photos-policy'

describe('hasVisibleIncomingEntries', () => {
  it('ignores removed categories that only contain hidden placeholders', () => {
    expect(hasVisibleIncomingEntries([])).toBe(false)
    expect(hasVisibleIncomingEntries([{ name: '.gitkeep' }, { name: '.DS_Store' }])).toBe(false)
  })

  it('keeps rejecting removed categories that still contain visible content', () => {
    expect(hasVisibleIncomingEntries([{ name: '.gitkeep' }, { name: 'photo.jpg' }])).toBe(true)
    expect(hasVisibleIncomingEntries([{ name: 'nested-folder' }])).toBe(true)
  })
})
