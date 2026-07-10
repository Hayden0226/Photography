/**
 * 通用 LRU 缓存类
 * 支持自定义清理函数，用于在缓存项被移除时执行清理操作（如释放 blob URL）
 */
/**
 * React Hook 用于管理 LRU 缓存的生命周期
 */
import { useEffect, useRef } from 'react'

export class LRUCache<K, V> {
  private maxSize: number
  private maxWeight?: number
  private totalWeight = 0
  private cache: Map<K, V>
  private cleanupFn?: (value: V, key: K, reason: string) => void
  private getWeight: (value: V, key: K) => number

  constructor(
    maxSize = 10,
    cleanupFn?: (value: V, key: K, reason: string) => void,
    options: {
      maxWeight?: number
      getWeight?: (value: V, key: K) => number
    } = {},
  ) {
    this.maxSize = maxSize
    this.maxWeight = options.maxWeight
    this.cache = new Map()
    this.cleanupFn = cleanupFn
    this.getWeight = options.getWeight ?? (() => 1)
  }

  get(key: K): V | undefined {
    const value = this.cache.get(key)
    if (value !== undefined) {
      // Move to end (most recently used)
      this.cache.delete(key)
      this.cache.set(key, value)
      return value
    }
    return undefined
  }

  set(key: K, value: V): void {
    // If key already exists, clean up old value and delete it first
    if (this.cache.has(key)) {
      const oldValue = this.cache.get(key)!
      this.totalWeight -= this._getWeight(oldValue, key)
      this._cleanup(oldValue, key, `Replacing existing cache entry for ${String(key)}`)
      this.cache.delete(key)
    }

    this.cache.set(key, value)
    this.totalWeight += this._getWeight(value, key)

    // Always retain one entry, even when it alone exceeds the byte budget. Revoking
    // that entry here would invalidate the object URL returned to the caller.
    while (this.cache.size > 1 && (this.cache.size > this.maxSize || this._isOverWeightBudget())) {
      const firstKey = this.cache.keys().next().value
      if (firstKey !== undefined) {
        const firstValue = this.cache.get(firstKey)!
        this.totalWeight -= this._getWeight(firstValue, firstKey)
        this._cleanup(firstValue, firstKey, `LRU eviction: ${String(firstKey)}`)
        this.cache.delete(firstKey)
      }
    }

    console.info(
      `LRU Cache: Added ${String(key)}, cache size: ${this.cache.size}/${this.maxSize}, weight: ${this.totalWeight}${this.maxWeight === undefined ? '' : `/${this.maxWeight}`}`,
    )
  }

  /**
   * Remove a specific cache entry and clean up its value
   */
  delete(key: K): boolean {
    const value = this.cache.get(key)
    if (value !== undefined) {
      this.totalWeight -= this._getWeight(value, key)
      this._cleanup(value, key, `Manual deletion: ${String(key)}`)
      return this.cache.delete(key)
    }
    return false
  }

  has(key: K): boolean {
    return this.cache.has(key)
  }

  clear(): void {
    // Clean up all cached values
    let cleanedCount = 0
    for (const [key, value] of this.cache.entries()) {
      this._cleanup(value, key, `Cache clear: ${String(key)}`)
      cleanedCount++
    }
    this.cache.clear()
    this.totalWeight = 0
    console.info(`LRU Cache: Cleared ${cleanedCount} cached items`)
  }

  size(): number {
    return this.cache.size
  }

  /**
   * Get cache statistics for debugging
   */
  getStats(): { size: number; maxSize: number; totalWeight: number; maxWeight?: number; keys: K[] } {
    return {
      size: this.cache.size,
      maxSize: this.maxSize,
      totalWeight: this.totalWeight,
      maxWeight: this.maxWeight,
      keys: Array.from(this.cache.keys()),
    }
  }

  /**
   * Get all values (for iteration or debugging)
   */
  values(): IterableIterator<V> {
    return this.cache.values()
  }

  /**
   * Get all entries (for iteration or debugging)
   */
  entries(): IterableIterator<[K, V]> {
    return this.cache.entries()
  }

  /**
   * Private method to safely execute cleanup function
   */
  private _cleanup(value: V, key: K, reason: string): void {
    if (this.cleanupFn) {
      try {
        this.cleanupFn(value, key, reason)
      } catch (error) {
        console.warn(`LRU Cache cleanup failed (${reason}):`, error)
      }
    }
  }

  private _getWeight(value: V, key: K): number {
    const weight = this.getWeight(value, key)
    return Number.isFinite(weight) && weight > 0 ? weight : 0
  }

  private _isOverWeightBudget(): boolean {
    return this.maxWeight !== undefined && this.totalWeight > this.maxWeight
  }
}

/**
 * 创建一个专门用于 blob URL 的 LRU 缓存
 * 自动在项目被移除时调用 URL.revokeObjectURL
 */
export function createBlobUrlCache<T extends { url?: string }>(maxSize = 10): LRUCache<string, T> {
  return new LRUCache<string, T>(maxSize, (value, key, reason) => {
    if (value.url) {
      try {
        URL.revokeObjectURL(value.url)
        console.info(`Blob URL revoked - ${reason}`)
      } catch (error) {
        console.warn(`Failed to revoke blob URL (${reason}):`, error)
      }
    }
  })
}

export function useLRUCache<K, V>(
  maxSize = 10,
  cleanupFn?: (value: V, key: K, reason: string) => void,
): LRUCache<K, V> {
  const cacheRef = useRef<LRUCache<K, V> | null>(null)

  if (!cacheRef.current) {
    cacheRef.current = new LRUCache(maxSize, cleanupFn)
  }

  // 组件卸载时自动清理所有缓存
  useEffect(() => {
    return () => {
      cacheRef.current?.clear()
    }
  }, [])

  return cacheRef.current
}
