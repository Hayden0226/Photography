let lockCount = 0
let previousOverflow = ''

export function lockBodyScroll() {
  if (typeof document === 'undefined') return

  if (lockCount === 0) {
    previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
  }

  lockCount += 1
}

export function unlockBodyScroll() {
  if (typeof document === 'undefined' || lockCount === 0) return

  lockCount -= 1

  if (lockCount === 0) {
    document.body.style.overflow = previousOverflow
    previousOverflow = ''
  }
}

export function resetBodyScrollLocks() {
  lockCount = 0
  previousOverflow = ''

  if (typeof document !== 'undefined') {
    document.body.style.overflow = ''
  }
}
