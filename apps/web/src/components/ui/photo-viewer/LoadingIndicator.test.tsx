// @vitest-environment jsdom
import { render } from '@testing-library/react'
import * as React from 'react'
import { describe, expect, it, vi } from 'vitest'

import type { LoadingIndicatorRef } from './LoadingIndicator'
import { LoadingIndicator } from './LoadingIndicator'

vi.mock('react-i18next', () => ({
  ['useTranslation']: () => ({
    t: (key: string) => key,
  }),
}))

describe('LoadingIndicator', () => {
  it('hides image progress until a positive percent is available', () => {
    let indicatorRef: LoadingIndicatorRef | null = null
    const setIndicatorRef: React.RefCallback<LoadingIndicatorRef> = (instance) => {
      indicatorRef = instance
    }
    const { container } = render(<LoadingIndicator ref={setIndicatorRef} />)

    React.act(() => {
      indicatorRef?.updateLoadingState({
        isVisible: true,
        loadingProgress: 0,
        loadedBytes: 0,
        totalBytes: 0,
      })
    })

    expect(container.textContent).toContain('loading.default')
    expect(container.textContent).not.toContain('0%')

    React.act(() => {
      indicatorRef?.updateLoadingState({
        loadingProgress: 0,
        loadedBytes: 0,
        totalBytes: 1_000_000,
      })
    })

    expect(container.textContent).not.toContain('0%')

    React.act(() => {
      indicatorRef?.updateLoadingState({
        loadingProgress: 12.4,
        loadedBytes: 124_000,
        totalBytes: 1_000_000,
      })
    })

    expect(container.textContent).toContain('12%')
  })
})
