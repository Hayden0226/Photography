// @vitest-environment node

import { describe, expect, it, vi } from 'vitest'

import {
  ClusterPool,
  createSingleSettlementGuard,
  nextWorkerRestartCount,
  resolveShutdownTimeout,
} from './cluster-pool.js'

describe('ClusterPool retry and timeout policy', () => {
  it('caps consecutive worker restarts until meaningful work resets the counter', () => {
    expect(nextWorkerRestartCount(0, 2)).toBe(1)
    expect(nextWorkerRestartCount(1, 2)).toBe(2)
    expect(nextWorkerRestartCount(2, 2)).toBeNull()
  })

  it('uses the configured worker timeout with safe shutdown bounds', () => {
    expect(resolveShutdownTimeout(500)).toBe(1000)
    expect(resolveShutdownTimeout(4500)).toBe(4500)
    expect(resolveShutdownTimeout(30_000)).toBe(10_000)
  })

  it('keeps media task timeout independent from worker startup timeout', () => {
    const defaults = new ClusterPool<number>({
      concurrency: 1,
      totalTasks: 1,
      timeout: 30_000,
    }) as unknown as { taskTimeout: number; timeout: number }
    const configured = new ClusterPool<number>({
      concurrency: 1,
      totalTasks: 1,
      timeout: 10_000,
      taskTimeout: 45_000,
    }) as unknown as { taskTimeout: number; timeout: number }

    expect(defaults.timeout).toBe(30_000)
    expect(defaults.taskTimeout).toBe(120_000)
    expect(configured.timeout).toBe(10_000)
    expect(configured.taskTimeout).toBe(45_000)
  })

  it('settles worker startup once when online, error and exit events race', () => {
    const settle = createSingleSettlementGuard()
    const online = vi.fn()
    const error = vi.fn()
    const exit = vi.fn()

    expect(settle(online)).toBe(true)
    expect(settle(error)).toBe(false)
    expect(settle(exit)).toBe(false)
    expect(online).toHaveBeenCalledOnce()
    expect(error).not.toHaveBeenCalled()
    expect(exit).not.toHaveBeenCalled()
  })

  it('settles one task exactly once for a single batch-result message', () => {
    const onTaskCompleted = vi.fn()
    const pool = new ClusterPool<number>({
      concurrency: 1,
      totalTasks: 1,
      onTaskCompleted,
    })
    const task = { taskIndex: 0, attempts: 0 }
    const internal = pool as unknown as {
      completedTasks: number
      handleWorkerIpcMessage: (
        workerId: number,
        message: { type: 'batch-result'; results: Array<{ type: 'result'; taskId: string; result: number }> },
      ) => void
      pendingTasks: Map<string, typeof task>
      workerPendingTasks: Map<number, Map<string, typeof task>>
      workerStats: Map<number, { workerId: number; processedTasks: number; isIdle: boolean; isReady: boolean }>
      workerTaskCounts: Map<number, number>
    }

    internal.workerStats.set(1, { workerId: 1, processedTasks: 0, isIdle: false, isReady: true })
    internal.pendingTasks.set('task-1', task)
    internal.workerPendingTasks.set(1, new Map([['task-1', task]]))
    internal.workerTaskCounts.set(1, 1)

    internal.handleWorkerIpcMessage(1, {
      type: 'batch-result',
      results: [{ type: 'result', taskId: 'task-1', result: 42 }],
    })

    expect(onTaskCompleted).toHaveBeenCalledTimes(1)
    expect(internal.completedTasks).toBe(1)
  })
})
