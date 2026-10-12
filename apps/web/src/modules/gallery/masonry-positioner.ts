// @copy internal masonic positioner with per-item column spans
import type { Positioner, PositionerItem } from 'masonic'

import { clampMasonryColumnSpan } from './masonry-column-span'

export interface ColumnSpanPositionerItem extends PositionerItem {
  /** 该项占用的列数，超宽照片为 2 */
  columnSpan: number
}

export interface ColumnSpanPositioner extends Positioner {
  get: (index: number) => ColumnSpanPositionerItem | undefined
  all: () => ColumnSpanPositionerItem[]
}

interface ColumnSpanPositionerOptions {
  /** 网格的列数 */
  columnCount: number
  /** 单列的宽度 */
  columnWidth: number
  /** 列间距 */
  columnGutter: number
  /** 行间距 */
  rowGutter: number
  /** 返回该项希望占用的列数，未命中的项返回 1 */
  getColumnSpan: (index: number) => number
}

/**
 * Creates a cell positioner for the `useMasonry()` hook. It behaves like masonic's positioner
 * (each cell is inserted into the shortest column) except that cells may span several columns,
 * so very wide photos can fill two columns instead of being squeezed into one.
 *
 * @param options - The grid geometry and the per-item column span resolver.
 */
export const createColumnSpanPositioner = ({
  columnCount: requestedColumnCount,
  columnWidth,
  columnGutter,
  rowGutter,
  getColumnSpan,
}: ColumnSpanPositionerOptions): ColumnSpanPositioner => {
  const columnCount = Math.max(1, Math.floor(requestedColumnCount) || 1)
  // Track the height of each column. Cells are laid out in index order.
  const columnHeights = Array.from({ length: columnCount }, () => 0)
  // Heights are kept outside of the layout pass so the grid can be recomputed at any time.
  const measuredHeights: number[] = []
  const items: ColumnSpanPositionerItem[] = []
  let placedCount = 0

  const place = (index: number, height: number) => {
    const columnSpan = clampMasonryColumnSpan(getColumnSpan(index), columnCount)
    let column = 0
    let top = 0

    if (columnSpan === 1) {
      // Single column cells always fill the shortest column.
      for (let candidate = 1; candidate < columnCount; candidate++) {
        if (columnHeights[candidate] < columnHeights[column]) column = candidate
      }
      top = columnHeights[column]
    } else {
      let bestScore = Number.POSITIVE_INFINITY

      for (let candidate = 0; candidate + columnSpan <= columnCount; candidate++) {
        let lowest = columnHeights[candidate]
        let highest = columnHeights[candidate]

        for (let offset = 1; offset < columnSpan; offset++) {
          const candidateHeight = columnHeights[candidate + offset]
          lowest = Math.min(lowest, candidateHeight)
          highest = Math.max(highest, candidateHeight)
        }

        // Prefer the highest placement, but avoid leaving a large gap above the cell.
        const score = highest + (highest - lowest)
        if (score < bestScore) {
          bestScore = score
          column = candidate
          top = highest
        }
      }
    }

    const bottom = top + height + rowGutter
    for (let offset = 0; offset < columnSpan; offset++) {
      columnHeights[column + offset] = bottom
    }

    items[index] = {
      top,
      left: column * (columnWidth + columnGutter),
      height,
      column,
      columnSpan,
    }
    placedCount += 1
  }

  const relayout = () => {
    columnHeights.fill(0)
    items.length = 0
    placedCount = 0

    for (const [index, height] of measuredHeights.entries()) {
      if (height === undefined) continue

      place(index, height)
    }
  }

  return {
    columnCount,
    columnWidth,
    /** Sets the position for the cell at `index` based upon the cell's height */
    set: (index, height = 0) => {
      measuredHeights[index] = height
      relayout()
    },
    /** Updates cells based on their indexes and heights: `[index, height, index, height, ...]` */
    update: (updates) => {
      for (let index = 0; index < updates.length - 1; index += 2) {
        measuredHeights[updates[index]] = updates[index + 1]
      }
      relayout()
    },
    get: (index) => items[index],
    /** Renders all cells overlapping the viewport range defined. */
    range: (lo, hi, renderCallback) => {
      for (const [index, item] of items.entries()) {
        if (!item) continue
        if (item.top > hi || item.top + item.height < lo) continue

        renderCallback(index, item.left, item.top)
      }
    },
    size: () => placedCount,
    estimateHeight: (itemCount, defaultItemHeight) => {
      const tallestColumn = Math.max(0, Math.max(...columnHeights))
      return placedCount === itemCount
        ? tallestColumn
        : tallestColumn + Math.ceil((itemCount - placedCount) / columnCount) * defaultItemHeight
    },
    shortestColumn: () => (columnCount > 1 ? Math.min(...columnHeights) : columnHeights[0] || 0),
    all: () => items,
  }
}
