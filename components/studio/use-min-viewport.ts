'use client'

import { useEffect, useState } from 'react'

/** SSR-safe matchMedia flag. Returns false until mounted so the workspace
 *  never renders on a narrow screen (Studio is desktop-first). */
export function useMinViewport(px: number): boolean {
  const [ok, setOk] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia(`(min-width: ${px}px)`)
    const update = () => setOk(mq.matches)
    update()
    mq.addEventListener('change', update)
    return () => mq.removeEventListener('change', update)
  }, [px])
  return ok
}
