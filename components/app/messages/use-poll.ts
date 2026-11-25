'use client'

import { useEffect, useRef } from 'react'

/**
 * Visibility-aware polling: calls `callback` every `intervalMs` while
 * `enabled` and the browser tab is visible; pauses in hidden tabs and
 * refreshes immediately when the tab becomes visible again.
 */
export function usePoll(callback: () => void, intervalMs: number, enabled: boolean) {
  const callbackRef = useRef(callback)

  useEffect(() => {
    callbackRef.current = callback
  })

  useEffect(() => {
    if (!enabled) return

    // fire immediately on mount — polls exist to keep data fresh, not to
    // delay the first load
    if (document.visibilityState === 'visible') callbackRef.current()

    let timer: number | null = null
    const start = () => {
      if (timer === null) timer = window.setInterval(() => {
        if (document.visibilityState === 'visible') callbackRef.current()
      }, intervalMs)
    }
    const stop = () => {
      if (timer !== null) {
        window.clearInterval(timer)
        timer = null
      }
    }

    start()
    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        callbackRef.current()
        start()
      } else {
        stop()
      }
    }
    document.addEventListener('visibilitychange', onVisibility)

    return () => {
      stop()
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [enabled, intervalMs])
}
