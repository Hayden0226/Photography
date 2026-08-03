import { createAppRouter } from './router-core'

const globTree = import.meta.glob([
  './pages/**/*.tsx',
  '!./pages/[(]debug[)]/**/*.tsx',
  '!./pages/[(]data[)]/manifest.tsx',
])

export const router = createAppRouter(globTree)
