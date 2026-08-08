import { mkdir, readdir, rename, stat } from 'node:fs/promises'
import path from 'node:path'

import consola from 'consola'
import { exiftool } from 'exiftool-vendored'

import { hasVisibleIncomingEntries } from './standardize-photos-policy'

const PHOTOS_ROOT = path.resolve(process.cwd(), process.env.AFILMORY_PHOTOS_PATH || 'photos')
const INCOMING_DIR = path.resolve(PHOTOS_ROOT, 'incoming')
const DEFAULT_TARGET_DIR = path.resolve(PHOTOS_ROOT, '随手')
const ALLOWED_MEDIA_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.heic', '.mov', '.mp4', '.webm', '.m4v'])

async function standardize() {
  const failures: Error[] = []

  try {
    const categories = await getCanonicalCategories()
    const categorySet = new Set(categories)

    await ensureIncomingCategoryDirectories(categories)

    // 1. 获取 incoming 目录下的所有子项（文件夹和文件）
    const incomingEntries = await readdir(INCOMING_DIR, { withFileTypes: true })

    // 分别处理文件夹和文件
    for (const entry of incomingEntries) {
      if (entry.name.startsWith('.')) continue // 跳过 .gitkeep 等隐藏文件

      if (entry.isDirectory()) {
        // 2a. 处理分类文件夹：photos/incoming/[Category] -> photos/[Category]
        const category = entry.name
        const categoryIncomingDir = path.join(INCOMING_DIR, category)
        if (!categorySet.has(category)) {
          const categoryEntries = await readdir(categoryIncomingDir, { withFileTypes: true })
          if (!hasVisibleIncomingEntries(categoryEntries)) {
            consola.info(`忽略没有可见内容的已移除 incoming 分类：${path.join('incoming', category)}`)
            continue
          }

          const error = new Error(
            `未知 incoming 分类：${path.join('incoming', category)}。请改名为现有分类之一：${categories.join(', ')}`,
          )
          consola.error(error.message)
          failures.push(error)
          continue
        }

        const targetDir = path.join(PHOTOS_ROOT, category)

        await processDirectory(categoryIncomingDir, targetDir, failures)
      } else if (entry.isFile()) {
        // 2b. 处理直接放在 incoming 根目录的文件 -> 默认移动到 photos/随手
        if (!isAllowedMediaFile(entry.name)) continue
        await processFileAndCollectFailure(path.join(INCOMING_DIR, entry.name), DEFAULT_TARGET_DIR, failures)
      }
    }

    if (failures.length > 0) {
      throw new AggregateError(failures, `标准化失败 ${failures.length} 项`)
    }
  } catch (err) {
    consola.error('标准化流程失败:', err)
    process.exitCode = 1
  } finally {
    try {
      await exiftool.end()
    } catch (error) {
      consola.error('关闭 ExifTool 失败:', error)
      process.exitCode = 1
    }
  }
}

async function getCanonicalCategories(): Promise<string[]> {
  const entries = await readdir(PHOTOS_ROOT, { withFileTypes: true })

  return entries
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'incoming')
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b, 'zh-CN'))
}

async function ensureIncomingCategoryDirectories(categories: string[]) {
  await mkdir(INCOMING_DIR, { recursive: true })

  for (const category of categories) {
    await mkdir(path.join(INCOMING_DIR, category), { recursive: true })
  }
}

/**
 * 处理一个目录下的所有图片
 */
async function processDirectory(sourceDir: string, targetDir: string, failures: Error[]) {
  const files = await readdir(sourceDir)
  const imageFiles = files.filter(isAllowedMediaFile)

  if (imageFiles.length === 0) return

  await mkdir(targetDir, { recursive: true })

  for (const file of imageFiles) {
    await processFileAndCollectFailure(path.join(sourceDir, file), targetDir, failures)
  }
}

async function processFileAndCollectFailure(filePath: string, targetDir: string, failures: Error[]): Promise<void> {
  try {
    await processSingleFile(filePath, targetDir)
  } catch (error) {
    const normalizedError = error instanceof Error ? error : new Error(String(error))
    consola.error(`处理文件 ${path.basename(filePath)} 出错:`, normalizedError)
    failures.push(normalizedError)
  }
}

/**
 * 处理单个文件：读取 EXIF、重命名、移动
 */
async function processSingleFile(filePath: string, targetDir: string) {
  const fileName = path.basename(filePath)
  const fileStat = await stat(filePath)

  consola.start(`正在处理: ${fileName}`)

  const tags = await exiftool.read(filePath)
  // 优先使用拍摄时间，其次是创建时间，最后是修改时间
  const date = tags.DateTimeOriginal || tags.CreateDate || tags.ModifyDate || fileStat.mtime

  let dateObj: Date
  if (typeof date === 'string') {
    dateObj = new Date(date)
  } else if (date instanceof Date) {
    dateObj = date
  } else if (date && typeof date === 'object' && 'toDate' in date) {
    // Handle ExifDateTime from exiftool-vendored
    dateObj = (date as { toDate: () => Date }).toDate()
  } else {
    dateObj = new Date(fileStat.mtime)
  }

  if (Number.isNaN(dateObj.getTime())) {
    throw new TypeError(`无法解析拍摄时间：${fileName}`)
  }

  const year = dateObj.getFullYear()
  const month = String(dateObj.getMonth() + 1).padStart(2, '0')
  const day = String(dateObj.getDate()).padStart(2, '0')
  const hour = String(dateObj.getHours()).padStart(2, '0')
  const minute = String(dateObj.getMinutes()).padStart(2, '0')
  const second = String(dateObj.getSeconds()).padStart(2, '0')

  const timestamp = `${year}${month}${day}${hour}${minute}${second}`
  const ext = path.extname(fileName).toLowerCase()
  let newFileName = `${timestamp}${ext}`
  let targetPath = path.join(targetDir, newFileName)

  // 如果文件名冲突，增加序号
  let counter = 1
  while (await fileExists(targetPath)) {
    newFileName = `${timestamp}_${counter}${ext}`
    targetPath = path.join(targetDir, newFileName)
    counter++
  }

  await mkdir(targetDir, { recursive: true })
  await rename(filePath, targetPath)
  consola.success(`已移动并重命名: ${fileName} -> ${path.join(path.basename(targetDir), newFileName)}`)
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await stat(filePath)
    return true
  } catch {
    return false
  }
}

function isAllowedMediaFile(fileName: string): boolean {
  return ALLOWED_MEDIA_EXTENSIONS.has(path.extname(fileName).toLowerCase())
}

void standardize()
