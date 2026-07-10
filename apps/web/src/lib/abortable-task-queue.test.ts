import { describe, expect, it, vi } from 'vitest'

import { AbortableTaskQueue } from './abortable-task-queue'

describe('AbortableTaskQueue', () => {
  it('honors its concurrency and starts queued work in order', async () => {
    const queue = new AbortableTaskQueue(1)
    let releaseFirst!: () => void
    const first = queue.enqueue(
      () =>
        new Promise<void>((resolve) => {
          releaseFirst = resolve
        }),
      new AbortController().signal,
    )
    const secondTask = vi.fn(async () => 'second')
    const second = queue.enqueue(secondTask, new AbortController().signal)

    expect(queue.getStats()).toEqual({ active: 1, pending: 1, concurrency: 1 })
    expect(secondTask).not.toHaveBeenCalled()

    releaseFirst()
    await first
    await expect(second).resolves.toBe('second')
  })

  it('removes queued work when it is aborted', async () => {
    const queue = new AbortableTaskQueue(1)
    let releaseFirst!: () => void
    const first = queue.enqueue(
      () =>
        new Promise<void>((resolve) => {
          releaseFirst = resolve
        }),
      new AbortController().signal,
    )
    const controller = new AbortController()
    const secondTask = vi.fn(async () => {})
    const second = queue.enqueue(secondTask, controller.signal)

    controller.abort()
    await expect(second).rejects.toMatchObject({ name: 'AbortError' })
    expect(secondTask).not.toHaveBeenCalled()

    releaseFirst()
    await first
  })
})
