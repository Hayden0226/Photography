import type { PhotoManifestIndexItem } from '@afilmory/data'

export type PhotoSortOrder = 'asc' | 'desc'
export type TagFilterMode = 'union' | 'intersection'

export const parsePhotoTime = (value: string | undefined | null): number | null => {
  if (!value) return null

  const normalized = value.replace(/^(\d{4}):(\d{2}):(\d{2})/, '$1-$2-$3')
  const timestamp = new Date(normalized).getTime()
  return Number.isNaN(timestamp) ? null : timestamp
}

export const getPhotoSortTime = (photo: Pick<PhotoManifestIndexItem, 'dateTaken' | 'lastModified' | 'sortTime'>) => {
  return photo.sortTime ?? parsePhotoTime(photo.dateTaken) ?? parsePhotoTime(photo.lastModified) ?? 0
}

export const filterAndSortPhotoList = <T extends PhotoManifestIndexItem>(
  photos: T[],
  selectedTags: string[],
  selectedCameras: string[],
  selectedLenses: string[],
  selectedRatings: number | null,
  sortOrder: PhotoSortOrder,
  tagFilterMode: TagFilterMode = 'union',
): T[] => {
  let filteredPhotos = photos

  if (selectedTags.length > 0) {
    filteredPhotos = filteredPhotos.filter((photo) => {
      if (tagFilterMode === 'intersection') {
        return selectedTags.every((tag) => photo.tags.includes(tag))
      }

      return selectedTags.some((tag) => photo.tags.includes(tag))
    })
  }

  if (selectedCameras.length > 0) {
    filteredPhotos = filteredPhotos.filter((photo) => {
      if (!photo.cameraDisplayName) return false
      return selectedCameras.includes(photo.cameraDisplayName)
    })
  }

  if (selectedLenses.length > 0) {
    filteredPhotos = filteredPhotos.filter((photo) => {
      if (!photo.lensDisplayName) return false
      return selectedLenses.includes(photo.lensDisplayName)
    })
  }

  if (selectedRatings !== null) {
    filteredPhotos = filteredPhotos.filter((photo) => {
      if (!photo.rating) return false
      return photo.rating >= selectedRatings
    })
  }

  return filteredPhotos.toSorted((a, b) => {
    const aTime = getPhotoSortTime(a)
    const bTime = getPhotoSortTime(b)

    return sortOrder === 'asc' ? aTime - bTime : bTime - aTime
  })
}
