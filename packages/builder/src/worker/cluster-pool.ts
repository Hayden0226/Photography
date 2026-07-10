/* eslint-disable unicorn/prefer-event-target */
import type { Worker } from 'node:cluster'
import cluster from 'node:cluster'
import { EventEmitter } from 'node:events'
import process from 'node:process'
import { serialize } from 'node:v8'

import type { Logger } from '../logger/index.js'
import { logger } from '../logger/index.js'
import type { BuilderConfig } from '../types/config.js'
import type { TaskCompletedPayload } from './pool.js'

export interface ClusterPoolOptions<T> {
  concurrency: number
  totalTasks: number
  workerEnv?: Record<string, string> // 传递给 worker 的环境变量
  workerConcurrency?: number // 每个 worker 内部的并发数
  timeout?: number // worker 启动超时
  taskTimeout?: number // 一批媒体任务的处理超时
  maxRetries?: number // worker/task 失败后的最大重试次数
  // 新增：传递给 worker 的共享数据
  sharedData?: {
    existingManifestMap: Map<string, any>
    livePhotoMap: Map<string, any>
    imageObjects: any[]
    builderConfig: BuilderConfig
  }
  onTaskCompleted?: (payload: TaskCompletedPayload<T>) => void
}

interface QueuedTask {
  taskIndex: number
  attempts: number
}

export function nextWorkerRestartCount(current: number, maxRetries: number): number | null {
  const next = current + 1
  return next > maxRetries ? null : next
}

export function resolveShutdownTimeout(workerTimeout: number): number {
  return Math.min(10_000, Math.max(1000, workerTimeout))
}

/** Ensure worker startup resolves or rejects exactly once across racing events. */
export function createSingleSettlementGuard(): (settle: () => void) => boolean {
  let settled = false

  return (settle) => {
    if (settled) return false
    settled = true
    settle()
    return true
  }
}

export interface WorkerReadyMessage {
  type: 'ready' | 'pong'
  workerId: number
}

export interface TaskMessage {
  type: 'task'
  taskId: string
  taskIndex: number
  workerId: number
}

export interface BatchTaskMessage {
  type: 'batch-task'
  tasks: Array<{
    taskId: string
    taskIndex: number
  }>
  workerId: number
}

export interface TaskResult {
  type: 'result' | 'error'
  taskId: string
  result?: any
  error?: string
}

export interface BatchTaskResult {
  type: 'batch-result'
  results: TaskResult[]
}

export interface WorkerStats {
  workerId: number
  processedTasks: number
  isIdle: boolean
  isReady: boolean
}

export interface WorkerInitMessage {
  type: 'init'
  sharedData: {
    data: number[] // Buffer 转换为数组传输
    length: number
  }
}

// 基于 Node.js cluster 的 Worker 池管理器
export class ClusterPool<T> extends EventEmitter {
  private concurrency: number
  private totalTasks: number
  private workerEnv: Record<string, string>
  private workerConcurrency: number
  private timeout: number
  private taskTimeout: number
  private maxRetries: number
  private logger: Logger
  private sharedData?: ClusterPoolOptions<T>['sharedData']
  private onTaskCompleted?: (payload: TaskCompletedPayload<T>) => void

  private taskQueue: QueuedTask[] = []
  private workers = new Map<number, Worker>()
  private workerStats = new Map<number, WorkerStats>()
  private pendingTasks = new Map<string, QueuedTask>()
  private results: T[] = []
  private completedTasks = 0
  private isShuttingDown = false
  private readyWorkers = new Set<number>()
  private workerTaskCounts = new Map<number, number>() // 追踪每个 worker 当前正在处理的任务数
  private initializedWorkers = new Set<number>() // 追踪已初始化的 worker
  private workerPendingTasks = new Map<number, Map<string, QueuedTask>>()
  private workerRestartCounts = new Map<number, number>()
  private restartTimers = new Set<NodeJS.Timeout>()
  private workerStartupTimers = new Map<number, NodeJS.Timeout>()
  private workerTaskTimers = new Map<number, NodeJS.Timeout>()

