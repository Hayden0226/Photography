import { photoLoader } from '@afilmory/data'
import { atom, useAtom, useAtomValue } from 'jotai'
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

// 提供一个 getter 函数供非 UI 组件使用
export const getFilteredPhotos = () => {
  // 直接从 jotaiStore 中读取当前状态
  const currentGallerySetting = jotaiStore.get(gallerySettingAtom)
  return filterAndSortPhotos(
    currentGallerySetting.selectedTags,
    currentGallerySetting.selectedCameras,
    currentGallerySetting.selectedLenses,
    currentGallerySetting.selectedRatings,
    currentGallerySetting.sortOrder,
    currentGallerySetting.tagFilterMode,
  )
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
    closeViewer,

    goToIndex,
  }
}
