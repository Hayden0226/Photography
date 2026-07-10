// @vitest-environment node

import { describe, expect, it } from 'vitest'

import { findExistingItemsToRetain, resolveBuildFailurePolicy } from './failure-policy.js'

const incremental = {
  isForceMode: false,
  isForceManifest: false,
}

describe('builder failure policy', () => {
  it('retains the last good item for media that failed during an incremental build', () => {
    const previous = { s3Key: 'gallery/failed.jpg', revision: 'last-good' }
    const retained = findExistingItemsToRetain(
      [{ s3Key: 'gallery/success.jpg', revision: 'new' }],
      new Map([
        [previous.s3Key, previous],
        ['gallery/deleted.jpg', { s3Key: 'gallery/deleted.jpg', revision: 'old' }],
      ]),
      new Set(['gallery/success.jpg', previous.s3Key]),
    )

    expect(retained).toEqual([previous])
  })

  it('saves the last-good incremental manifest but rejects strict callers', () => {
    expect(resolveBuildFailurePolicy({ ...incremental, strict: true }, 1, true)).toEqual({
      isFullBuild: false,
      shouldSaveManifest: true,
      shouldRejectBuild: true,
    })
    expect(resolveBuildFailurePolicy({ ...incremental, strict: false }, 1, true).shouldRejectBuild).toBe(false)
  })

  it('never saves a partial full rebuild, even outside strict mode', () => {
    expect(resolveBuildFailurePolicy({ isForceMode: true, isForceManifest: false, strict: false }, 1, true)).toEqual({
      isFullBuild: true,
      shouldSaveManifest: false,
      shouldRejectBuild: true,
    })
  })

  it('treats a first build without a last-good manifest as a full rebuild', () => {
    expect(resolveBuildFailurePolicy({ ...incremental, strict: true }, 1, false)).toEqual({
      isFullBuild: true,
      shouldSaveManifest: false,
      shouldRejectBuild: true,
    })
  })
})
