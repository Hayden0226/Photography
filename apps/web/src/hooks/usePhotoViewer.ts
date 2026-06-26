import { photoLoader } from '@afilmory/data'
import type { ExtractAtomValue } from 'jotai'
import { atom, useAtom, useAtomValue, useSetAtom } from 'jotai'
import { use, useCallback, useMemo } from 'react'

import { gallerySettingAtom } from '~/atoms/app'
import { lockBodyScroll, unlockBodyScroll } from '~/lib/body-scroll-lock'
import { jotaiStore } from '~/lib/jotai'
import { filterAndSortPhotoList } from '~/lib/photo-filter'
import { trackView } from '~/lib/tracker'
import { PhotosContext } from '~/providers/photos-context'

const openAtom = atom(false)
const currentIndexAtom = atom(0)
const triggerElementAtom = atom<HTMLElement | null>(null)
const data = photoLoader.getPhotos()
type GallerySetting = ExtractAtomValue<typeof gallerySettingAtom>

// 抽取照片筛选和排序逻辑为独立函数
const filterAndSortPhotos = (
  selectedTags: string[],
  selectedCameras: string[],
  selectedLenses: string[],
  selectedRatings: number | null,
  sortOrder: 'asc' | 'desc',
  tagFilterMode: 'union' | 'intersection' = 'union',
) => {
  return filterAndSortPhotoList(
    data,
    selectedTags,
    selectedCameras,
    selectedLenses,
    selectedRatings,
    sortOrder,
    tagFilterMode,
  )
}

const filterAndSortPhotosBySetting = (setting: GallerySetting) =>
  filterAndSortPhotos(
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

// 提供一个 getter 函数供非 UI 组件使用
export const getFilteredPhotos = () => {
  // 直接从 jotaiStore 中读取当前状态
  const currentGallerySetting = jotaiStore.get(gallerySettingAtom)
  return filterAndSortPhotosBySetting(currentGallerySetting)
}

export const usePhotos = () => {
  const { sortOrder, selectedTags, selectedCameras, selectedLenses, selectedRatings, tagFilterMode } =
    useAtomValue(gallerySettingAtom)

  const masonryItems = useMemo(() => {
    return filterAndSortPhotos(selectedTags, selectedCameras, selectedLenses, selectedRatings, sortOrder, tagFilterMode)
  }, [sortOrder, selectedTags, selectedCameras, selectedLenses, selectedRatings, tagFilterMode])

  return masonryItems
}

export const useContextPhotos = () => {
  const photos = use(PhotosContext)
  if (!photos) {
    throw new Error('PhotosContext is not initialized')
  }
  return photos
}

export const usePhotoViewer = () => {
  const photos = usePhotos()
  const [isOpen, setIsOpen] = useAtom(openAtom)
  const [currentIndex, setCurrentIndex] = useAtom(currentIndexAtom)
  const [triggerElement, setTriggerElement] = useAtom(triggerElementAtom)
  const setGallerySetting = useSetAtom(gallerySettingAtom)

  const openViewer = useCallback(
    (index: number, element?: HTMLElement) => {
      setCurrentIndex(index)
      setTriggerElement(element || null)
      setIsOpen(true)
      if (!isOpen) {
        lockBodyScroll()
      }

      trackView(photos[index]?.id)
    },
    [isOpen, photos, setCurrentIndex, setIsOpen, setTriggerElement],
  )

  const closeViewer = useCallback(() => {
    setIsOpen(false)
    setTriggerElement(null)
    if (isOpen) {
      unlockBodyScroll()
    }
  }, [isOpen, setIsOpen, setTriggerElement])

  const openViewerByPhotoId = useCallback(
    (
      photoId: string,
      options: {
        element?: HTMLElement
        gallerySetting?: GallerySetting
        resetFiltersIfHidden?: boolean
      } = {},
    ) => {
      const currentGallerySetting = jotaiStore.get(gallerySettingAtom)
      let targetGallerySetting = options.gallerySetting ?? currentGallerySetting
      let targetPhotos = filterAndSortPhotosBySetting(targetGallerySetting)
      let nextIndex = targetPhotos.findIndex((photo) => photo.id === photoId)
      let shouldApplyGallerySetting = Boolean(options.gallerySetting)

      if (nextIndex === -1 && options.resetFiltersIfHidden) {
        targetGallerySetting = resetGalleryFilters(targetGallerySetting)
        targetPhotos = filterAndSortPhotosBySetting(targetGallerySetting)
        nextIndex = targetPhotos.findIndex((photo) => photo.id === photoId)
        shouldApplyGallerySetting = true
      }

      if (nextIndex === -1) {
        return false
      }

      if (shouldApplyGallerySetting) {
        setGallerySetting(targetGallerySetting)
      }

      setCurrentIndex(nextIndex)
      setTriggerElement(options.element || null)
      setIsOpen(true)
      if (!isOpen) {
        lockBodyScroll()
      }

      trackView(photoId)
      return true
    },
    [isOpen, setCurrentIndex, setGallerySetting, setIsOpen, setTriggerElement],
  )

  const goToIndex = useCallback(
    (index: number) => {
      if (index >= 0 && index < photos.length) {
        setCurrentIndex(index)
        trackView(photos[index].id)
      }
    },
    [photos, setCurrentIndex],
  )

  return {
    isOpen,
    currentIndex,
    triggerElement,
    openViewer,
    openViewerByPhotoId,
    closeViewer,

    goToIndex,
  }
}
