import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { brotliCompressSync, gzipSync } from 'node:zlib'

interface BudgetTarget {
  name: string
  pattern: RegExp
  budget: {
    gzip: number
    brotli: number
  }
}

const KiB = 1024

const targets: BudgetTarget[] = [
  {
    name: 'main',
    pattern: /^assets\/index-[\w-]+\.js$/,
    budget: { gzip: 220 * KiB, brotli: 190 * KiB },
  },
  {
    name: 'photo-viewer',
    pattern: /^assets\/PhotoViewer-[\w-]+\.js$/,
    budget: { gzip: 90 * KiB, brotli: 80 * KiB },
  },
  {
    name: 'maplibre',
    pattern: /^assets\/maplibre-gl-[\w-]+\.js$/,
    budget: { gzip: 360 * KiB, brotli: 320 * KiB },
  },
  {
    name: 'reaction',
    pattern: /^assets\/Reaction-[\w-]+\.js$/,
    budget: { gzip: 90 * KiB, brotli: 80 * KiB },
  },
]

const distDir = path.resolve(process.cwd(), 'apps/web/dist')

if (!existsSync(distDir)) {
  throw new Error('Bundle budget check requires apps/web/dist. Run pnpm build first.')
}

const files = listFiles(distDir)
const rows: Array<Record<string, string>> = []
const failures: string[] = []

for (const target of targets) {
  const candidates = files.filter((file) => target.pattern.test(file))
  const selected = candidates
    .map((file) => ({ file, size: statSync(path.join(distDir, file)).size }))
    .toSorted((a, b) => b.size - a.size)[0]

  if (!selected) {
    failures.push(`Missing bundle target: ${target.name}`)
    continue
  }

  const source = readFileSync(path.join(distDir, selected.file))
  const gzipSize = gzipSync(source).byteLength
  const brotliSize = brotliCompressSync(source).byteLength

  rows.push({
    target: target.name,
    file: selected.file,
    raw: formatBytes(source.byteLength),
    gzip: `${formatBytes(gzipSize)} / ${formatBytes(target.budget.gzip)}`,
    brotli: `${formatBytes(brotliSize)} / ${formatBytes(target.budget.brotli)}`,
  })

  if (gzipSize > target.budget.gzip) {
    failures.push(`${target.name} gzip ${formatBytes(gzipSize)} exceeds ${formatBytes(target.budget.gzip)}`)
  }

  if (brotliSize > target.budget.brotli) {
    failures.push(`${target.name} brotli ${formatBytes(brotliSize)} exceeds ${formatBytes(target.budget.brotli)}`)
  }
}

console.info(formatRows(rows))

if (failures.length > 0) {
  throw new Error(failures.join('\n'))
}

function listFiles(directory: string, base = directory): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const fullPath = path.join(directory, entry)
    const relativePath = path.relative(base, fullPath).replaceAll(path.sep, '/')
    if (statSync(fullPath).isDirectory()) {
      return listFiles(fullPath, base)
    }

    return relativePath
  })
}

function formatBytes(value: number) {
  return `${(value / KiB).toFixed(1)} KiB`
}

function formatRows(rows: Array<Record<string, string>>) {
  return rows
    .map((row) => `${row.target}: ${row.raw} raw, ${row.gzip} gzip, ${row.brotli} brotli (${row.file})`)
    .join('\n')
}