  constructor(options: ClusterPoolOptions<T>) {
    super()
    this.concurrency = options.concurrency
    this.totalTasks = options.totalTasks
    this.workerEnv = options.workerEnv || {}
    this.workerConcurrency = options.workerConcurrency || 5 // 默认每个 worker 同时处理 5 个任务
    this.timeout = options.timeout ?? 30_000
    this.taskTimeout = options.taskTimeout ?? 120_000
    this.maxRetries = options.maxRetries ?? 2
    this.logger = logger
    this.sharedData = options.sharedData
    this.onTaskCompleted = options.onTaskCompleted

    this.results = Array.from({ length: this.totalTasks })
  }

  async execute(): Promise<T[]> {
    this.logger.main.info(`开始集群模式处理任务，进程数：${this.concurrency}，总任务数：${this.totalTasks}`)

    // 准备任务队列 - 只包含 taskIndex
    for (let i = 0; i < this.totalTasks; i++) {
      this.taskQueue.push({
        taskIndex: i,
        attempts: 0,
      })
    }

    // 先注册完成/错误监听器，避免极快 worker 在启动阶段丢失事件。
    const completion = new Promise<T[]>((resolve, reject) => {
      let isSettled = false

      this.once('allTasksCompleted', () => {
        if (isSettled) return
        isSettled = true
        this.logger.main.success(`所有任务完成，开始关闭进程池`)
        this.shutdown()
          .then(() => {
            resolve(this.results)
          })
          .catch(reject)
      })

      this.once('error', (error) => {
        if (isSettled) return
        isSettled = true
        this.shutdown()
          .catch((shutdownError) => {
            this.logger.main.warn('关闭进程池时出现错误：', shutdownError)
          })
          .finally(() => reject(error))
      })
    })

    try {
      await this.startWorkers()
    } catch (error) {
      await this.shutdown()
      throw error
    }

    return await completion
  }

  private async startWorkers(): Promise<void> {
    // 设置 cluster 环境变量以启用 worker 模式
    cluster.setupPrimary({
      exec: process.argv[1], // 使用当前脚本 (CLI) 作为 worker
      args: ['--cluster-worker'], // 传递 worker 标识参数
      silent: false,
    })

    // 根据任务数量和每个 worker 的并发能力决定启动多少个 worker
    // 需要的 worker 数 = Math.ceil(总任务数 / 每个 worker 并发数)
    // 但不能超过 concurrency 限制
    const requiredWorkers = Math.ceil(this.totalTasks / this.workerConcurrency)
    const workersToStart = Math.min(this.concurrency, requiredWorkers)

    this.logger.main.info(
      `计算 worker 数量：总任务 ${this.totalTasks}，每个 worker 并发 ${this.workerConcurrency}，需要 ${requiredWorkers} 个，实际启动 ${workersToStart} 个`,
    )

    const starts: Array<Promise<void>> = []
    for (let i = 1; i <= workersToStart; i++) {
      starts.push(this.createWorker(i))
    }
    await Promise.all(starts)
  }

