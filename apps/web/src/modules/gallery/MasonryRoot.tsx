import { useScrollViewElement } from '@afilmory/ui/scroll-areas'
import { clsxm, Spring } from '@afilmory/utils'
import { useAtomValue, useSetAtom } from 'jotai'
import { AnimatePresence, m } from 'motion/react'
import type { KeyboardEvent, RefObject } from 'react'
import { createContext, memo, use, useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { gallerySettingAtom } from '~/atoms/app'
import { DateRangeIndicator } from '~/components/ui/date-range-indicator'
import { useMobile } from '~/hooks/useMobile'
import { useContextPhotos } from '~/hooks/usePhotoViewer'
import { useUpcomingThumbnailPrefetch } from '~/hooks/useUpcomingThumbnailPrefetch'
import { useVisiblePhotosDateRange } from '~/hooks/useVisiblePhotosDateRange'
import type { PhotoManifest } from '~/types/photo'

import { ActionGroup } from './ActionGroup'
import { handleGalleryArrowNavigation } from './gallery-keyboard-navigation'
import type { MasonryRef } from './Masonic'
import { Masonry } from './Masonic'
import type { MasonryNavigationDirection } from './masonry-keyboard-navigation'
import { findNextMasonryItemIndex } from './masonry-keyboard-navigation'
import { MasonryHeaderMasonryItem } from './MasonryHeaderMasonryItem'
import { MasonryPhotoItem } from './MasonryPhotoItem'

class MasonryHeaderItem {
  static default = new MasonryHeaderItem()

  readonly kind = 'masonry-header'
}

type MasonryItemType = PhotoManifest | MasonryHeaderItem

const FIRST_SCREEN_ITEMS_COUNT = 30
const PHOTO_KEYBOARD_DIRECTIONS = {
  ArrowLeft: 'left',
  ArrowRight: 'right',
  ArrowUp: 'up',
  ArrowDown: 'down',
} as const satisfies Record<string, MasonryNavigationDirection>

interface MasonryKeyboardNavigationContextValue {
  tabStopPhotoId: string | null
  onPhotoFocus: (photoId: string) => void
  onPhotoKeyDown: (event: KeyboardEvent<HTMLButtonElement>, index: number) => void
}

const MasonryKeyboardNavigationContext = createContext<MasonryKeyboardNavigationContextValue | null>(null)

const COLUMN_WIDTH_CONFIG = {
  auto: {
    desktop: 250,
    maxColumns: 8,
  },
}

export const MasonryRoot = () => {
  const { columns } = useAtomValue(gallerySettingAtom)
  const setGallerySetting = useSetAtom(gallerySettingAtom)
  const hasAnimatedRef = useRef(false)
  const [showFloatingActions, setShowFloatingActions] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const containerWidth = useElementWidth(containerRef)

  const photos = useContextPhotos()
  const masonryRef = useRef<MasonryRef>(null)
  const focusRequestFrameRef = useRef(0)
  const [tabStopPhotoId, setTabStopPhotoId] = useState<string | null>(null)

  const { dateRange, handleRender } = useVisiblePhotosDateRange(photos)
  const scrollElement = useScrollViewElement()

  const handleAnimationComplete = useCallback(() => {
    hasAnimatedRef.current = true
  }, [])
  const isMobile = useMobile()

  // 移动端默认三列：把 auto 归一化为 3，让列数面板显示"三列"而非"自动"
  useEffect(() => {
    if (isMobile && columns === 'auto') {
      setGallerySetting((prev) => ({ ...prev, columns: 3 }))
    }
  }, [isMobile, columns, setGallerySetting])

  const masonryItems = useMemo(() => (isMobile ? photos : [MasonryHeaderItem.default, ...photos]), [photos, isMobile])
  const resolvedTabStopPhotoId = useMemo(() => {
    if (tabStopPhotoId && photos.some((photo) => photo.id === tabStopPhotoId)) return tabStopPhotoId
    return photos[0]?.id ?? null
  }, [photos, tabStopPhotoId])

  const focusPhotoAtIndex = useCallback(
    (targetIndex: number) => {
      const target = masonryItems[targetIndex]
      if (!target || target instanceof MasonryHeaderItem) return

      window.cancelAnimationFrame(focusRequestFrameRef.current)
      setTabStopPhotoId(target.id)

      let attempts = 0
      let didRequestScroll = false
      const focusWhenRendered = () => {
        const photoButton = Array.from(
          containerRef.current?.querySelectorAll<HTMLButtonElement>('[data-photo-id]') ?? [],
        ).find((element) => element.dataset.photoId === target.id)

        if (photoButton) {
          photoButton.focus({ preventScroll: true })
          photoButton.scrollIntoView({ block: 'nearest', inline: 'nearest' })
          focusRequestFrameRef.current = 0
          return
        }

        if (!didRequestScroll) {
          didRequestScroll = true
          masonryRef.current?.scrollToIndex(targetIndex)
        }

        attempts++
        if (attempts < 120) focusRequestFrameRef.current = window.requestAnimationFrame(focusWhenRendered)
      }

      focusWhenRendered()
    },
    [masonryItems],
  )

  useEffect(() => {
    const firstPhotoIndex = masonryItems.findIndex((item) => !(item instanceof MasonryHeaderItem))

    const handleGlobalKeyDown = (event: globalThis.KeyboardEvent) => {
      const container = containerRef.current
      if (!container) return

      handleGalleryArrowNavigation({
        event,
        container,
        focusFirstPhoto: () => {
          if (firstPhotoIndex === -1) return false
          focusPhotoAtIndex(firstPhotoIndex)
          return true
        },
      })
    }

    window.addEventListener('keydown', handleGlobalKeyDown)
    return () => window.removeEventListener('keydown', handleGlobalKeyDown)
  }, [focusPhotoAtIndex, masonryItems])

  const handlePhotoKeyDown = useCallback(
    (event: KeyboardEvent<HTMLButtonElement>, currentIndex: number) => {
      if (event.altKey || event.ctrlKey || event.metaKey) return

      const direction = PHOTO_KEYBOARD_DIRECTIONS[event.key as keyof typeof PHOTO_KEYBOARD_DIRECTIONS]
      if (!direction) return

      const positioner = masonryRef.current?.getPositioner()
      if (!positioner) return

      const targetIndex = findNextMasonryItemIndex({
        currentIndex,
        direction,
        positioner,
        isNavigable: (index) => {
          const item = masonryItems[index]
          return !!item && !(item instanceof MasonryHeaderItem)
        },
      })
      if (targetIndex === null) return

      event.preventDefault()
      focusPhotoAtIndex(targetIndex)
    },
    [focusPhotoAtIndex, masonryItems],
  )

  useEffect(
    () => () => {
      window.cancelAnimationFrame(focusRequestFrameRef.current)
    },
    [],
  )

  const keyboardNavigationContext = useMemo<MasonryKeyboardNavigationContextValue>(
    () => ({
      tabStopPhotoId: resolvedTabStopPhotoId,
      onPhotoFocus: setTabStopPhotoId,
      onPhotoKeyDown: handlePhotoKeyDown,
    }),
    [handlePhotoKeyDown, resolvedTabStopPhotoId],
  )

  // 动态计算列宽
  const columnWidth = useMemo(() => {
    const { auto } = COLUMN_WIDTH_CONFIG
    const gutter = 4 // 列间距
    // 容器尚未测量时回退到视口宽度，保证初始渲染列数正确
    const measuredWidth = containerWidth || (typeof window === 'undefined' ? 0 : window.innerWidth)
    const availableWidth = measuredWidth - (isMobile ? 8 : 32) // 移动端和桌面端的 padding 不同

    if (columns === 'auto') {
      if (isMobile) {
        // 移动端默认固定三列，保证一打开就是三列效果
        return Math.max((availableWidth - 2 * gutter) / 3, 1)
      }

      const colCount = Math.floor((availableWidth + gutter) / (auto.desktop + gutter))

      if (colCount > auto.maxColumns) {
        return (availableWidth - (auto.maxColumns - 1) * gutter) / auto.maxColumns
      }

      return auto.desktop
    }

    // 自定义列数模式：按选择的列数反推列宽，不做上下限压缩
    return Math.max((availableWidth - (columns - 1) * gutter) / columns, 1)
  }, [isMobile, columns, containerWidth])
  const prefetchUpcomingThumbnails = useUpcomingThumbnailPrefetch(columnWidth)

  // 监听滚动，控制浮动组件的显示
  useEffect(() => {
    if (!scrollElement) return

    const handleScroll = () => {
      const { scrollTop } = scrollElement
      setShowFloatingActions(scrollTop > 500)
    }

    scrollElement.addEventListener('scroll', handleScroll, { passive: true })
    return () => {
      scrollElement.removeEventListener('scroll', handleScroll)
    }
  }, [scrollElement])

  return (
    <>
      {/* 桌面端：左右分布 */}
      {!isMobile && (
        <>
          <DateRangeIndicator
            dateRange={dateRange.formattedRange}
            isVisible={showFloatingActions && !!dateRange.formattedRange}
          />
          <FloatingActionBar showFloatingActions={showFloatingActions} />
        </>
      )}

      {/* 移动端：垂直堆叠 */}
      {isMobile && !!dateRange.formattedRange && (
        <div className="fixed top-0 right-0 left-0 z-50">
          <DateRangeIndicator
            dateRange={dateRange.formattedRange}
            isVisible={showFloatingActions && !!dateRange.formattedRange}
            className="relative top-0 left-0"
          />
        </div>
      )}

      <div ref={containerRef} className="p-1 **:select-none! lg:px-0 lg:pb-0">
        {isMobile && <MasonryHeaderMasonryItem className="mb-1" />}
        <MasonryKeyboardNavigationContext value={keyboardNavigationContext}>
          <Masonry<MasonryItemType>
            ref={masonryRef}
            items={masonryItems}
            tabIndex={-1}
            render={useCallback(
              (props) => (
                <MasonryItem
                  {...props}
                  hasAnimated={hasAnimatedRef.current}
                  onAnimationComplete={handleAnimationComplete}
                />
              ),
              [handleAnimationComplete],
            )}
            onRender={useCallback(
              (startIndex, stopIndex, items) => {
                handleRender(startIndex, stopIndex, items)
                prefetchUpcomingThumbnails(stopIndex, items)
              },
              [handleRender, prefetchUpcomingThumbnails],
            )}
            columnWidth={columnWidth}
            columnGutter={4}
            rowGutter={4}
            itemHeightEstimate={400}
            itemKey={useCallback((data, _index) => {
              if (data instanceof MasonryHeaderItem) {
                return 'header'
              }
              return (data as PhotoManifest).id
            }, [])}
          />
        </MasonryKeyboardNavigationContext>
      </div>

      <footer className="pointer-events-auto flex items-center justify-center gap-1 px-4 py-6 text-xs text-white/40">
        <span>© {new Date().getFullYear()} Hayden</span>
        <span aria-hidden="true">·</span>
        <span>Built with 📷</span>
        <span aria-hidden="true">·</span>
        <a
          href="https://github.com/Hayden0226/Photography"
          target="_blank"
          rel="noreferrer"
          className="transition-colors hover:text-white/70"
        >
          GitHub
        </a>
      </footer>
    </>
  )
}

export const MasonryItem = memo(
  ({
    data,
    width,
    index,

    hasAnimated,
    onAnimationComplete,
  }: {
    data: MasonryItemType
    width: number
    index: number
    hasAnimated: boolean
    onAnimationComplete: () => void
  }) => {
    const keyboardNavigation = use(MasonryKeyboardNavigationContext)
    if (!keyboardNavigation) throw new Error('Masonry keyboard navigation context is missing')

    // 为每个 item 生成唯一的 key 用于追踪
    const itemKey = useMemo(() => {
      if (data instanceof MasonryHeaderItem) {
        return 'header'
      }
      return (data as PhotoManifest).id
    }, [data])

    // 只对第一屏的 items 做动画，且只在首次加载时
    const shouldAnimate = !hasAnimated && index < FIRST_SCREEN_ITEMS_COUNT

    // 计算动画延迟
    const delay = shouldAnimate ? (data instanceof MasonryHeaderItem ? 0 : Math.min(index * 0.05, 0.3)) : 0

    // Framer Motion 动画变体
    const itemVariants = {
      hidden: {
        opacity: 0,
        y: 30,
        scale: 0.95,
        filter: 'blur(4px)',
      },
      visible: {
        opacity: 1,
        y: 0,
        scale: 1,
        filter: 'blur(0px)',
        transition: {
          ...Spring.presets.smooth,
          delay,
        },
      },
    }

    if (data instanceof MasonryHeaderItem) {
      return <MasonryHeaderMasonryItem style={{ width }} key={itemKey} />
    } else {
      return (
        <m.div
          key={itemKey}
          variants={shouldAnimate ? itemVariants : undefined}
          initial={shouldAnimate ? 'hidden' : 'visible'}
          animate="visible"
          onAnimationComplete={shouldAnimate ? onAnimationComplete : undefined}
        >
          <MasonryPhotoItem
            data={data as PhotoManifest}
            width={width}
            index={index}
            tabIndex={(data as PhotoManifest).id === keyboardNavigation.tabStopPhotoId ? 0 : -1}
            onFocus={keyboardNavigation.onPhotoFocus}
            onKeyDown={keyboardNavigation.onPhotoKeyDown}
          />
        </m.div>
      )
    }
  },
)

const FloatingActionBar = ({ showFloatingActions }: { showFloatingActions: boolean }) => {
  const isMobile = useMobile()

  const variants = isMobile
    ? {
        initial: {
          opacity: 0,
        },
        animate: { opacity: 1 },
      }
    : {
        initial: {
          opacity: 0,
          x: 20,
          y: 0,
          scale: 0.95,
        },
        animate: { opacity: 1, x: 0, y: 0, scale: 1 },
      }
  return (
    <AnimatePresence>
      {showFloatingActions && (
        <m.div
          variants={variants}
          initial="initial"
          animate="animate"
          exit="initial"
          transition={Spring.presets.snappy}
          className={clsxm(
            'border-material-opaque rounded-xl border bg-black/60 p-3 shadow-2xl backdrop-blur-[70px]',
            isMobile
              ? 'rounded-t-none rounded-br-none -translate-y-px'
              : 'fixed top-4 right-4 z-50 lg:top-6 lg:right-6',
          )}
        >
          <ActionGroup />
        </m.div>
      )}
    </AnimatePresence>
  )
}

const useElementWidth = (ref: RefObject<HTMLElement | null>) => {
  const [width, setWidth] = useState(0)

  useEffect(() => {
    const element = ref.current
    if (!element) return

    const updateWidth = () => {
      setWidth(element.clientWidth)
    }

    updateWidth()

    if (typeof ResizeObserver === 'undefined') {
      return
    }

    const resizeObserver = new ResizeObserver(updateWidth)
    resizeObserver.observe(element)

    return () => {
      resizeObserver.disconnect()
    }
  }, [ref])

  return width
}
