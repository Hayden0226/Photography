import { use } from 'react'

import type { ScrollElement } from './ctx'
import { ScrollElementContext } from './ctx'

/**
 * Get the scroll area element when in radix scroll area
 * @returns
 */
export const useScrollViewElement = () => use(ScrollElementContext)

export const getScrollTop = (scrollElement: ScrollElement) =>
  'scrollY' in scrollElement ? scrollElement.scrollY : scrollElement.scrollTop
