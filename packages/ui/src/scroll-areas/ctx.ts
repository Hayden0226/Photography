import { createContext } from 'react'

export const ScrollElementContext = createContext<HTMLElement | null>(
  typeof document === 'undefined' ? null : document.documentElement,
)
