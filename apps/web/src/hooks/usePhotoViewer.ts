import { photoLoader } from '@afilmory/data'
import type { ExtractAtomValue } from 'jotai'
import { atom, useAtomValue, useSetAtom } from 'jotai'
import { use, useCallback, useEffect, useMemo } from 'react'

import { gallerySettingAtom } from '~/atoms/app'
import { lockBodyScroll, unlockBodyScroll } from '~/lib/body-scroll-lock'
import { jotaiStore } from '~/lib/jotai'
import { filterAndSortPhotoList } from '~/lib/photo-filter'
import { trackView } from '~/lib/tracker'
import { PhotosContext } from '~/providers/photos-context'

const openAtom = atom(false)
const currentPhotoIdAtom = atom<string | null>(null)
const triggerElementAtom = atom<HTMLElement | null>(null)
const data = photoLoader.getPhotos()
type GallerySetting = ExtractAtomValue<typeof gallerySettingAtom>

const filterAndSortPhotosBySetting = (setting: GallerySetting) =>
  filterAndSortPhotoList(
    data,
    setting.selectedTags,
    setting.selectedCameras,
    setting.selectedLenses,
    setting.selectedRatings,
    setting.sortOrder,
    setting.tagFilterMode,
  )

const resetGalleryFilters = (setting: GallerySetting): GallerySetting => ({
  ...setting,
  selectedTags: [],
  selectedCameras: [],
  selectedLenses: [],
  selectedRatings: null,
  tagFilterMode: 'union',
})

/** A single cached derivation shared by the gallery, viewer and URL synchronization. */
export const filteredPhotosAtom = atom((get) => filterAndSortPhotosBySetting(get(gallerySettingAtom)))

const viewerStateAtom = atom((get) => {
  const currentPhotoId = get(currentPhotoIdAtom)
  const currentIndex = currentPhotoId ? get(filteredPhotosAtom).findIndex((photo) => photo.id === currentPhotoId) : 0

  return {
    isOpen: get(openAtom),
    currentIndex,
    currentPhotoId,
    triggerElement: get(triggerElementAtom),
  }
})

interface OpenViewerOptions {
  element?: HTMLElement
  gallerySetting?: GallerySetting
  resetFiltersIfHidden?: boolean
}

const openViewerAtom = atom(null, (get, set, payload: { index: number; element?: HTMLElement }) => {
  const photos = get(filteredPhotosAtom)
  const photo = photos[payload.index]
  if (!photo) return false

  set(currentPhotoIdAtom, photo.id)
  set(triggerElementAtom, payload.element ?? null)
  if (!get(openAtom)) {
    lockBodyScroll()
  }
  set(openAtom, true)

  trackView(photo.id)
  return true
})

const openViewerByPhotoIdAtom = atom(null, (get, set, payload: { photoId: string; options?: OpenViewerOptions }) => {
  const options = payload.options ?? {}
  const currentGallerySetting = get(gallerySettingAtom)
  let targetGallerySetting = options.gallerySetting ?? currentGallerySetting
  let targetPhotos = options.gallerySetting
    ? filterAndSortPhotosBySetting(targetGallerySetting)
    : get(filteredPhotosAtom)
  let nextIndex = targetPhotos.findIndex((photo) => photo.id === payload.photoId)
  let shouldApplyGallerySetting = Boolean(options.gallerySetting)

  if (nextIndex === -1 && options.resetFiltersIfHidden) {
    targetGallerySetting = resetGalleryFilters(targetGallerySetting)
    targetPhotos = filterAndSortPhotosBySetting(targetGallerySetting)
    nextIndex = targetPhotos.findIndex((photo) => photo.id === payload.photoId)
    shouldApplyGallerySetting = true
  }

  if (nextIndex === -1) return false

  if (shouldApplyGallerySetting) {
    set(gallerySettingAtom, targetGallerySetting)
  }

  set(currentPhotoIdAtom, payload.photoId)
  set(triggerElementAtom, options.element ?? null)
  if (!get(openAtom)) {
    lockBodyScroll()
  }
  set(openAtom, true)

  trackView(payload.photoId)
  return true
})

const closeViewerAtom = atom(null, (get, set) => {
  if (get(openAtom)) {
    unlockBodyScroll()
  }
  set(openAtom, false)
  set(triggerElementAtom, null)
})

const goToIndexAtom = atom(null, (get, set, index: number) => {
  const photos = get(filteredPhotosAtom)
  const photo = photos[index]
  if (!photo) return false

  set(currentPhotoIdAtom, photo.id)
  trackView(photo.id)
  return true
})

export const getFilteredPhotos = () => jotaiStore.get(filteredPhotosAtom)

export const usePhotos = () => useAtomValue(filteredPhotosAtom)

export const useContextPhotos = () => {
  const photos = use(PhotosContext)
  if (!photos) {
    throw new Error('PhotosContext is not initialized')
  }
  return photos
}

/**
 * Write-only viewer actions. Gallery items can use this hook without subscribing
 * to viewer state, so opening or navigating the viewer does not re-render every card.
 */
export const useOpenPhotoViewer = () => {
  const openAtIndex = useSetAtom(openViewerAtom)
  const openByPhotoId = useSetAtom(openViewerByPhotoIdAtom)

  const openViewer = useCallback(
    (index: number, element?: HTMLElement) => openAtIndex({ index, element }),
    [openAtIndex],
  )
  const openViewerByPhotoId = useCallback(
    (photoId: string, options?: OpenViewerOptions) => openByPhotoId({ photoId, options }),
    [openByPhotoId],
  )

  return useMemo(
    () => ({
      openViewer,
      openViewerByPhotoId,
    }),
    [openViewer, openViewerByPhotoId],
  )
}

export const usePhotoViewerState = () => {
  const state = useAtomValue(viewerStateAtom)
  const closeViewer = useSetAtom(closeViewerAtom)

  useEffect(() => {
    if (state.isOpen && state.currentPhotoId && state.currentIndex === -1) {
      closeViewer()
    }
  }, [closeViewer, state.currentIndex, state.currentPhotoId, state.isOpen])

  return state
}

/** Viewer state plus navigation actions for the mounted fullscreen viewer. */
export const usePhotoViewer = () => {
  const state = usePhotoViewerState()
  const closeViewer = useSetAtom(closeViewerAtom)
  const goToIndex = useSetAtom(goToIndexAtom)

  return useMemo(
    () => ({
      ...state,
      closeViewer,
      goToIndex,
    }),
    [closeViewer, goToIndex, state],
  )
}
