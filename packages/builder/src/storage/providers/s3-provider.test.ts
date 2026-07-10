// @vitest-environment node

import type { ListObjectsV2Command } from '@aws-sdk/client-s3'
import { describe, expect, it, vi } from 'vitest'

import { S3StorageProvider } from './s3-provider.js'

describe('S3StorageProvider pagination', () => {
  it('follows continuation tokens until every page is loaded', async () => {
    const send = vi
      .fn()
      .mockResolvedValueOnce({
        Contents: [{ Key: 'gallery/one.jpg', Size: 1 }],
        IsTruncated: true,
        NextContinuationToken: 'next-page',
      })
      .mockResolvedValueOnce({
        Contents: [{ Key: 'gallery/two.jpg', Size: 2 }],
        IsTruncated: false,
      })
    const provider = new S3StorageProvider({
      provider: 's3',
      bucket: 'fixture',
      accessKeyId: 'fixture',
      secretAccessKey: 'fixture',
    })
    Reflect.set(provider, 's3Client', { send })

    await expect(provider.listAllFiles()).resolves.toEqual([
      expect.objectContaining({ key: 'gallery/one.jpg' }),
      expect.objectContaining({ key: 'gallery/two.jpg' }),
    ])
    expect(send).toHaveBeenCalledTimes(2)
    const secondCommand = send.mock.calls[1][0] as ListObjectsV2Command
    expect(secondCommand.input.ContinuationToken).toBe('next-page')
  })

  it('honors maxFileLimit across page boundaries', async () => {
    const send = vi
      .fn()
      .mockResolvedValueOnce({
        Contents: [{ Key: 'one.jpg' }, { Key: 'two.jpg' }],
        IsTruncated: true,
        NextContinuationToken: 'next-page',
      })
      .mockResolvedValueOnce({
        Contents: [{ Key: 'three.jpg' }, { Key: 'four.jpg' }],
        IsTruncated: true,
        NextContinuationToken: 'unused-page',
      })
    const provider = new S3StorageProvider({
      provider: 's3',
      bucket: 'fixture',
      accessKeyId: 'fixture',
      secretAccessKey: 'fixture',
      maxFileLimit: 3,
    })
    Reflect.set(provider, 's3Client', { send })

    const objects = await provider.listAllFiles()

    expect(objects.map((object) => object.key)).toEqual(['one.jpg', 'two.jpg', 'three.jpg'])
    const secondCommand = send.mock.calls[1][0] as ListObjectsV2Command
    expect(secondCommand.input.MaxKeys).toBe(1)
    expect(send).toHaveBeenCalledTimes(2)
  })
})
