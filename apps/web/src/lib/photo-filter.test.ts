import type { PhotoManifestIndexItem } from '@afilmory/data'
import { describe, expect, it } from 'vitest'

import { filterAndSortPhotoList, parsePhotoTime } from './photo-filter'

const photo = (overrides: Partial<PhotoManifestIndexItem>): PhotoManifestIndexItem =>
  ({
    id: overrides.id ?? 'photo',
    title: overrides.title ?? 'Photo',
    tags: overrides.tags ?? [],
    dateTaken: overrides.dateTaken,
    lastModified: overrides.lastModified,
    sortTime: overrides.sortTime,
    cameraDisplayName: overrides.cameraDisplayName,
    lensDisplayName: overrides.lensDisplayName,
    rating: overrides.rating,
  }) as PhotoManifestIndexItem

describe('photo-filter', () => {
  it('parses EXIF-style timestamps', () => {
    expect(parsePhotoTime('2024:05:10 12:30:00')).toBe(new Date('2024-05-10 12:30:00').getTime())
    expect(parsePhotoTime('not-a-date')).toBeNull()
  })

  it('filters tags by union or intersection and sorts by time', () => {
    const photos = [
      photo({ id: 'old', tags: ['travel'], sortTime: 1 }),
      photo({ id: 'new', tags: ['travel', 'night'], sortTime: 3 }),
      photo({ id: 'other', tags: ['family'], sortTime: 2 }),
    ]

    expect(
      filterAndSortPhotoList(photos, ['travel', 'night'], [], [], null, 'desc', 'union').map((item) => item.id),
    ).toEqual(['new', 'old'])
    expect(
      filterAndSortPhotoList(photos, ['travel', 'night'], [], [], null, 'desc', 'intersection').map((item) => item.id),
    ).toEqual(['new'])
  })

  it('filters camera, lens, and minimum rating', () => {
    const photos = [
      photo({ id: 'match', tags: [], cameraDisplayName: 'X-T5', lensDisplayName: '35mm', rating: 5, sortTime: 1 }),
      photo({ id: 'wrong-lens', tags: [], cameraDisplayName: 'X-T5', lensDisplayName: '50mm', rating: 5, sortTime: 2 }),
      photo({ id: 'low-rating', tags: [], cameraDisplayName: 'X-T5', lensDisplayName: '35mm', rating: 2, sortTime: 3 }),
    ]

    expect(filterAndSortPhotoList(photos, [], ['X-T5'], ['35mm'], 4, 'asc').map((item) => item.id)).toEqual(['match'])
  })
})
