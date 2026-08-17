import { execFileSync, spawn } from 'node:child_process'
import { readdir } from 'node:fs/promises'
import path from 'node:path'
import readline from 'node:readline/promises'

import consola from 'consola'
import type {Tags} from 'exiftool-vendored';
import { exiftool  } from 'exiftool-vendored'

const PHOTOS_ROOT = path.resolve(process.cwd(), process.env.AFILMORY_PHOTOS_PATH || 'photos')
const PROCESSED_MARKER = 'afilmory.gps.obfuscated.v1'

/** 模糊化网格：0.05° ≈ 5km，城市级 */
const GRID_SIZE = 0.05
/** 随机偏移范围（±0.025°），让同城照片不重叠在同一点 */
const OFFSET_RANGE = 0.05
/** 海拔模糊粒度：50m */
const ALTITUDE_ROUND = 50

const PHOTO_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.heic'])

interface GpsPhoto {
  filePath: string
  relPath: string
  lat: number
  lon: number
  alt: number | null
  processed: boolean
  takenAt: string
}

async function main() {
  const args = new Set(process.argv.slice(2))
  const allMode = args.has('--all')
  const force = args.has('--force')

  try {
    const relPaths = await collectCandidates(allMode)
    if (relPaths.length === 0) {
      consola.info(
        allMode ? 'photos 目录下没有图片文件' : '没有检测到新增照片（git 未跟踪的图片文件）。处理历史照片请使用 --all',
      )
      return
    }

    const gpsPhotos = await scanGps(relPaths)
    const pending = gpsPhotos.filter((photo) => force || !photo.processed)
    const skipped = gpsPhotos.length - pending.length

    if (pending.length === 0) {
      consola.info(
        `没有需要处理的照片（带 GPS ${gpsPhotos.length} 张，其中已处理 ${skipped} 张）。如需强制重新处理请加 --force`,
      )
      return
    }
    if (skipped > 0) consola.info(`已跳过 ${skipped} 张已处理过的照片（--force 可强制重新处理）`)

    const selected = await interactiveSelect(pending)
    if (selected.length === 0) {
      consola.info('未选择任何照片，退出')
      return
    }

    if (!(await confirm(selected.length))) {
      consola.info('已取消')
      return
    }

    const failures: Error[] = []
    let processed = 0
    for (const photo of selected) {
      try {
        await obfuscateGps(photo)
        processed++
        consola.success(`已处理: ${photo.relPath}`)
      } catch (error) {
        const normalized = error instanceof Error ? error : new Error(String(error))
        failures.push(normalized)
        consola.error(`处理失败: ${photo.relPath}: ${normalized.message}`)
      }
    }

    consola.info(`隐私处理完成：成功 ${processed} 张，失败 ${failures.length} 张`)
    if (failures.length > 0) process.exitCode = 1
  } catch (error) {
    consola.error('隐私处理流程失败:', error)
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

async function collectCandidates(allMode: boolean): Promise<string[]> {
  const relPaths = allMode ? await walkAll() : collectUntracked()
  return [...new Set(relPaths)].sort((a, b) => a.localeCompare(b, 'zh-CN'))
}

async function walkAll(): Promise<string[]> {
  const files: string[] = []

  const visit = async (relDir: string) => {
    const absDir = path.join(PHOTOS_ROOT, relDir)
    const entries = await readdir(absDir, { withFileTypes: true })
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue
      if (relDir === '' && entry.name === 'incoming') continue
      if (entry.isDirectory()) {
        await visit(path.join(relDir, entry.name))
      } else if (entry.isFile() && isPhotoFile(entry.name)) {
        files.push(relDir ? `${relDir}/${entry.name}` : entry.name)
      }
    }
  }

  await visit('')
  return files
}

function collectUntracked(): string[] {
  try {
    const out = execFileSync(
      'git',
      ['-C', PHOTOS_ROOT, '-c', 'core.quotepath=false', 'status', '--porcelain', '-uall', '-z'],
      { encoding: 'utf8' },
    )
    const files: string[] = []
    for (const record of out.split('\0')) {
      if (!record || !record.startsWith('?? ')) continue
      const rel = record.slice(3).replaceAll('\\', '/')
      if (rel.startsWith('incoming/') || rel.startsWith('.') || rel.split('/').some((part) => part.startsWith('.'))) {
        continue
      }
      if (isPhotoFile(rel)) files.push(rel)
    }
    return files
  } catch {
    throw new Error('无法读取 photos 仓库的 git 状态，请确认 photos 是 git 仓库；处理全部照片请改用 --all')
  }
}

function isPhotoFile(name: string): boolean {
  return PHOTO_EXTENSIONS.has(path.extname(name).toLowerCase())
}

async function scanGps(relPaths: string[]): Promise<GpsPhoto[]> {
  const results: GpsPhoto[] = []
  const chunkSize = 8

  for (let i = 0; i < relPaths.length; i += chunkSize) {
    const chunk = relPaths.slice(i, i + chunkSize)
    const batch = await Promise.all(
      chunk.map(async (relPath): Promise<GpsPhoto | null> => {
        const filePath = path.join(PHOTOS_ROOT, relPath)
        try {
          const tags = await exiftool.read(filePath)
          const lat = Number(tags.GPSLatitude)
          const lon = Number(tags.GPSLongitude)
          if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat === 0 || lon === 0) return null

          const rawAlt = tags.GPSAltitude
          const alt = rawAlt == null ? null : Number(rawAlt)
          return {
            filePath,
            relPath,
            lat,
            lon,
            alt: alt != null && Number.isFinite(alt) ? alt : null,
            processed: String(tags.GPSProcessingMethod ?? '').includes('afilmory.gps.obfuscated'),
            takenAt: formatTakenAt(tags),
          }
        } catch {
          consola.warn(`读取 EXIF 失败，已跳过: ${relPath}`)
          return null
        }
      }),
    )
    results.push(...batch.filter((photo): photo is GpsPhoto => photo !== null))
  }

  return results
}

