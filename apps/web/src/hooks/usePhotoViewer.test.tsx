import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { createStore, Provider, useSetAtom } from 'jotai'
import * as React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { gallerySettingAtom } from '~/atoms/app'
import { unlockBodyScroll } from '~/lib/body-scroll-lock'

import { useOpenPhotoViewer, usePhotoViewer } from './usePhotoViewer'

vi.mock('@afilmory/data', () => ({
  photoLoader: {
    getPhotos: () => [
      { id: 'newer', tags: ['keep'], sortTime: 2 },
      { id: 'older', tags: ['hide-current'], sortTime: 1 },
    ],
  },
}))

vi.mock('~/lib/body-scroll-lock', () => ({
  lockBodyScroll: vi.fn(),
  unlockBodyScroll: vi.fn(),
}))

vi.mock('~/lib/tracker', () => ({
  trackView: vi.fn(),
}))

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('photo viewer state subscriptions', () => {
  it('does not re-render a write-only gallery card when the viewer opens, navigates, or closes', () => {
    let cardRenderCount = 0

    const GalleryCard = () => {
      cardRenderCount++
      const { openViewerByPhotoId } = useOpenPhotoViewer()

      return (
        <button type="button" onClick={() => openViewerByPhotoId('newer')}>
          Open photo
        </button>
      )
    }

    const ViewerControls = () => {
      const { closeViewer, currentIndex, goToIndex, isOpen } = usePhotoViewer()

      return (
        <div>
          <output>{isOpen ? `open:${currentIndex}` : 'closed'}</output>
          <button type="button" onClick={() => goToIndex(1)}>
            Next photo
          </button>
          <button type="button" onClick={closeViewer}>
            Close viewer
          </button>
        </div>
      )
    }

    render(
      <Provider store={createStore()}>
        <GalleryCard />
        <ViewerControls />
      </Provider>,
    )

    expect(cardRenderCount).toBe(1)
    fireEvent.click(screen.getByRole('button', { name: 'Open photo' }))
    expect(screen.queryByText('open:0')).not.toBeNull()
    expect(cardRenderCount).toBe(1)

    fireEvent.click(screen.getByRole('button', { name: 'Next photo' }))
    expect(screen.queryByText('open:1')).not.toBeNull()
    expect(cardRenderCount).toBe(1)

    fireEvent.click(screen.getByRole('button', { name: 'Close viewer' }))
    expect(screen.queryByText('closed')).not.toBeNull()
    expect(cardRenderCount).toBe(1)
  })

  it('keeps the selected photo by id across sorting and closes when filtering removes it', () => {
    const GalleryControls = () => {
      const setGallerySetting = useSetAtom(gallerySettingAtom)
      const { openViewerByPhotoId } = useOpenPhotoViewer()
      const { currentIndex, currentPhotoId, isOpen } = usePhotoViewer()

      return (
        <div>
          <output>{isOpen ? `open:${currentPhotoId}:${currentIndex}` : 'closed'}</output>
          <button type="button" onClick={() => openViewerByPhotoId('newer')}>
            Open newer photo
          </button>
          <button type="button" onClick={() => setGallerySetting((setting) => ({ ...setting, sortOrder: 'asc' }))}>
            Reverse sort
          </button>
          <button
            type="button"
            onClick={() => setGallerySetting((setting) => ({ ...setting, selectedTags: ['hide-current'] }))}
          >
            Hide current photo
          </button>
        </div>
      )
    }

    render(
      <Provider store={createStore()}>
        <GalleryControls />
      </Provider>,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Open newer photo' }))
    expect(screen.queryByText('open:newer:0')).not.toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Reverse sort' }))
    expect(screen.queryByText('open:newer:1')).not.toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Hide current photo' }))
    expect(screen.queryByText('closed')).not.toBeNull()
    expect(unlockBodyScroll).toHaveBeenCalledTimes(1)
  })
})
