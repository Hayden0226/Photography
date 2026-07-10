// @vitest-environment node

import os from 'node:os'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import { resolveE2EFixtureRoot, WORKSPACE_FIXTURE_PATH } from './e2e-fixture-path.js'

describe('resolveE2EFixtureRoot', () => {
  const workspace = path.resolve('/workspace/photography')

  it('allows only the dedicated workspace fixture directory by default', () => {
    expect(resolveE2EFixtureRoot(workspace)).toBe(path.resolve(workspace, WORKSPACE_FIXTURE_PATH))
    expect(resolveE2EFixtureRoot(workspace, WORKSPACE_FIXTURE_PATH)).toBe(
      path.resolve(workspace, WORKSPACE_FIXTURE_PATH),
    )
  })

  it('allows explicitly namespaced temporary fixture directories', () => {
    const temporaryFixture = path.join(os.tmpdir(), 'afilmory-e2e-fixtures', 'run-123')
    expect(resolveE2EFixtureRoot(workspace, temporaryFixture)).toBe(path.resolve(temporaryFixture))
  })

  it.each([
    ['workspace root', '.'],
    ['private photo checkout', 'photos'],
    ['arbitrary workspace directory', 'apps/web/public'],
    ['temporary namespace root', path.join(os.tmpdir(), 'afilmory-e2e-fixtures')],
    ['arbitrary temporary directory', path.join(os.tmpdir(), 'other-fixtures')],
  ])('rejects %s', (_label, candidate) => {
    expect(() => resolveE2EFixtureRoot(workspace, candidate)).toThrow('拒绝清理不安全的 fixture 路径')
  })
})