  private async createWorker(workerId: number): Promise<void> {
    return new Promise((resolve, reject) => {
      const settleStartup = createSingleSettlementGuard()
      this.readyWorkers.delete(workerId)
      this.initializedWorkers.delete(workerId)
      this.workerPendingTasks.set(workerId, new Map())

      const worker = cluster.fork({
        WORKER_ID: workerId.toString(),
        CLUSTER_WORKER: 'true',
        WORKER_CONCURRENCY: this.workerConcurrency.toString(),
        ...this.workerEnv, // 传递自定义环境变量
      })

      this.workers.set(workerId, worker)
      this.workerStats.set(workerId, {
        workerId,
        processedTasks: 0,
        isIdle: true,
        isReady: false,
      })
      this.workerTaskCounts.set(workerId, 0) // 初始化任务计数

      const workerLogger = this.logger.worker(workerId)

      const startupTimer = setTimeout(() => {
        this.workerStartupTimers.delete(workerId)
        workerLogger.error(`Worker ${workerId} 初始化超时`)
        settleStartup(() => reject(new Error(`Worker ${workerId} 启动超时`)))
        worker.kill('SIGKILL')
      }, this.timeout)
      this.workerStartupTimers.set(workerId, startupTimer)

      worker.on('online', () => {
        workerLogger.start(`Worker ${workerId} 进程启动 (PID: ${worker.process?.pid})`)
        settleStartup(resolve)
      })

      worker.on(
        'message',
        (message: TaskResult | BatchTaskResult | WorkerReadyMessage | { type: 'init-complete'; workerId: number }) => {
          this.handleWorkerIpcMessage(workerId, message)
        },
      )

      worker.on('error', (error) => {
        workerLogger.error(`Worker ${workerId} 进程错误:`, error)
        settleStartup(() => reject(new Error(`Worker ${workerId} 启动失败`, { cause: error })))
        this.handleWorkerError(workerId, error)
      })

      worker.on('exit', (code, signal) => {
        if (!this.isShuttingDown) {
          workerLogger.error(`Worker ${workerId} 意外退出 (code: ${code}, signal: ${signal})`)
          settleStartup(() =>
            reject(new Error(`Worker ${workerId} 在启动完成前退出 (code: ${code}, signal: ${signal})`)),
          )
          this.workers.delete(workerId)
          this.clearWorkerTimers(workerId)
          this.readyWorkers.delete(workerId)
          this.initializedWorkers.delete(workerId)
          this.workerStats.delete(workerId)

          const pending = this.workerPendingTasks.get(workerId)
          const requeue = pending ? Array.from(pending.entries()) : []
          this.workerPendingTasks.delete(workerId)
          this.workerTaskCounts.set(workerId, 0)

          for (const [taskId, task] of requeue) {
            this.pendingTasks.delete(taskId)
            if (!this.retryTask(task, new Error(`Worker ${workerId} 意外退出`))) return
          }

          if (requeue.length > 0) {
            workerLogger.warn(`已将 ${requeue.length} 个未完成任务重新入队`)
          }

          this.scheduleWorkerRestart(workerId)
        } else {
          workerLogger.info(`Worker ${workerId} 正常退出`)
        }
      })
    })
  }

  private handleWorkerIpcMessage(
    workerId: number,
    message: TaskResult | BatchTaskResult | WorkerReadyMessage | { type: 'init-complete'; workerId: number },
  ): void {
    switch (message.type) {
      case 'ready':
      case 'pong': {
        this.handleWorkerReady(workerId, message)
        break
      }
      case 'init-complete': {
        this.handleWorkerInitComplete(workerId)
        break
      }
      case 'batch-result': {
        this.handleWorkerBatchResult(workerId, message)
        break
      }
      default: {
        this.handleWorkerMessage(workerId, message)
      }
    }
  }

  private handleWorkerReady(workerId: number, _message: WorkerReadyMessage): void {
    const stats = this.workerStats.get(workerId)
    const worker = this.workers.get(workerId)
    const workerLogger = this.logger.worker(workerId)

    if (stats && worker && !this.initializedWorkers.has(workerId)) {
      // 首次准备就绪时发送初始化数据，但不立即标记为 ready
      if (this.sharedData) {
        // 使用 v8.serialize 序列化数据以保持类型完整性
        const serializedBuffer = serialize({
          existingManifestMap: this.sharedData.existingManifestMap,
          livePhotoMap: this.sharedData.livePhotoMap,
          imageObjects: this.sharedData.imageObjects,
          builderConfig: this.sharedData.builderConfig,
        })

        // 将 Buffer 转换为数组以通过 IPC 传输
        const initMessage: WorkerInitMessage = {
          type: 'init',
          sharedData: {
            data: Array.from(serializedBuffer),
            length: serializedBuffer.length,
          },
        }
        worker.send(initMessage)
        workerLogger.info(`发送初始化数据到 Worker ${workerId}`)
      }

      this.initializedWorkers.add(workerId)
      workerLogger.info(`Worker ${workerId} 已接收初始化请求，等待初始化完成`)
    } else if (stats) {
      // 后续的 ready 消息（如 pong 响应）
      stats.isReady = true
      this.readyWorkers.add(workerId)
      workerLogger.info(`Worker ${workerId} 已准备就绪`)
      this.emit('workerReady', workerId)
    }
  }

