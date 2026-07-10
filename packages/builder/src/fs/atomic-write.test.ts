// @vitest-environment node

import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { atomicWriteFile } from './atomic-write.js'

const temporaryDirectories: string[] = []

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) => fs.rm(directory, { recursive: true, force: true })),
  )
})

async function createTemporaryDirectory(): Promise<string> {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'afilmory-atomic-write-'))
  temporaryDirectories.push(directory)
  return directory
}

describe('atomicWriteFile', () => {
  it('atomically replaces a file and retains one requested backup', async () => {
    const directory = await createTemporaryDirectory()
    const target = path.join(directory, 'manifest.json')
    await fs.writeFile(target, 'old')

    await atomicWriteFile(target, 'new', {
      backup: true,
      validate: async (temporaryPath) => {
        expect(await fs.readFile(temporaryPath, 'utf-8')).toBe('new')
      },
    })

    expect(await fs.readFile(target, 'utf-8')).toBe('new')
    expect(await fs.readFile(`${target}.bak`, 'utf-8')).toBe('old')
    expect((await fs.readdir(directory)).filter((file) => file.endsWith('.tmp'))).toEqual([])
  })

  it('keeps the previous target and creates no public backup when validation fails', async () => {
    const directory = await createTemporaryDirectory()
    const target = path.join(directory, 'thumbnail.jpg')
    await fs.writeFile(target, 'old-thumbnail')

    await expect(
      atomicWriteFile(target, 'invalid-thumbnail', {
        validate: async () => {
          throw new Error('invalid image')
        },
      }),
    ).rejects.toThrow('invalid image')

    expect(await fs.readFile(target, 'utf-8')).toBe('old-thumbnail')
    await expect(fs.access(`${target}.bak`)).rejects.toMatchObject({ code: 'ENOENT' })
  })
})
