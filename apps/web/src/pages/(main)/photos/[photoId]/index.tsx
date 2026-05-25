import { RootPortal, RootPortalProvider } from '@afilmory/ui'
import clsx from 'clsx'
import { lazy, Suspense, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { RemoveScroll } from 'react-remove-scroll'

import { NotFound } from '~/components/common/NotFound'
import { usePageMeta } from '~/hooks/usePageMeta'
import { useContextPhotos, usePhotoViewer } from '~/hooks/usePhotoViewer'
import { useTitle } from '~/hooks/useTitle'
import { deriveAccentFromSources } from '~/lib/color'
import { getLocalizedPhotoDescription, getPhotoAltText } from '~/lib/photo-description'
import { getPhotoDetailPath } from '~/lib/photo-route'

const PhotoViewer = lazy(() =>
  import('~/components/ui/photo-viewer/PhotoViewer').then((module) => ({ default: module.PhotoViewer })),
)

export const Component = () => {
  const photoViewer = usePhotoViewer()
  const photos = useContextPhotos()
  const { i18n } = useTranslation()

  const [ref, setRef] = useState<HTMLElement | null>(null)
  const rootPortalValue = useMemo(
    () => ({
      to: ref as HTMLElement,
    }),
    [ref],
  )
  const currentPhoto = photos[photoViewer.currentIndex]
  const pageTitle = currentPhoto?.title || currentPhoto?.id || 'Not Found'
  const pageDescription = currentPhoto ? getLocalizedPhotoDescription(currentPhoto, i18n.language) : ''

  useTitle(pageTitle)
  usePageMeta({
    title: currentPhoto ? pageTitle : undefined,
    description: pageDescription || undefined,
    image: currentPhoto?.thumbnailUrl || currentPhoto?.originalUrl,
    url: currentPhoto ? getPhotoDetailPath(currentPhoto.id) : undefined,
    type: currentPhoto?.mediaType === 'video' ? 'video.other' : 'article',
  })

  const [accentColor, setAccentColor] = useState<string | null>(null)

  useEffect(() => {
    const current = photos[photoViewer.currentIndex]
    if (!current) return

    let isCancelled = false
    let cssElement: HTMLStyleElement | null = null
    let cssRemovalTimer: ReturnType<typeof setTimeout> | null = null

    ;(async () => {
      try {
        const color = await deriveAccentFromSources({
          thumbHash: current.thumbHash,
          thumbnailUrl: current.thumbnailUrl,
        })
        if (!isCancelled) {
          cssElement = document.createElement('style')
          cssElement.textContent = `
         * {
             transition: color 0.2s ease-in-out, background-color 0.2s ease-in-out;
            }
          `
          document.head.append(cssElement)

          cssRemovalTimer = setTimeout(() => {
            cssElement?.remove()
            cssElement = null
            cssRemovalTimer = null
          }, 100)

          setAccentColor(color ?? null)
        }
      } catch {
        if (!isCancelled) setAccentColor(null)
      }
    })()

    return () => {
      isCancelled = true
      if (cssRemovalTimer) {
        clearTimeout(cssRemovalTimer)
      }
      cssElement?.remove()
    }
  }, [photoViewer.currentIndex, photos])

  if (!photos[photoViewer.currentIndex]) {
    return <NotFound />
  }

  return (
    <>
      <article className="sr-only" aria-labelledby="photo-detail-heading">
        <h1 id="photo-detail-heading">{pageTitle}</h1>
        {pageDescription && <p>{pageDescription}</p>}
        <p>{getPhotoAltText(currentPhoto, i18n.language)}</p>
      </article>

      <RootPortal>
        <RootPortalProvider value={rootPortalValue}>
          <RemoveScroll
            style={
              {
                ...(accentColor ? { '--color-accent': accentColor } : {}),
              } as React.CSSProperties
            }
            ref={setRef}
            className={clsx(photoViewer.isOpen ? 'fixed inset-0 z-9999' : 'pointer-events-none fixed inset-0 z-40')}
          >
            <Suspense fallback={null}>
              <PhotoViewer
                photos={photos}
                currentIndex={photoViewer.currentIndex}
                isOpen={photoViewer.isOpen}
                triggerElement={photoViewer.triggerElement}
                onClose={photoViewer.closeViewer}
                onIndexChange={photoViewer.goToIndex}
              />
            </Suspense>
          </RemoveScroll>
        </RootPortalProvider>
      </RootPortal>
    </>
  )
}
