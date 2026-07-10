// @vitest-environment node

import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { LocalStorageProvider } from './local-provider.js'

const temporaryDirectories: string[] = []

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) => fs.rm(directory, { recursive: true, force: true })),
  )
})

describe('LocalStorageProvider path boundary', () => {
  it('rejects a sibling path that merely shares the base path prefix', async () => {
    const parent = await fs.mkdtemp(path.join(os.tmpdir(), 'afilmory-local-provider-'))
    temporaryDirectories.push(parent)
    const basePath = path.join(parent, 'photos')
    await fs.mkdir(basePath)
    const provider = new LocalStorageProvider({ provider: 'local', basePath })

    await expect(provider.uploadFile('../photos-private/escape.jpg', Buffer.from('escape'))).rejects.toThrow(
      '文件路径不安全',
    )
    await expect(fs.access(path.join(parent, 'photos-private/escape.jpg'))).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('rejects reads, uploads, and deletes through a symlink inside the base path', async () => {
    const parent = await fs.mkdtemp(path.join(os.tmpdir(), 'afilmory-local-provider-'))
    temporaryDirectories.push(parent)
    const basePath = path.join(parent, 'photos')
    const outsidePath = path.join(parent, 'outside')
    const outsideFile = path.join(outsidePath, 'private.jpg')
    await fs.mkdir(basePath)
    await fs.mkdir(outsidePath)
    await fs.writeFile(outsideFile, 'private')
    await fs.symlink(outsidePath, path.join(basePath, 'linked'), process.platform === 'win32' ? 'junction' : 'dir')
    const provider = new LocalStorageProvider({ provider: 'local', basePath })

    await expect(provider.getFile('linked/private.jpg')).resolves.toBeNull()
    await expect(provider.uploadFile('linked/new.jpg', Buffer.from('escape'))).rejects.toThrow('包含符号链接')
    await expect(provider.deleteFile('linked/private.jpg')).rejects.toThrow('包含符号链接')

    await expect(fs.readFile(outsideFile, 'utf-8')).resolves.toBe('private')
    await expect(fs.access(path.join(outsidePath, 'new.jpg'))).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('allows uploads whose nested target path does not exist yet', async () => {
    const parent = await fs.mkdtemp(path.join(os.tmpdir(), 'afilmory-local-provider-'))
    temporaryDirectories.push(parent)
    const basePath = path.join(parent, 'photos')
    await fs.mkdir(basePath)
    const provider = new LocalStorageProvider({ provider: 'local', basePath })

    await expect(provider.uploadFile('new/nested/photo.jpg', Buffer.from('photo'))).resolves.toMatchObject({
      key: 'new/nested/photo.jpg',
      size: 5,
    })
    await expect(fs.readFile(path.join(basePath, 'new/nested/photo.jpg'), 'utf-8')).resolves.toBe('photo')
  })
})
