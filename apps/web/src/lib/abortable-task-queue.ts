export interface AbortableTaskQueueStats {
  active: number
  pending: number
  concurrency: number
}

interface QueueTask<T> {
  execute: (signal: AbortSignal) => Promise<T>
  signal: AbortSignal
  resolve: (value: T) => void
  reject: (reason?: unknown) => void
  handleAbort: () => void
}

const createAbortError = () => new DOMException('The operation was aborted', 'AbortError')

/** A small FIFO queue for expensive media work with cancellation while queued or active. */
export class AbortableTaskQueue {
  private readonly queue: Array<QueueTask<unknown>> = []
  private activeCount = 0

  constructor(private readonly concurrency: number) {
    if (!Number.isFinite(concurrency) || concurrency < 1) {
      throw new RangeError('concurrency must be at least 1')
    }
  }

  enqueue<T>(execute: (signal: AbortSignal) => Promise<T>, signal: AbortSignal): Promise<T> {
    if (signal.aborted) return Promise.reject(createAbortError())

    return new Promise<T>((resolve, reject) => {
      const task: QueueTask<T> = {
        execute,
        signal,
        resolve,
        reject,
        handleAbort: () => {
          const index = this.queue.indexOf(task as QueueTask<unknown>)
          if (index !== -1) {
            this.queue.splice(index, 1)
            signal.removeEventListener('abort', task.handleAbort)
            reject(createAbortError())
          }
        },
      }

      signal.addEventListener('abort', task.handleAbort, { once: true })
      this.queue.push(task as QueueTask<unknown>)
      this.drain()
    })
  }

  getStats(): AbortableTaskQueueStats {
    return {
      active: this.activeCount,
      pending: this.queue.length,
      concurrency: this.concurrency,
    }
  }

  private drain(): void {
    while (this.activeCount < this.concurrency) {
      const task = this.queue.shift()
      if (!task) return

      task.signal.removeEventListener('abort', task.handleAbort)
      if (task.signal.aborted) {
        task.reject(createAbortError())
        continue
      }

      this.activeCount += 1
      void task
        .execute(task.signal)
        .then(task.resolve, task.reject)
        .finally(() => {
          this.activeCount = Math.max(0, this.activeCount - 1)
          this.drain()
        })
    }
  }
}
