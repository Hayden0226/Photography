/**
 * 超宽照片（例如全景）在瀑布流里占两列，避免单列时被压得又扁又小。
 */
export const WIDE_PHOTO_ASPECT_RATIO = 2
export const MAX_MASONRY_COLUMN_SPAN = 2

/** 宽高比达到阈值的照片占多列，其余照片占一列 */
export const getPhotoColumnSpan = (aspectRatio?: number | null): number => {
  if (typeof aspectRatio !== 'number' || !Number.isFinite(aspectRatio) || aspectRatio < WIDE_PHOTO_ASPECT_RATIO) {
    return 1
  }

  return MAX_MASONRY_COLUMN_SPAN
}

/** 可用列数不足时把跨列数压回列数上限，保证布局不越界 */
export const clampMasonryColumnSpan = (columnSpan: number, columnCount: number): number => {
  const availableColumns = Math.max(1, Math.floor(columnCount) || 1)
  const requestedSpan = Math.max(1, Math.floor(columnSpan) || 1)

  return Math.min(requestedSpan, availableColumns)
}

/** 跨列照片的实际宽度：占用的列宽之和，加上中间的列间距 */
export const resolveMasonryItemWidth = ({
  columnWidth,
  columnGutter,
  columnSpan,
}: {
  columnWidth: number
  columnGutter: number
  columnSpan: number
}): number => columnSpan * columnWidth + (columnSpan - 1) * columnGutter

/** 与列跨度匹配的 srcset sizes，跨列时按列跨度放大，避免浏览器挑到过小的缩略图 */
export const resolveMasonryThumbnailSizes = (columnSpan: number): string =>
  `(max-width: 640px) ${50 * columnSpan}vw, (max-width: 1024px) ${33 * columnSpan}vw, ${350 * columnSpan}px`
