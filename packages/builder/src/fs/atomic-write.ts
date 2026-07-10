import { randomUUID } from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'

export interface AtomicWriteOptions {
  /** Keep the previous complete file at `<target>.bak`. */
  backup?: boolean
  /** Validate the completed temporary file before it replaces the target. */
  validate?: (temporaryPath: string) => Promise<void>
}

function temporaryPathFor(targetPath: string, label: string): string {
  return path.join(path.dirname(targetPath), `.${path.basename(targetPath)}.${process.pid}.${randomUUID()}.${label}`)
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath)
    return true
  } catch {
    return false
  }
}

async function syncFile(filePath: string): Promise<void> {
  const handle = await fs.open(filePath, 'r')
  try {
    await handle.sync()
  } finally {
    await handle.close()
  }
}

/**
 * Write and validate a file in its destination directory, then atomically
 * replace the destination. A retained backup is itself installed by rename so
 * it can never be observed half-written.
 */
export async function atomicWriteFile(
  targetPath: string,
  data: string | NodeJS.ArrayBufferView,
  options: AtomicWriteOptions = {},
): Promise<void> {
  const directory = path.dirname(targetPath)
  const temporaryPath = temporaryPathFor(targetPath, 'tmp')
  const backupPath = `${targetPath}.bak`
  const temporaryBackupPath = temporaryPathFor(targetPath, 'bak.tmp')

  await fs.mkdir(directory, { recursive: true })

  try {
    await fs.writeFile(temporaryPath, data)
    await syncFile(temporaryPath)
    await options.validate?.(temporaryPath)

    if (options.backup && (await pathExists(targetPath))) {
      await fs.copyFile(targetPath, temporaryBackupPath)
      await syncFile(temporaryBackupPath)
      await fs.rename(temporaryBackupPath, backupPath)
    }

    await fs.rename(temporaryPath, targetPath)
  } finally {
    await Promise.all([fs.rm(temporaryPath, { force: true }), fs.rm(temporaryBackupPath, { force: true })])
  }
}
