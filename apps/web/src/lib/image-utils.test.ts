import { describe, expect, it } from 'vitest'

import { formatFileSize, getImageFormat, getImageFormatDisplayName, isSupportedImageFormat } from './image-utils'

describe('image-utils', () => {
  it('extracts image formats from paths and URLs', () => {
    expect(getImageFormat('https://example.com/photo.heic?token=abc')).toBe('HEIC')
    expect(getImageFormat('/photos/archive/image.jpg#preview')).toBe('JPG')
    expect(getImageFormat('')).toBe('UNKNOWN')
  })

  it('formats file sizes and display names', () => {
    expect(formatFileSize(0)).toBe('0B')
    expect(formatFileSize(1024 * 1024)).toBe('1MB')
    expect(getImageFormatDisplayName('jpg')).toBe('JPEG')
    expect(getImageFormatDisplayName('webp')).toBe('WebP')
  })

  it('checks supported image formats', () => {
    expect(isSupportedImageFormat('heif')).toBe(true)
    expect(isSupportedImageFormat('txt')).toBe(false)
  })
})
