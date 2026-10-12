import { describe, expect, it } from 'vitest'

import {
  clampMasonryColumnSpan,
  getPhotoColumnSpan,
  resolveMasonryItemWidth,
  resolveMasonryThumbnailSizes,
} from './masonry-column-span'

describe('getPhotoColumnSpan', () => {
  it('spans two columns for panorama sized photos', () => {
    expect(getPhotoColumnSpan(3)).toBe(2)
    expect(getPhotoColumnSpan(2)).toBe(2)
  })

  it('keeps narrower photos in a single column', () => {
    expect(getPhotoColumnSpan(1.95)).toBe(1)
    expect(getPhotoColumnSpan(1.5)).toBe(1)
  })

  it('falls back to a single column for unknown aspect ratios', () => {
    expect(getPhotoColumnSpan()).toBe(1)
    expect(getPhotoColumnSpan(null)).toBe(1)
    expect(getPhotoColumnSpan(Number.NaN)).toBe(1)
  })
})

describe('clampMasonryColumnSpan', () => {
  it('limits the span to the available columns', () => {
    expect(clampMasonryColumnSpan(2, 1)).toBe(1)
    expect(clampMasonryColumnSpan(2, 0)).toBe(1)
    expect(clampMasonryColumnSpan(2, 1.5)).toBe(1)
    expect(clampMasonryColumnSpan(2, 5)).toBe(2)
  })

  it('never returns less than a single column', () => {
    expect(clampMasonryColumnSpan(0, 4)).toBe(1)
    expect(clampMasonryColumnSpan(Number.NaN, 4)).toBe(1)
  })
})

describe('resolveMasonryItemWidth', () => {
  it('adds the covered gutters when a photo spans several columns', () => {
    expect(resolveMasonryItemWidth({ columnWidth: 250, columnGutter: 4, columnSpan: 1 })).toBe(250)
    expect(resolveMasonryItemWidth({ columnWidth: 250, columnGutter: 4, columnSpan: 2 })).toBe(504)
  })
})

describe('resolveMasonryThumbnailSizes', () => {
  it('scales the sizes attribute with the column span', () => {
    expect(resolveMasonryThumbnailSizes(1)).toBe('(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 350px')
    expect(resolveMasonryThumbnailSizes(2)).toBe('(max-width: 640px) 100vw, (max-width: 1024px) 66vw, 700px')
  })
})