  private handleWorkerInitComplete(workerId: number): void {
    const stats = this.workerStats.get(workerId)
    const workerLogger = this.logger.worker(workerId)

    if (stats) {
      const startupTimer = this.workerStartupTimers.get(workerId)
      if (startupTimer) clearTimeout(startupTimer)
      this.workerStartupTimers.delete(workerId)
      stats.isReady = true
      this.readyWorkers.add(workerId)
      workerLogger.info(`Worker ${workerId} 初始化完成，可以接受任务`)
      this.emit('workerReady', workerId)

      // 立即为这个 worker 分配任务
      this.assignBatchTasksToWorker(workerId)
    }
  }

  private assignBatchTasksToWorker(workerId: number): void {
    if (this.taskQueue.length === 0) return

    const worker = this.workers.get(workerId)
    const stats = this.workerStats.get(workerId)
    const currentTaskCount = this.workerTaskCounts.get(workerId) || 0

    // 确保 worker 已经完成初始化（包含在 initializedWorkers 中且 isReady 为 true）
    if (!worker || !stats || !stats.isReady || !this.initializedWorkers.has(workerId)) return

    // 如果当前 worker 的任务数已达到并发限制，则不分配新任务
    if (currentTaskCount >= this.workerConcurrency) return

    // 计算可以分配的任务数量
    const availableSlots = this.workerConcurrency - currentTaskCount
    const tasksToAssign = Math.min(availableSlots, this.taskQueue.length)

    if (tasksToAssign === 0) return

    // 分配一批任务
    const tasks: Array<{ taskId: string; taskIndex: number }> = []
    const workerPending = this.workerPendingTasks.get(workerId) || new Map<string, QueuedTask>()
    this.workerPendingTasks.set(workerId, workerPending)

    for (let i = 0; i < tasksToAssign; i++) {
      const task = this.taskQueue.shift()
      if (!task) break

      const taskId = `${workerId}-${task.taskIndex}-${Date.now()}-${i}`
      tasks.push({
        taskId,
        taskIndex: task.taskIndex,
      })

      // 设置待处理任务的 Promise
      this.pendingTasks.set(taskId, task)

      // 标记该任务分配给此 worker
      workerPending.set(taskId, task)
    }

    // 更新 worker 状态
    this.workerTaskCounts.set(workerId, currentTaskCount + tasks.length)
    stats.isIdle = tasks.length === 0

    // 发送批量任务
    const message: BatchTaskMessage = {
      type: 'batch-task',
      tasks,
      workerId,
    }

    worker.send(message)
    this.armWorkerTaskTimeout(workerId)

    const workerLogger = this.logger.worker(workerId)
    workerLogger.info(
      `分配 ${tasks.length} 个任务 (当前处理中：${currentTaskCount + tasks.length}/${this.workerConcurrency})`,
    )
  }

