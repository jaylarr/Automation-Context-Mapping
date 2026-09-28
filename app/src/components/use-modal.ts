'use client'

import { type RefObject, useEffect, useRef } from 'react'

/** Nested modals share one lock, so closing the inner one doesn't unlock the page. */
let locks = 0

function lock() {
  if (locks++ > 0) return
  const html = document.documentElement
  const scrollbar = window.innerWidth - html.clientWidth
  html.style.overflow = 'hidden'
  if (scrollbar > 0) html.style.paddingRight = `${scrollbar}px` // no layout jump when the scrollbar disappears
}

function unlock() {
  if (--locks > 0) return
  const html = document.documentElement
  html.style.overflow = ''
  html.style.paddingRight = ''
}

/** Stops the page behind a modal from scrolling while `active` (only the modal scrolls). */
export function useScrollLock(active = true) {
  useEffect(() => {
    if (!active) return
    lock()
    return unlock
  }, [active])
}

/**
 * Close a native <dialog> when the backdrop is clicked. Both press and release must land on the
 * backdrop, so selecting text inside and releasing outside doesn't close it.
 */
export function useBackdropClose(ref: RefObject<HTMLDialogElement | null>, onClose: () => void, enabled = true) {
  const downOnBackdrop = useRef(false)
  return {
    onMouseDown: (e: React.MouseEvent) => {
      downOnBackdrop.current = e.target === ref.current
    },
    onClick: (e: React.MouseEvent) => {
      if (enabled && downOnBackdrop.current && e.target === ref.current) onClose()
      downOnBackdrop.current = false
    },
  }
}