function formatTakenAt(tags: Tags): string {
  const raw = tags.DateTimeOriginal ?? tags.GPSDateTime ?? tags.CreateDate
  if (raw == null) return ''
  try {
    let date: Date | null = null
    if (typeof raw === 'string') {
      date = new Date(raw)
    } else if (raw instanceof Date) {
      date = raw
    } else if (typeof (raw as { toDate?: () => Date }).toDate === 'function') {
      date = (raw as { toDate: () => Date }).toDate()
    }
    if (date && !Number.isNaN(date.getTime())) return date.toISOString().slice(0, 16).replace('T', ' ')
  } catch {
    // 忽略无法解析的时间
  }
  return ''
}

async function interactiveSelect(photos: GpsPhoto[]): Promise<GpsPhoto[]> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  const selected = new Set<number>()

  consola.info(`共 ${photos.length} 张照片带 GPS：`)
  photos.forEach((photo, index) => {
    const coord = `${photo.lat.toFixed(4)}, ${photo.lon.toFixed(4)}`
    const taken = photo.takenAt ? `(${photo.takenAt})  ` : ''
    const suffix = photo.processed ? '（已处理）' : ''
    console.info(`  [${String(index + 1).padStart(2, ' ')}] ${photo.relPath}  ${taken}(${coord})${suffix}`)
  })

  try {
    while (true) {
      const raw = await rl.question(
        `选择（1,3,5-7 / a=全选 / c=清除 / p3=预览第3张 / 回车=确认 / q=退出）[已选 ${selected.size} 张]: `,
      )
      const answer = (raw ?? '').trim()

      if (answer === '') {
        if (selected.size === 0) {
          consola.warn('尚未选择任何照片，请先输入编号或 a')
          continue
        }
        break
      }

      const lower = answer.toLowerCase()
      if (lower === 'q') return []
      if (lower === 'a') {
        photos.forEach((_, index) => selected.add(index))
        consola.success(`已全选 ${photos.length} 张`)
        continue
      }
      if (lower === 'c') {
        selected.clear()
        consola.info('已清除选择')
        continue
      }

      const preview = lower.match(/^p(\d+)$/)
      if (preview) {
        const index = Number(preview[1]) - 1
        if (index >= 0 && index < photos.length) {
          consola.info(`正在打开预览: ${photos[index].relPath}`)
          openInViewer(photos[index].filePath)
        } else {
          consola.warn(`编号超出范围：${preview[1]}`)
        }
        continue
      }

      if (/^[\d,\s-]+$/.test(answer)) {
        const before = selected.size
        for (const token of answer.split(',')) {
          const trimmed = token.trim()
          if (!trimmed) continue
          const range = trimmed.match(/^(\d+)\s*-\s*(\d+)$/)
          if (range) {
            const start = Number(range[1])
            const end = Number(range[2])
            for (let i = Math.min(start, end); i <= Math.max(start, end); i++) {
              if (i >= 1 && i <= photos.length) selected.add(i - 1)
            }
          } else if (/^\d+$/.test(trimmed)) {
            const index = Number(trimmed)
            if (index >= 1 && index <= photos.length) selected.add(index - 1)
          } else {
            consola.warn(`无法识别的编号：${trimmed}`)
          }
        }
        if (selected.size > before) consola.success(`当前已选 ${selected.size} 张`)
        else consola.warn('未新增选择，请检查编号')
        continue
      }

      consola.warn('无法识别输入，请输入编号（如 1,3,5-7）、a、c、p3、回车或 q')
    }
  } finally {
    rl.close()
  }

  return photos.filter((_, index) => selected.has(index))
}

