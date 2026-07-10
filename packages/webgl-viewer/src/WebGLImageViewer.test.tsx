// @vitest-environment jsdom

import { act, render, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { WebGLImageViewer } from './WebGLImageViewer'

const engineMocks = vi.hoisted(() => ({
  destroy: vi.fn(),
  isTileOutlineEnabled: vi.fn(() => false),
  loadImage: vi.fn(),
}))

vi.mock('./WebGLImageViewerEngine', () => {
  function MockWebGLImageViewerEngine() {
    return engineMocks
  }

  return { WebGLImageViewerEngine: MockWebGLImageViewerEngine }
})

describe('WebGLImageViewer', () => {
  beforeEach(() => {
    engineMocks.destroy.mockClear()
    engineMocks.isTileOutlineEnabled.mockClear()
    engineMocks.loadImage.mockReset()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('reports asynchronous image loading failures to its consumer', async () => {
    const loadError = new Error('CORS blocked the original image')
    const onError = vi.fn()
    engineMocks.loadImage.mockRejectedValueOnce(loadError)
    vi.spyOn(console, 'error').mockImplementation(() => {})

    render(<WebGLImageViewer src="https://photos.example/original.jpg" onImageLoadError={onError} />)

    await waitFor(() => {
      expect(onError).toHaveBeenCalledWith(loadError)
    })
  })

  it('ignores a pending load failure after the viewer unmounts', async () => {
    let rejectLoad: (error: Error) => void = () => {}
    const onError = vi.fn()
    engineMocks.loadImage.mockReturnValueOnce(
      new Promise<void>((_resolve, reject) => {
        rejectLoad = reject
      }),
    )
    vi.spyOn(console, 'error').mockImplementation(() => {})

    const { unmount } = render(
      <WebGLImageViewer src="https://photos.example/original.jpg" onImageLoadError={onError} />,
    )
    unmount()

    await act(async () => {
      rejectLoad(new Error('late load failure'))
      await Promise.resolve()
    })

    expect(onError).not.toHaveBeenCalled()
  })
})
