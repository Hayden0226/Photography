import { lazy, Suspense, useEffect, useState } from 'react'
import { Outlet, useLocation } from 'react-router'

import { useCanonical } from './hooks/useCanonical'
import { useCommandPaletteShortcut } from './hooks/useCommandPaletteShortcut'
import { RootProviders } from './providers/root-providers'

const CommandPalette = lazy(() =>
  import('./components/gallery/CommandPalette').then((module) => ({ default: module.CommandPalette })),
)

function App() {
  const { pathname } = useLocation()
  useCanonical(pathname)

  return (
    <RootProviders>
      <div className="lg:h-svh lg:overflow-hidden">
        <Outlet />
        <CommandPaletteContainer />
      </div>
    </RootProviders>
  )
}

const CommandPaletteContainer = () => {
  const { isOpen, setIsOpen } = useCommandPaletteShortcut()
  const [hasOpened, setHasOpened] = useState(false)

  useEffect(() => {
    if (isOpen) setHasOpened(true)
  }, [isOpen])

  if (!isOpen && !hasOpened) return null

  return (
    <Suspense fallback={null}>
      <CommandPalette isOpen={isOpen} onClose={() => setIsOpen(false)} />
    </Suspense>
  )
}
export default App
