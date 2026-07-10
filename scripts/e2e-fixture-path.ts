import os from 'node:os'
import path from 'node:path'

export const WORKSPACE_FIXTURE_PATH = 'apps/web/public/__fixtures/photos'

function isStrictChild(parentPath: string, candidatePath: string): boolean {
  const relativePath = path.relative(parentPath, candidatePath)
  return relativePath !== '' && !relativePath.startsWith(`..${path.sep}`) && !path.isAbsolute(relativePath)
}

/** Resolve only the dedicated workspace fixture path or a namespaced temp path. */
export function resolveE2EFixtureRoot(cwd: string, configuredPath?: string): string {
  const workspaceRoot = path.resolve(cwd)
  const workspaceFixtureRoot = path.resolve(workspaceRoot, WORKSPACE_FIXTURE_PATH)
  const candidate = path.resolve(workspaceRoot, configuredPath || WORKSPACE_FIXTURE_PATH)
  const temporaryFixtureRoot = path.resolve(os.tmpdir(), 'afilmory-e2e-fixtures')

  if (candidate === workspaceFixtureRoot || isStrictChild(temporaryFixtureRoot, candidate)) {
    return candidate
  }

  throw new TypeError(
    `拒绝清理不安全的 fixture 路径：${candidate}。仅允许 ${workspaceFixtureRoot} 或 ${temporaryFixtureRoot} 的子目录。`,
  )
}
