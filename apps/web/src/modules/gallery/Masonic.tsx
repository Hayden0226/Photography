// @copy internal masonic hooks
import { useScrollViewElement } from '@afilmory/ui/scroll-areas'
import { clearRequestTimeout, requestTimeout } from '@essentials/request-timeout'
import { useWindowSize } from '@react-hook/window-size'
import { throttle } from 'es-toolkit/function'
import { isEqual } from 'es-toolkit/predicate'
import type {
  ContainerPosition,
  MasonryProps as MasonryBaseProps,
  MasonryScrollerProps,
  Positioner,
  RenderComponentProps,
} from 'masonic'
import { createResizeObserver, useMasonry, useScrollToIndex } from 'masonic'
import { useForceUpdate } from 'motion/react'
import * as React from 'react'

import { clampMasonryColumnSpan } from './masonry-column-span'
import type { ColumnSpanPositioner } from './masonry-positioner'
import { createColumnSpanPositioner } from './masonry-positioner'
import { createIndexOrderedRange } from './masonry-range'

export interface MasonryRef {
  reposition: () => void
  scrollToIndex: (index: number) => void
  getPositioner: () => Positioner
}

export interface MasonryRenderProps<Item> extends RenderComponentProps<Item> {
  /** 该项占用的列数，超宽照片为 2 */
  columnSpan: number
}

export interface MasonryProps<Item> extends Omit<MasonryBaseProps<Item>, 'render'> {
  /** 返回每一项希望占用的列数，用于让超宽照片横跨多列 */
  getColumnSpan?: (index: number) => number
  render: (props: MasonryRenderProps<Item>) => React.ReactElement
}

/**
 * A "batteries included" masonry grid which includes all of the implementation details below. This component is the
 * easiest way to get off and running in your app, before switching to more advanced implementations, if necessary.
 * It will change its column count to fit its container's width and will decide how many rows to render based upon
 * the height of the browser `window`.
 *
 * @param props
 */
export const Masonry = <Item,>(props: MasonryProps<Item> & { ref?: React.Ref<MasonryRef> }) => {
  const [scrollTop, setScrollTop] = React.useState(0)
  const [isScrolling, setIsScrolling] = React.useState(false)
  const scrollElement = useScrollViewElement()

  const fps = props.scrollFps || 12
  React.useEffect(() => {
    if (!scrollElement) return

    const handleScroll = throttle(() => {
      setIsScrolling(true)
      setScrollTop(scrollElement.scrollTop)
    }, 1000 / fps)

    scrollElement.addEventListener('scroll', handleScroll, { passive: true })

    return () => {
      scrollElement.removeEventListener('scroll', handleScroll)
    }
  }, [fps, scrollElement])
  const didMount = React.useRef(0)
  React.useEffect(() => {
    if (didMount.current === 1) setIsScrolling(true)
    let didUnsubscribe = false
    const to = requestTimeout(
      () => {
        if (didUnsubscribe) return
        // This is here to prevent premature bail outs while maintaining high resolution
        // unsets. Without it there will always bee a lot of unnecessary DOM writes to style.
        setIsScrolling(false)
      },
      40 + 1000 / fps,
    )
    didMount.current = 1
    return () => {
      didUnsubscribe = true
      clearRequestTimeout(to)
    }
  }, [fps, scrollTop])

  const containerRef = React.useRef<null | HTMLElement>(null)
  const windowSize = useWindowSize({
    initialWidth: props.ssrWidth,
    initialHeight: props.ssrHeight,
  })
  const containerPos = useContainerPosition(containerRef, windowSize)

  const nextProps = Object.assign(
    {
      offset: containerPos.offset,
      width: containerPos.width || windowSize[0],
      height: containerPos.height || windowSize[1],
      containerRef,
    },
    props,
  ) as any

  const [positionIndex, setPositionIndex] = React.useState(0)

  // Workaround for https://github.com/jaredLunde/masonic/issues/12
  const itemCounter = React.useRef<number>(props.items.length)

  let shrunk = false

  if (props.items.length !== itemCounter.current) {
    if (props.items.length < itemCounter.current) shrunk = true

    itemCounter.current = props.items.length
  }

  nextProps.positioner = useColumnSpanPositioner(nextProps, [shrunk ? Math.random() + positionIndex : positionIndex])

  nextProps.resizeObserver = useResizeObserver(nextProps.positioner)
  nextProps.scrollTop = scrollTop
  nextProps.isScrolling = isScrolling
  nextProps.height = windowSize[1]

  const scrollToIndex = useScrollToIndex(nextProps.positioner, {
    height: nextProps.height,
    offset: containerPos.offset,
    element: scrollElement,
    align: typeof props.scrollToIndex === 'object' ? props.scrollToIndex.align : void 0,
  })
  const index =
    props.scrollToIndex && (typeof props.scrollToIndex === 'number' ? props.scrollToIndex : props.scrollToIndex.index)

  React.useEffect(() => {
    if (index !== void 0) scrollToIndex(index)
  }, [index, scrollToIndex])

  React.useImperativeHandle(
    props.ref,
    () => ({
      reposition: () => {
        setPositionIndex((i) => i + 1)
      },
      scrollToIndex,
      getPositioner: () => nextProps.positioner,
    }),
    [nextProps.positioner, scrollToIndex],
  )

  return <MasonryScroller {...nextProps} />
}