  private handleWorkerBatchResult(workerId: number, message: BatchTaskResult): void {
    const stats = this.workerStats.get(workerId)
    const workerLogger = this.logger.worker(workerId)
    const currentTaskCount = this.workerTaskCounts.get(workerId) || 0

    if (!stats) return
    this.clearWorkerTaskTimeout(workerId)

    let completedInBatch = 0
    let successfulInBatch = 0

    // 处理批量结果中的每个任务
    for (const taskResult of message.results) {
      const task = this.pendingTasks.get(taskResult.taskId)
      if (!task) {
        workerLogger.warn(`收到未知任务结果：${taskResult.taskId}`)
        continue
      }

      this.pendingTasks.delete(taskResult.taskId)
      // 从 worker 待处理集合移除
      const workerPending = this.workerPendingTasks.get(workerId)
      if (workerPending) workerPending.delete(taskResult.taskId)
      completedInBatch++

      if (taskResult.type === 'result' && taskResult.result !== undefined) {
        // 从 taskId 中提取 taskIndex
        const { taskIndex } = task
        this.results[taskIndex] = taskResult.result
        successfulInBatch++
        this.workerRestartCounts.set(workerId, 0)

        this.completedTasks++

        this.onTaskCompleted?.({
          taskIndex,
          completed: this.completedTasks,
          total: this.totalTasks,
          result: taskResult.result as T,
        })
      } else if (taskResult.type === 'error') {
        workerLogger.error(`任务执行失败：${taskResult.taskId}`, taskResult.error)
        const error = new Error(taskResult.error || `Worker ${workerId} task failed`)
        if (!this.retryTask(task, error)) return
      }
    }

    // 更新 worker 状态
    const newTaskCount = Math.max(0, currentTaskCount - completedInBatch)
    this.workerTaskCounts.set(workerId, newTaskCount)
    stats.processedTasks += successfulInBatch
    stats.isIdle = newTaskCount === 0

    workerLogger.info(
      `完成批量任务：${successfulInBatch}/${completedInBatch} 成功 (总完成：${this.completedTasks}/${this.totalTasks}，当前处理中：${newTaskCount})`,
    )

    // 检查是否所有任务都已完成
    if (this.completedTasks >= this.totalTasks) {
      this.emit('allTasksCompleted')
      return
    }

    // 为该 worker 分配下一批任务
    this.assignBatchTasksToWorker(workerId)
  }

  private handleWorkerMessage(workerId: number, message: TaskResult): void {
    const stats = this.workerStats.get(workerId)
    const workerLogger = this.logger.worker(workerId)
    const currentTaskCount = this.workerTaskCounts.get(workerId) || 0

    if (!stats) return
    this.clearWorkerTaskTimeout(workerId)

    const task = this.pendingTasks.get(message.taskId)
    if (!task) {
      workerLogger.warn(`收到未知任务结果：${message.taskId}`)
      return
    }

    this.pendingTasks.delete(message.taskId)
    const workerPending = this.workerPendingTasks.get(workerId)
    if (workerPending) workerPending.delete(message.taskId)

    // 更新任务计数
    const newTaskCount = Math.max(0, currentTaskCount - 1)
    this.workerTaskCounts.set(workerId, newTaskCount)
    stats.isIdle = newTaskCount === 0

    if (message.type === 'result' && message.result !== undefined) {
      // 从 taskId 中提取 taskIndex
      const { taskIndex } = task
      this.results[taskIndex] = message.result
      stats.processedTasks++
      this.workerRestartCounts.set(workerId, 0)

      this.completedTasks++
      this.onTaskCompleted?.({
        taskIndex,
        completed: this.completedTasks,
        total: this.totalTasks,
        result: message.result as T,
      })
      workerLogger.info(
        `完成任务 ${taskIndex + 1}/${this.totalTasks} (已完成：${this.completedTasks}，当前处理中：${newTaskCount})`,
      )

      // 检查是否所有任务都已完成
      if (this.completedTasks >= this.totalTasks) {
        this.emit('allTasksCompleted')
        return
      }
    } else if (message.type === 'error') {
      workerLogger.error(`任务执行失败：${message.taskId}`, message.error)
      const error = new Error(message.error || `Worker ${workerId} task failed`)
      if (!this.retryTask(task, error)) return
    }

    // 为该 worker 分配下一批任务
    this.assignBatchTasksToWorker(workerId)
  }

  private handleWorkerError(workerId: number, _error: Error): void {
    const stats = this.workerStats.get(workerId)
    if (stats) {
      stats.isIdle = true
    }

    this.readyWorkers.delete(workerId)
    const worker = this.workers.get(workerId)
    if (worker && !worker.isDead()) {
      worker.kill('SIGKILL')
    }
  }

