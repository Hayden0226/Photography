import './styles/index.css'

import { createRoot } from 'react-dom/client'
import { RouterProvider } from 'react-router'

import { router } from './router'

if (import.meta.env.DEV) {
  const { start } = await import('react-scan')
  start()
}

createRoot(document.querySelector('#root')!).render(<RouterProvider router={router} />)
const SPLASH_MIN_DURATION_MS = 2000
const SPLASH_FADE_MS = 500

const splash = document.getElementById('splash-screen')

if (splash) {
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  const remaining = Math.max(0, (reduceMotion ? 300 : SPLASH_MIN_DURATION_MS) - performance.now())

  const fadeOutSplash = () => {
    splash.classList.add('splash-screen-exit')
    window.setTimeout(() => splash.remove(), SPLASH_FADE_MS)
  }

  window.setTimeout(fadeOutSplash, remaining)
}
