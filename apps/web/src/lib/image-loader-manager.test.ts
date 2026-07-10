import { describe, expect, it } from 'vitest'

import { requiresBlobImageLoad } from './image-loader-manager'

describe('requiresBlobImageLoad', () => {
  it.each(['photo.jpg', 'photo.JPEG?token=1', 'photo.png', 'photo.webp', 'photo.avif'])(
    'uses the native URL path for %s',
    (src) => {
      expect(requiresBlobImageLoad(src)).toBe(false)
    },
  )

  it.each(['photo.heic', 'photo.heif', 'photo.hif', 'photo.tiff', 'photo.tif', '/image-without-extension'])(
    'uses the Blob conversion path for %s',
    (src) => {
      expect(requiresBlobImageLoad(src)).toBe(true)
    },
  )
})
