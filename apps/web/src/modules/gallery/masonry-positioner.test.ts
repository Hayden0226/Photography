import { describe, expect, it } from 'vitest'

import { createColumnSpanPositioner } from './masonry-positioner'

const createPositioner = ({
  columnCount = 3,
  getColumnSpan = () => 1,
}: { columnCount?: number; getColumnSpan?: (index: number) => number } = {}) =>
  createColumnSpanPositioner({
    columnCount,
    columnWidth: 100,
    columnGutter: 4,
    rowGutter: 4,
    getColumnSpan,
  })

describe('createColumnSpanPositioner', () => {
  it('fills the shortest column with single column cells', () => {
    const positioner = createPositioner()

    positioner.set(0, 100)
    positioner.set(1, 200)
    positioner.set(2, 300)
    positioner.set(3, 50)

    expect(positioner.get(0)).toEqual({ top: 0, left: 0, height: 100, column: 0, columnSpan: 1 })
    expect(positioner.get(1)).toEqual({ top: 0, left: 104, height: 200, column: 1, columnSpan: 1 })
    expect(positioner.get(2)).toEqual({ top: 0, left: 208, height: 300, column: 2, columnSpan: 1 })
    // 三列高度分别为 104 / 204 / 304，下一格回到最矮的第一列
    expect(positioner.get(3)).toEqual({ top: 104, left: 0, height: 50, column: 0, columnSpan: 1 })
  })

  it('spans the requested columns and reserves them for later cells', () => {
    const positioner = createPositioner({ getColumnSpan: (index) => (index === 1 ? 2 : 1) })

    positioner.set(0, 100)
    positioner.set(1, 60)
    positioner.set(2, 20)

    // 第一列已经有 104 高，跨列照片落到还空着的第二、三列
    expect(positioner.get(1)).toEqual({ top: 0, left: 104, height: 60, column: 1, columnSpan: 2 })
    // 第二、三列高度都是 64，下一格填进靠左的第二列
    expect(positioner.get(2)).toEqual({ top: 64, left: 104, height: 20, column: 1, columnSpan: 1 })
  })

  it('avoids leaving a large gap above a spanning cell', () => {
    const positioner = createPositioner({
      columnCount: 4,
      getColumnSpan: (index) => (index === 3 ? 2 : 1),
    })

    positioner.set(0, 100)
    positioner.set(1, 100)
    positioner.set(2, 100)
    positioner.set(3, 60)

    // 前三列高度都是 104，第四列为 0；跨列照片放在对齐的前两列，而不是留下 104 的空隙
    expect(positioner.get(3)).toEqual({ top: 104, left: 0, height: 60, column: 0, columnSpan: 2 })
  })

  it('clamps the span to the available columns', () => {
    const positioner = createPositioner({ columnCount: 1, getColumnSpan: () => 2 })

    positioner.set(0, 100)

    expect(positioner.get(0)).toEqual({ top: 0, left: 0, height: 100, column: 0, columnSpan: 1 })
  })

  it('renders the cells overlapping the viewport range in index order', () => {
    const positioner = createPositioner({ columnCount: 2 })

    positioner.set(0, 100)
    positioner.set(1, 300)
    positioner.set(2, 150)

    const visibleItems: Array<{ index: number; left: number; top: number }> = []
    positioner.range(200, 400, (index, left, top) => {
      visibleItems.push({ index, left, top })
    })

    expect(visibleItems).toEqual([
      { index: 1, left: 104, top: 0 },
      { index: 2, left: 0, top: 104 },
    ])
  })

  it('reflows the following cells when a measured height changes', () => {
    const positioner = createPositioner({ columnCount: 2 })

    positioner.set(0, 100)
    positioner.set(1, 300)
    positioner.set(2, 50)

    expect(positioner.get(2)).toEqual({ top: 104, left: 0, height: 50, column: 0, columnSpan: 1 })

    positioner.update([0, 500])

    expect(positioner.get(0)).toEqual({ top: 0, left: 0, height: 500, column: 0, columnSpan: 1 })
    expect(positioner.get(2)).toEqual({ top: 304, left: 104, height: 50, column: 1, columnSpan: 1 })
  })

  it('reports sizes, the shortest column and the estimated height', () => {
    const positioner = createPositioner({ columnCount: 2 })

    expect(positioner.size()).toBe(0)
    expect(positioner.estimateHeight(2, 400)).toBe(400)

    positioner.set(0, 100)
    positioner.set(1, 100)

    expect(positioner.size()).toBe(2)
    expect(positioner.shortestColumn()).toBe(104)
    expect(positioner.estimateHeight(2, 400)).toBe(104)
    expect(positioner.estimateHeight(6, 400)).toBe(904)
  })

  it('relayouts measured cells in index order, no matter when they were measured', () => {
    const positioner = createPositioner()

    positioner.set(2, 100)

    expect(positioner.size()).toBe(1)
    expect(positioner.get(0)).toBeUndefined()

    positioner.set(0, 100)

    expect(positioner.get(0)).toEqual({ top: 0, left: 0, height: 100, column: 0, columnSpan: 1 })
    expect(positioner.get(1)).toBeUndefined()
    expect(positioner.get(2)).toEqual({ top: 0, left: 104, height: 100, column: 1, columnSpan: 1 })
    expect(positioner.size()).toBe(2)
  })
})