function MasonryScroller<Item>(
  props: MasonryScrollerProps<Item> & {
    scrollTop: number
    isScrolling: boolean
    getColumnSpan?: (index: number) => number
  },
) {
  const positioner = React.useMemo<Positioner>(
    () => ({
      ...props.positioner,
      range: createIndexOrderedRange(props.positioner.range),
    }),
    [props.positioner],
  )
  const renderItem = useColumnSpanRender(props.render, props.getColumnSpan, positioner.columnCount)

  // We put this in its own layer because it's the thing that will trigger the most updates
  // and we don't want to slower ourselves by cycling through all the functions, objects, and effects
  // of other hooks
  // const { scrollTop, isScrolling } = useScroller(props.offset, props.scrollFps)
  // This is an update-heavy phase and while we could just Object.assign here,
  // it is way faster to inline and there's a relatively low hit to he bundle
  // size.

  return useMasonry<Item>({
    scrollTop: props.scrollTop,
    isScrolling: props.isScrolling,
    positioner,
    resizeObserver: props.resizeObserver,
    items: props.items,
    onRender: props.onRender,
    as: props.as,
    id: props.id,
    className: props.className,
    style: props.style,
    role: props.role,
    tabIndex: props.tabIndex,
    containerRef: props.containerRef,
    itemAs: props.itemAs,
    itemStyle: props.itemStyle,
    itemHeightEstimate: props.itemHeightEstimate,
    itemKey: props.itemKey,
    overscanBy: props.overscanBy,
    height: props.height,
    render: renderItem,
  })
}

/**
 * Resolves the column span of every rendered cell. The returned component keeps a stable identity
 * so cells are reused when the positioner changes, while the latest `render` and span resolver are
 * always read from the current props.
 */
function useColumnSpanRender<Item>(
  render: React.ComponentType<RenderComponentProps<Item>>,
  getColumnSpan: ((index: number) => number) | undefined,
  columnCount: number,
): React.ComponentType<RenderComponentProps<Item>> {
  const latest = React.useRef({ render, getColumnSpan, columnCount })
  latest.current = { render, getColumnSpan, columnCount }

  return React.useRef((itemProps: RenderComponentProps<Item>) => {
    const { render: RenderItem, getColumnSpan: resolveColumnSpan, columnCount: columns } = latest.current
    const columnSpan = resolveColumnSpan ? clampMasonryColumnSpan(resolveColumnSpan(itemProps.index), columns) : 1
    const RenderItemWithColumnSpan = RenderItem as React.ComponentType<MasonryRenderProps<Item>>

    return <RenderItemWithColumnSpan {...itemProps} columnSpan={columnSpan} />
  }).current
}

interface UseColumnSpanPositionerOptions {
  width: number
  columnWidth?: number
  columnGutter?: number
  rowGutter?: number
  columnCount?: number
  maxColumnCount?: number
  maxColumnWidth?: number
  getColumnSpan?: (index: number) => number
}

/**
 * @copy internal masonic usePositioner hook, wired to the column span aware positioner. It creates
 * the grid cell positioner and cache required by `useMasonry()`.
 *
 * @param options - Properties that determine the number of columns in the grid, as well as their widths.
 * @param deps - This hook will create a new positioner, clearing all existing cached positions,
 *  whenever the dependencies in this list change.
 */
