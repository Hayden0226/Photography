import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import type { BuilderPlugin, PhotoManifestItem } from '@afilmory/builder'
import { afterEach, describe, expect, it } from 'vitest'

import type {PhotoDescriptionEntry} from '../plugins/builder/photo-description-entries.js';
import {
  addMissingDescriptionEntries,
  createDescriptionEntry,
  normalizeStorageKey,
  parsePhotoDescriptions,
  serializePhotoDescriptions
} from '../plugins/builder/photo-description-entries.js'
import { createPhotoDescriptionsPlugin } from '../plugins/builder/photo-descriptions.js'

type BeforeSaveManifestContext = Parameters<NonNullable<NonNullable<BuilderPlugin['hooks']>['beforeSaveManifest']>>[0]

const createEntry = (overrides: Partial<PhotoDescriptionEntry> = {}): PhotoDescriptionEntry => ({
  key: '随手/A.jpg',
  title: '',
  descriptions: { 'zh-CN': '', en: '' },
  tags: [],
  aiContext: { currentTitle: '', dateTaken: '', camera: '', lens: '', categoryTags: [] },
  ...overrides,
})

const createManifestPhoto = (overrides: Record<string, unknown>): PhotoManifestItem =>
  ({ description: '', tags: [], ...overrides }) as unknown as PhotoManifestItem

describe('photo description entries', () => {
  it('normalizes storage keys', () => {
    expect(normalizeStorageKey('photos/城市/A.jpg')).toBe('城市/A.jpg')
    expect(normalizeStorageKey('/随手\\A.jpg ')).toBe('随手/A.jpg')
  })

  it('creates a placeholder entry from photo metadata', () => {
    const entry = createDescriptionEntry(
      {
        s3Key: '城市/B.jpg',
        title: 'B',
        titles: { 'zh-CN': '乙', en: 'B' },
        dateTaken: '2026-02-02T00:00:00.000Z',
        tags: ['城市', '夜景'],
        exif: { Make: 'FUJIFILM', Model: 'X-T30 II', LensModel: 'XF 23mm' },
      },
      '城市/B.jpg',
    )

    expect(entry).toEqual({
      key: '城市/B.jpg',
      title: '',
      titles: { 'zh-CN': '乙', en: 'B' },
      descriptions: { 'zh-CN': '', en: '' },
      tags: [],
      aiContext: {
        currentTitle: 'B',
        dateTaken: '2026-02-02T00:00:00.000Z',
        camera: 'FUJIFILM X-T30 II',
        lens: 'XF 23mm',
        categoryTags: ['城市', '夜景'],
      },
    })
  })

  it('only appends entries for photos that have none', () => {
    const existing = createEntry({ key: '随手/A.jpg', title: 'A' })
    const { photos, createdKeys } = addMissingDescriptionEntries(
      [existing],
      [{ s3Key: 'photos/随手/A.jpg' }, { s3Key: '随手/B.jpg' }, { s3Key: '' }, { s3Key: '随手/B.jpg' }],
    )

    expect(createdKeys).toEqual(['随手/B.jpg'])
    expect(photos).toHaveLength(2)
    expect(photos[0]).toBe(existing)
    expect(photos[1].key).toBe('随手/B.jpg')
  })

  it('is idempotent across runs', () => {
    const manifestPhotos = [{ s3Key: '随手/A.jpg' }, { s3Key: '城市/B.jpg' }]
    const first = addMissingDescriptionEntries([], manifestPhotos)
    const second = addMissingDescriptionEntries(first.photos, manifestPhotos)

    expect(first.createdKeys).toEqual(['随手/A.jpg', '城市/B.jpg'])
    expect(second.createdKeys).toEqual([])
    expect(serializePhotoDescriptions({ version: 1, photos: second.photos })).toBe(
      serializePhotoDescriptions({ version: 1, photos: first.photos }),
    )
  })

  it('round-trips the descriptions file format', () => {
    const file = serializePhotoDescriptions({ version: 1, photos: [createEntry()] })

    expect(file.endsWith('\n')).toBe(true)
    expect(file).toContain('\n  "photos": [')
    expect(parsePhotoDescriptions(file, 'content/photo-descriptions.json').photos).toHaveLength(1)
    expect(() => parsePhotoDescriptions('{"photos":{}}', 'content/photo-descriptions.json')).toThrow(
      /content\/photo-descriptions\.json/,
    )
  })
})

