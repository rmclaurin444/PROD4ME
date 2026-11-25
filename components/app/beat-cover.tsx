'use client'

import { useEffect, useRef, useState } from 'react'
import { ARTWORK_PRESETS } from './artwork-slot'

export function presetCss(id: string | null): string {
  return ARTWORK_PRESETS.find(p => p.id === id)?.css ?? ARTWORK_PRESETS[0].css
}

/** Video detection on the object key without query strings (presigned URLs
 *  carry ?X-Amz-… params). Only mp4/webm are accepted at upload. */
export function isVideoCover(url: string | null | undefined): boolean {
  if (!url) return false
  const path = url.split('?')[0]!
  return path.endsWith('.mp4') || path.endsWith('.webm')
}

function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    setReduced(mq.matches)
    const onChange = () => setReduced(mq.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])
  return reduced
}

/**
 * A beat's cover artwork — image, GIF, or VIDEO — rendered to fill its
 * container (the parent must size it; use `className`).
 *   variant="feed" — always autoplays video (TikTok feed behavior)
 *   variant="tile" — video plays only while the tile is on screen
 *                    (IntersectionObserver) and on hover; images lazy-load.
 * prefers-reduced-motion: videos never autoplay — the first frame shows
 * via the #t=0.1 media fragment (client-side only; never breaks presigned
 * URLs, which are signed on the query string).
 */
export function BeatCover({
  artUrl,
  artPreset,
  title,
  variant = 'tile',
  className = '',
}: {
  artUrl: string | null | undefined
  artPreset: string | null | undefined
  title: string
  variant?: 'feed' | 'tile'
  className?: string
}) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const [inView, setInView] = useState(false)
  const [hovered, setHovered] = useState(false)
  const reducedMotion = useReducedMotion()

  const isVideo = isVideoCover(artUrl)
  const tileWantsMotion = inView || hovered
  const shouldPlay = Boolean(
    isVideo && artUrl && !reducedMotion && (variant === 'feed' || tileWantsMotion)
  )

  // tiles: play only while visible on screen
  useEffect(() => {
    if (variant !== 'tile' || !isVideo) return
    const el = wrapRef.current
    if (!el) return
    const observer = new IntersectionObserver(
      entries => setInView(entries.some(entry => entry.isIntersecting)),
      { threshold: 0.4 }
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [variant, isVideo])

  // play/pause follows the desired state
  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    if (shouldPlay) {
      void video.play().catch(() => {})
    } else {
      video.pause()
      try {
        video.currentTime = 0
      } catch {
        // not loaded yet — the #t=0.1 fragment covers the first frame
      }
    }
  }, [shouldPlay])

  if (!artUrl) {
    // no artwork: the preset gradient
    return (
      <div ref={wrapRef} className={`overflow-hidden ${className}`} aria-hidden>
        <div className="absolute inset-0" style={{ background: presetCss(artPreset ?? null) }} />
      </div>
    )
  }

  if (isVideo) {
    // #t=0.1 makes paused videos show their first frame (prefers-reduced-
    // motion, idle tiles); the fragment is never sent to the storage server
    const src = `${artUrl}#t=0.1`
    return (
      <div
        ref={wrapRef}
        className={`overflow-hidden ${className}`}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        <video
          ref={videoRef}
          src={src}
          muted
          loop
          playsInline
          autoPlay={shouldPlay}
          preload="metadata"
          aria-label={`${title} cover video`}
          className="absolute inset-0 size-full object-cover"
        />
      </div>
    )
  }

  return (
    <div ref={wrapRef} className={`overflow-hidden ${className}`}>
      <img
        src={artUrl}
        alt={`${title} cover`}
        loading={variant === 'tile' ? 'lazy' : 'eager'}
        className="absolute inset-0 size-full object-cover"
      />
    </div>
  )
}
