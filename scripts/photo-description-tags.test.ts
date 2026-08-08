import { describe, expect, it } from 'vitest'

import {
  composePhotoTags,
  getPhotoCategory,
  MAX_CUSTOM_PHOTO_TAGS,
  MAX_PHOTO_TAGS,
  normalizeCustomPhotoTags,
} from '../plugins/builder/photo-description-tags.js'

describe('photo description tags', () => {
  it('extracts the automatic category from a storage key', () => {
    expect(getPhotoCategory('photos/城市/20260807093839.jpeg')).toBe('城市')
    expect(getPhotoCategory('人文\\20260807062930.jpg')).toBe('人文')
  })

  it('removes duplicate and automatic tags before enforcing the custom limit', () => {
    expect(normalizeCustomPhotoTags([' 城市 ', '香港', '香港', '中环', '夜景', '电车'], ['城市'])).toEqual([
      '香港',
      '中环',
      '夜景',
    ])
    expect(MAX_CUSTOM_PHOTO_TAGS).toBe(3)
  })

  it('keeps one automatic tag and at most three custom tags', () => {
    const tags = composePhotoTags(['城市', '不应保留'], ['城市', '香港', '中环', '电车', '夜景'])

    expect(tags).toEqual(['城市', '香港', '中环', '电车'])
    expect(tags).toHaveLength(MAX_PHOTO_TAGS)
  })
})
