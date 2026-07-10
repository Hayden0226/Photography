import { heicTo, isHeic } from 'heic-to'

import { i18nAtom } from '~/i18n'
import { isSafari } from '~/lib/device-viewport'
import type { LoadingCallbacks } from '~/lib/image-loader-manager'
import { jotaiStore } from '~/lib/jotai'
import {
  clearMediaBlobCacheNamespace,
  deleteMediaBlobCacheEntry,
  getMediaBlobCacheEntry,
  getMediaBlobCacheNamespaceStats,
  setMediaBlobCacheEntry,
} from '~/lib/media-blob-cache'

import type { ConversionResult, ImageConverterStrategy } from '../type'

// HEIC 转换策略
export class HeicConverterStrategy implements ImageConverterStrategy {
  getName(): string {
    return 'HEIC'
  }

  getSupportedFormats(): string[] {
    return ['image/heic', 'image/heif']
  }

  async shouldConvert(_blob: Blob): Promise<boolean> {
    try {
      // 只需检查浏览器是否支持，格式检测已由 file-type 完成
      return !isBrowserSupportHeic()
    } catch (error) {
      console.error('HEIC browser support detection failed:', error)
      return false
    }
  }

  async convert(blob: Blob, originalUrl: string, callbacks?: LoadingCallbacks): Promise<ConversionResult> {
    const { onLoadingStateUpdate } = callbacks || {}

    try {
      // 获取国际化文案
      const i18n = jotaiStore.get(i18nAtom)

      // 更新转换状态
      onLoadingStateUpdate?.({
        isConverting: true,
        isQueueWaiting: false,
        conversionMessage: i18n.t('loading.heic.converting'),
        isHeicFormat: true,
        loadingProgress: 100,
        loadedBytes: blob.size,
        totalBytes: blob.size,
      })

      const result = await convertHeicImage(blob, originalUrl)

      return {
        url: result.url,
        convertedSize: result.convertedSize,
        format: result.format,
        originalSize: result.originalSize,
      }
    } catch (error) {
      console.error('HEIC conversion failed:', error)
      throw new Error(`HEIC conversion failed: ${error}`)
    }
  }
}

export interface HeicConversionOptions {
  quality?: number
  format?: 'image/jpeg' | 'image/png'
}

const HEIC_CACHE_NAMESPACE = 'heic' as const

/**
 * 生成文件的缓存键（基于 src）
 */
function generateCacheKey(src: string, options: HeicConversionOptions): string {
  const quality = options.quality || 1
  const format = options.format || 'image/jpeg'
  // 使用文件 src 和转换选项生成唯一键
  return `${src}-${quality}-${format}`
}

/**
 * 检测文件是否为 HEIC/HEIF 格式
 */
export async function detectHeicFormat(file: File | Blob): Promise<boolean> {
  try {
    return await isHeic(file as File)
  } catch (error) {
    console.warn('Failed to detect HEIC format:', error)
    return false
  }
}

export const isBrowserSupportHeic = () => {
  const safariVersionMatch = navigator.userAgent.match(/version\/(\d+)/i)
  const versionString = safariVersionMatch?.[1]
  const version = versionString ? Number.parseInt(versionString, 10) : 0

  return isSafari && version >= 17
}

/**
 * 将 HEIC/HEIF 图片转换为 JPEG 或 PNG（支持缓存）
 */
export async function convertHeicImage(
  file: File | Blob,
  src: string,
  options: HeicConversionOptions = {},
): Promise<ConversionResult> {
  const { quality = 1, format = 'image/jpeg' } = options

  // 生成缓存键
  const cacheKey = generateCacheKey(src, options)

  // 检查缓存
  const cachedResult = getMediaBlobCacheEntry<ConversionResult>(HEIC_CACHE_NAMESPACE, cacheKey)
  if (cachedResult) {
    console.info('Using cached HEIC conversion result', cachedResult)
    return cachedResult
  }

  try {
    // 检查是否为 HEIC 格式
    const isHeicFormat = await detectHeicFormat(file)
    if (!isHeicFormat) {
      throw new Error('File is not in HEIC/HEIF format')
    }

    // 转换图片
    const convertedBlob = await heicTo({
      blob: file,
      type: format,
      quality,
    })

    // 创建 URL
    const url = URL.createObjectURL(convertedBlob)

    const result: ConversionResult = {
      url,
      originalSize: file.size,
      convertedSize: convertedBlob.size,
      format,
    }

    // 缓存结果
    setMediaBlobCacheEntry({
      namespace: HEIC_CACHE_NAMESPACE,
      key: cacheKey,
      value: result,
      bytes: result.convertedSize,
      revoke: (cached) => URL.revokeObjectURL(cached.url),
    })
    console.info(
      `HEIC conversion completed and cached: ${(file.size / 1024).toFixed(1)}KB → ${(convertedBlob.size / 1024).toFixed(1)}KB`,
    )

    return result
  } catch (error) {
    console.error('HEIC conversion failed:', error)
    throw new Error(`Failed to convert HEIC image: ${error instanceof Error ? error.message : 'Unknown error'}`)
  }
}

/**
 * 清理转换后的 URL
 */
export function revokeConvertedUrl(url: string): void {
  try {
    URL.revokeObjectURL(url)
  } catch (error) {
    console.warn('Failed to revoke URL:', error)
  }
}

// HEIC 缓存管理函数
export function getHeicCacheSize(): number {
  return getMediaBlobCacheNamespaceStats(HEIC_CACHE_NAMESPACE).size
}

export function clearHeicCache(): void {
  clearMediaBlobCacheNamespace(HEIC_CACHE_NAMESPACE)
}

export function removeHeicCache(cacheKey: string): boolean {
  return deleteMediaBlobCacheEntry(HEIC_CACHE_NAMESPACE, cacheKey)
}

export function getHeicCacheStats(): {
  size: number
  maxSize: number
  keys: string[]
} {
  const { size, maxSize, keys } = getMediaBlobCacheNamespaceStats(HEIC_CACHE_NAMESPACE)
  return { size, maxSize, keys }
}

/**
 * 根据 src 和选项移除特定的 HEIC 缓存项
 */
export function removeHeicCacheBySrc(src: string, options: HeicConversionOptions = {}): boolean {
  const cacheKey = generateCacheKey(src, options)
  return deleteMediaBlobCacheEntry(HEIC_CACHE_NAMESPACE, cacheKey)
}