describe('photo descriptions plugin', () => {
  const tempDirectories: string[] = []

  afterEach(async () => {
    await Promise.all(tempDirectories.splice(0).map((directory) => fs.rm(directory, { recursive: true, force: true })))
  })

  const createDescriptionsFile = async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'afilmory-photo-descriptions-'))
    tempDirectories.push(directory)

    return path.join(directory, 'photo-descriptions.json')
  }

  const runBeforeSaveManifest = async (file: string, manifest: PhotoManifestItem[]) => {
    const plugin = createPhotoDescriptionsPlugin({ file })
    const logs: string[] = []
    const context = {
      logger: { main: { info: (...args: unknown[]) => logs.push(args.join(' ')) } },
      payload: { options: {}, manifest, cameras: [], lenses: [] },
    } as unknown as BeforeSaveManifestContext

    await plugin.hooks?.beforeSaveManifest?.(context)

    return logs
  }

  it('fills in entries for photos that were just pulled from the photo repo', async () => {
    const file = await createDescriptionsFile()
    const manifest = [
      createManifestPhoto({ s3Key: '随手/A.jpg', title: 'A', tags: ['随手'] }),
      createManifestPhoto({
        s3Key: '城市/B.jpg',
        title: 'B',
        tags: ['城市'],
        dateTaken: '2026-01-01T00:00:00.000Z',
        exif: { Make: 'FUJIFILM', Model: 'X-T30 II' },
      }),
    ]

    const logs = await runBeforeSaveManifest(file, manifest)
    const written = JSON.parse(await fs.readFile(file, 'utf-8')) as { photos: PhotoDescriptionEntry[] }

    expect(written.photos.map((entry) => entry.key)).toEqual(['随手/A.jpg', '城市/B.jpg'])
    expect(written.photos[1]).toMatchObject({
      title: '',
      descriptions: { 'zh-CN': '', en: '' },
      aiContext: {
        currentTitle: 'B',
        dateTaken: '2026-01-01T00:00:00.000Z',
        camera: 'FUJIFILM X-T30 II',
        categoryTags: ['城市'],
      },
    })
    expect(logs.join('\n')).toContain('自动补全 2 条照片条目')

    const beforeSecondRun = await fs.readFile(file, 'utf-8')
    await runBeforeSaveManifest(file, manifest)
    expect(await fs.readFile(file, 'utf-8')).toBe(beforeSecondRun)
  })

  it('leaves existing entries byte-identical while still merging them into the manifest', async () => {
    const file = await createDescriptionsFile()
    const existing = createEntry({
      key: '随手/A.jpg',
      title: '走累了',
      titles: { 'zh-CN': '走累了', en: 'legs are tired' },
      descriptions: { 'zh-CN': '中文描述', en: 'English description' },
      tags: ['香港'],
      aiContext: {
        currentTitle: '20250901221543',
        dateTaken: '2025-09-01T14:15:43.000Z',
        camera: 'FUJIFILM X-T30 II',
        lens: '',
        categoryTags: ['随手'],
      },
    })
    const original = serializePhotoDescriptions({ version: 1, photos: [existing] })
    await fs.writeFile(file, original, 'utf-8')

    const manifest = [createManifestPhoto({ s3Key: '随手/A.jpg', title: '20250901221543', tags: ['随手'] })]
    await runBeforeSaveManifest(file, manifest)

    expect(await fs.readFile(file, 'utf-8')).toBe(original)
    expect(manifest[0].title).toBe('走累了')
    expect(manifest[0].titles).toEqual({ 'zh-CN': '走累了', en: 'legs are tired' })
    expect(manifest[0].descriptions).toEqual({ 'zh-CN': '中文描述', en: 'English description' })
    expect(manifest[0].description).toBe('中文描述')
    expect(manifest[0].tags).toEqual(['随手', '香港'])
  })
})
