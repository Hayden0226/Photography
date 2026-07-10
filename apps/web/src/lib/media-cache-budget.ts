const MiB = 1024 * 1024

export function getMediaCacheBudgetBytes(): number {
  if (typeof window === 'undefined') return 192 * MiB
  return window.matchMedia?.('(max-width: 768px)').matches ? 64 * MiB : 192 * MiB
}