function useColumnSpanPositioner(
  {
    width,
    columnWidth = 200,
    columnGutter = 0,
    rowGutter,
    columnCount,
    maxColumnCount,
    maxColumnWidth,
    getColumnSpan,
  }: UseColumnSpanPositionerOptions,
  deps: React.DependencyList = [],
): ColumnSpanPositioner {
  const initPositioner = (): ColumnSpanPositioner => {
    const [computedColumnWidth, computedColumnCount] = getColumns(
      width,
      columnWidth,
      columnGutter,
      columnCount,
      maxColumnCount,
      maxColumnWidth,
    )

    return createColumnSpanPositioner({
      columnCount: computedColumnCount,
      columnWidth: computedColumnWidth,
      columnGutter,
      rowGutter: rowGutter ?? columnGutter,
      getColumnSpan: getColumnSpan ?? (() => 1),
    })
  }

  const positionerRef = React.useRef<ColumnSpanPositioner | undefined>(undefined)
  const prevDeps = React.useRef(deps)
  const opts = [width, columnWidth, columnGutter, rowGutter, columnCount, maxColumnCount, maxColumnWidth, getColumnSpan]
  const prevOpts = React.useRef(opts)
  const optsChanged = !opts.every((item, index) => prevOpts.current[index] === item)
  const depsChanged = !deps.every((item, index) => prevDeps.current[index] === item)
  let positioner = positionerRef.current ?? initPositioner()

  // Create a new positioner when the dependencies or sizes change
  if (optsChanged || depsChanged) {
    const previousPositioner = positioner
    positioner = initPositioner()
    prevDeps.current = deps
    prevOpts.current = opts

    if (optsChanged) {
      // Keep the already measured heights so the grid doesn't jump back to its estimated layout
      const previousItems = previousPositioner.all()
      for (const [index, previousItem] of previousItems.entries()) {
        if (!previousItem) continue

        positioner.set(index, previousItem.height)
      }
    }
  }

  positionerRef.current = positioner

  return positioner
}

/**
 * @copy internal masonic getColumns utility. It resolves the column count from the container width
 * and the minimum column width, then fills the remaining width evenly.
 */
function getColumns(
  width: number,
  minimumWidth: number,
  gutter: number,
  columnCount?: number,
  maxColumnCount?: number,
  maxColumnWidth?: number,
): [number, number] {
  const resolvedColumnCount =
    columnCount ||
    Math.min(Math.floor((width + gutter) / (minimumWidth + gutter)), maxColumnCount || Number.POSITIVE_INFINITY) ||
    1
  let resolvedColumnWidth = Math.floor((width - gutter * (resolvedColumnCount - 1)) / resolvedColumnCount)

  if (maxColumnWidth !== undefined && resolvedColumnWidth > maxColumnWidth) {
    resolvedColumnWidth = maxColumnWidth
  }

  return [resolvedColumnWidth, resolvedColumnCount]
}

function useContainerPosition(
  elementRef: React.MutableRefObject<HTMLElement | null>,
  deps: React.DependencyList = [],
): ContainerPosition & {
  height: number
} {
  const [containerPosition, setContainerPosition] = React.useState<
    ContainerPosition & {
      height: number
    }
  >({
    offset: 0,
    width: 0,
    height: 0,
  })

  React.useLayoutEffect(() => {
    const { current } = elementRef
    if (current !== null) {
      let offset = 0
      let el = current

      do {
        offset += el.offsetTop || 0
        el = el.offsetParent as HTMLElement
      } while (el)

      if (offset !== containerPosition.offset || current.offsetWidth !== containerPosition.width) {
        setContainerPosition({
          offset,
          width: current.offsetWidth,
          height: current.offsetHeight,
        })
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)

  React.useEffect(() => {
    if (!elementRef.current) return

    const resizeObserver = new ResizeObserver(() => {
      setContainerPosition((prev) => {
        const next = {
          ...prev,
          width: elementRef.current?.offsetWidth || 0,
          height: elementRef.current?.offsetHeight || 0,
        }
        if (isEqual(next, prev)) return prev
        return next
      })
    })
    resizeObserver.observe(elementRef.current)
    return () => {
      resizeObserver.disconnect()
    }
  }, [elementRef])

  return containerPosition
}

function useResizeObserver(positioner: Positioner) {
  const [forceUpdate] = useForceUpdate()
  const resizeObserver = React.useMemo(
    () => createResizeObserver(positioner, throttle(forceUpdate, 1000 / 12)),
    [forceUpdate, positioner],
  )
  // Cleans up the resize observers when they change or the
  // component unmounts
  React.useEffect(() => () => resizeObserver.disconnect(), [resizeObserver])
  return resizeObserver
}
