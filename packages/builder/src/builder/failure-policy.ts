import type { BuilderOptions } from './builder.js'

export interface BuildFailurePolicy {
  isFullBuild: boolean
  shouldSaveManifest: boolean
  shouldRejectBuild: boolean
}

export function resolveBuildFailurePolicy(
  options: Pick<BuilderOptions, 'isForceMode' | 'isForceManifest' | 'strict'>,
  failedCount: number,
  hasUsableExistingManifest: boolean,
): BuildFailurePolicy {
  const isFullBuild = options.isForceMode || options.isForceManifest || !hasUsableExistingManifest
  const hasFailures = failedCount > 0

  return {
    isFullBuild,
    shouldSaveManifest: !hasFailures || !isFullBuild,
    shouldRejectBuild: hasFailures && (isFullBuild || options.strict === true),
  }
}

export function findExistingItemsToRetain<T extends { s3Key: string }>(
  manifest: readonly T[],
  existingItems: ReadonlyMap<string, T>,
  presentMediaKeys: ReadonlySet<string>,
): T[] {
  const includedKeys = new Set(manifest.map((item) => item.s3Key))
  return [...existingItems].flatMap(([key, item]) =>
    presentMediaKeys.has(key) && !includedKeys.has(key) ? [item] : [],
  )
}
