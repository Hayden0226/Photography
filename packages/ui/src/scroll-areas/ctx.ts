import { createContext } from 'react'

export type ScrollElement = HTMLElement | Window

export const ScrollElementContext = createContext<ScrollElement | null>(typeof window === 'undefined' ? null : window)