async function confirm(count: number): Promise<boolean> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  try {
    const raw = await rl.question(
      `将处理 ${count} 张照片：GPS 将模糊化到约 5km 城市级，方向等辅助字段将删除，不可逆且不保留备份。确认执行？[y/N] `,
    )
    return ['y', 'yes'].includes((raw ?? '').trim().toLowerCase())
  } finally {
    rl.close()
  }
}

function openInViewer(filePath: string) {
  const command = process.platform === 'win32' ? 'explorer.exe' : process.platform === 'darwin' ? 'open' : 'xdg-open'
  const child = spawn(command, [filePath], { stdio: 'ignore', detached: true })
  child.on('error', () => consola.warn(`无法调用系统看图器（${command}）`))
  child.unref()
}

async function obfuscateGps(photo: GpsPhoto) {
  const newLat = gridObfuscate(photo.lat)
  const newLon = gridObfuscate(photo.lon)
  const newAlt = photo.alt == null ? null : Math.round(photo.alt / ALTITUDE_ROUND) * ALTITUDE_ROUND

  // 1. 先清空整个 GPS 组，确保不残留精确坐标与方向等辅助字段
  await exiftool.write(photo.filePath, {}, { writeArgs: ['-gps:all=', '-overwrite_original'] })

  // 2. 写回模糊化后的核心 GPS 字段，并写入已处理标记（用于幂等跳过）
  const tags: Record<string, unknown> = {
    GPSVersionID: '2.3.0.0',
    GPSLatitude: Math.abs(newLat),
    GPSLatitudeRef: newLat >= 0 ? 'N' : 'S',
    GPSLongitude: Math.abs(newLon),
    GPSLongitudeRef: newLon >= 0 ? 'E' : 'W',
    GPSProcessingMethod: PROCESSED_MARKER,
  }
  if (newAlt != null) {
    tags.GPSAltitude = Math.abs(newAlt)
    tags.GPSAltitudeRef = newAlt < 0 ? 1 : 0
  }
  await exiftool.write(photo.filePath, tags as Tags, { writeArgs: ['-overwrite_original'] })
}

function gridObfuscate(value: number): number {
  const grid = Math.round(value / GRID_SIZE) * GRID_SIZE
  const offset = (Math.random() - 0.5) * OFFSET_RANGE
  return Math.round((grid + offset) * 1e5) / 1e5
}

void main()
