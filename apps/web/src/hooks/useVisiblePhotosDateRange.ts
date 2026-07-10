import { useCallback, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import type { PhotoManifest } from '~/types/photo'

interface DateRange {
  startDate: Date | null
  endDate: Date | null
  formattedRange: string
}

type DateRangeBounds = Omit<DateRange, 'formattedRange'>

interface VisibleRange {
  start: number
  end: number
}

const EMPTY_DATE_RANGE: DateRangeBounds = {
  startDate: null,
  endDate: null,
}

const isSameDateRange = (previous: DateRangeBounds, next: DateRangeBounds) => {
  return (
    previous.startDate?.getTime() === next.startDate?.getTime() &&
    previous.endDate?.getTime() === next.endDate?.getTime()
  )
}

/**
 * Hook to calculate the date range of currently visible photos in the viewport
 * Works with masonry onRender callback
 */
export const useVisiblePhotosDateRange = (_photos: PhotoManifest[]) => {
  const [dateRangeBounds, setDateRangeBounds] = useState<DateRangeBounds>(EMPTY_DATE_RANGE)

  const currentRange = useRef<VisibleRange>({ start: 0, end: 0 })

  const updateDateRange = useCallback((nextRange: DateRangeBounds) => {
    setDateRangeBounds((previousRange) => (isSameDateRange(previousRange, nextRange) ? previousRange : nextRange))
  }, [])

  const getPhotoDate = useCallback((photo: PhotoManifest): Date => {
    if (photo.sortTime) {
      const date = new Date(photo.sortTime)
      if (!Number.isNaN(date.getTime())) {
        return date
      }
    }

    // 优先使用 EXIF 中的拍摄时间
    if (photo.exif?.DateTimeOriginal) {
      const dateStr = photo.exif.DateTimeOriginal as unknown as string
      // EXIF 日期格式通常是 "YYYY:MM:DD HH:mm:ss"
      const formattedDateStr = dateStr.replace(/^(\d{4}):(\d{2}):(\d{2})/, '$1-$2-$3')
      const date = new Date(formattedDateStr)
      if (!Number.isNaN(date.getTime())) {
        return date
      }
    }

    if (photo.dateTaken) {
      const date = new Date(photo.dateTaken)
      if (!Number.isNaN(date.getTime())) {
        return date
      }
    }

    // 回退到 lastModified
    return new Date(photo.lastModified)
  }, [])
  const { i18n } = useTranslation()
  const locale = i18n.resolvedLanguage ?? i18n.language

  const formatDateRange = useCallback(
    (startDate: Date, endDate: Date): string => {
      const formatter = new Intl.DateTimeFormat(locale, {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      })

      if (startDate.toDateString() === endDate.toDateString()) {
        return formatter.format(startDate)
      }

      return `${formatter.format(startDate)} – ${formatter.format(endDate)}`
    },
    [locale],
  )

  const dateRange = useMemo<DateRange>(() => {
    const { startDate, endDate } = dateRangeBounds
    return {
      startDate,
      endDate,
      formattedRange: startDate && endDate ? formatDateRange(startDate, endDate) : '',
    }
  }, [dateRangeBounds, formatDateRange])

  // 计算当前可视范围内照片的日期范围
  const calculateDateRange = useCallback(
    (startIndex: number, endIndex: number, items: any[]) => {
      if (!items || items.length === 0) {
        updateDateRange(EMPTY_DATE_RANGE)
        return
      }

      // 过滤出照片类型的items (排除header等)
      const visiblePhotos = items
        .slice(startIndex, endIndex + 1)
        .filter((item): item is PhotoManifest => item && typeof item === 'object' && 'id' in item)

      if (visiblePhotos.length === 0) {
        updateDateRange(EMPTY_DATE_RANGE)
        return
      }

      // 计算日期范围
      const dates = visiblePhotos.map((photo) => getPhotoDate(photo)).sort((a, b) => a.getTime() - b.getTime())

      const startDate = dates[0]
      const endDate = dates.at(-1)

      if (!startDate || !endDate) {
        updateDateRange(EMPTY_DATE_RANGE)
        return
      }

      updateDateRange({
        startDate,
        endDate,
      })

      // 更新当前范围
      currentRange.current = { start: startIndex, end: endIndex }
    },
    [getPhotoDate, updateDateRange],
  )

  // 用于传递给 masonry 的 onRender 回调
  const handleRender = useCallback(
    (startIndex: number, stopIndex: number, items: any[]) => {
      calculateDateRange(startIndex, stopIndex, items)
    },
    [calculateDateRange],
  )

  return {
    dateRange,
    handleRender,
    currentRange: currentRange.current,
  }
}