  private retryTask(task: QueuedTask, error: Error): boolean {
    if (task.attempts >= this.maxRetries) {
      this.emit(
        'error',
        new Error(`任务 ${task.taskIndex + 1} 在 ${this.maxRetries + 1} 次尝试后仍失败`, { cause: error }),
      )
      return false
    }

    this.taskQueue.unshift({
      taskIndex: task.taskIndex,
      attempts: task.attempts + 1,
    })
    return true
  }

  private armWorkerTaskTimeout(workerId: number): void {
    this.clearWorkerTaskTimeout(workerId)
    const timer = setTimeout(() => {
      this.workerTaskTimers.delete(workerId)
      const pendingCount = this.workerPendingTasks.get(workerId)?.size ?? 0
      if (pendingCount === 0 || this.isShuttingDown) return

      this.logger.worker(workerId).error(`Worker ${workerId} 处理任务超时 (${this.taskTimeout}ms)`)
      const worker = this.workers.get(workerId)
      if (worker && !worker.isDead()) {
        worker.kill('SIGKILL')
      }
    }, this.taskTimeout)
    this.workerTaskTimers.set(workerId, timer)
  }

  private clearWorkerTaskTimeout(workerId: number): void {
    const timer = this.workerTaskTimers.get(workerId)
    if (timer) clearTimeout(timer)
    this.workerTaskTimers.delete(workerId)
  }

  private clearWorkerTimers(workerId: number): void {
    const startupTimer = this.workerStartupTimers.get(workerId)
    if (startupTimer) clearTimeout(startupTimer)
    this.workerStartupTimers.delete(workerId)
    this.clearWorkerTaskTimeout(workerId)
  }

  private scheduleWorkerRestart(workerId: number): void {
    if (this.isShuttingDown) return

    const previousRestartCount = this.workerRestartCounts.get(workerId) ?? 0
    const restartCount = nextWorkerRestartCount(previousRestartCount, this.maxRetries)
    if (restartCount === null) {
      this.emit('error', new Error(`Worker ${workerId} 连续重启失败 ${previousRestartCount} 次`))
      return
    }
    this.workerRestartCounts.set(workerId, restartCount)

    const timer = setTimeout(() => {
      this.restartTimers.delete(timer)
      void this.createWorker(workerId).catch((error) => {
        this.logger.worker(workerId).error(`Worker ${workerId} 重启失败`, error)
        this.scheduleWorkerRestart(workerId)
      })
    }, 1000)
    this.restartTimers.add(timer)
  }

  private async shutdown(): Promise<void> {
    this.isShuttingDown = true
    for (const timer of this.restartTimers) clearTimeout(timer)
    this.restartTimers.clear()
    for (const timer of this.workerStartupTimers.values()) clearTimeout(timer)
    this.workerStartupTimers.clear()
    for (const timer of this.workerTaskTimers.values()) clearTimeout(timer)
    this.workerTaskTimers.clear()
    const shutdownPromises: Promise<void>[] = []
    const shutdownTimeout = resolveShutdownTimeout(this.timeout)

    for (const [, worker] of this.workers) {
      shutdownPromises.push(
        new Promise((resolve) => {
          const timeout = setTimeout(() => {
            worker.kill('SIGKILL')
            resolve()
          }, shutdownTimeout)

          worker.on('exit', () => {
            clearTimeout(timeout)
            resolve()
          })

          // 发送关闭信号
          if (worker.isConnected()) {
            worker.send({ type: 'shutdown' })
          } else {
            worker.kill('SIGKILL')
          }
        }),
      )
    }

    await Promise.all(shutdownPromises)
    this.workers.clear()
    this.workerStats.clear()
    this.readyWorkers.clear()
    this.initializedWorkers.clear()
    this.workerPendingTasks.clear()
    this.pendingTasks.clear()
  }

  // 获取 worker 统计信息
  getWorkerStats(): WorkerStats[] {
    return Array.from(this.workerStats.values())
  }
}
