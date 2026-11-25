'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { X } from 'lucide-react'
import { Feed } from './feed'
import { InsightsPanel } from './insights-panel'
import type { ShapedBeat } from '@/lib/beats'

/**
 * Full-screen owner preview: the real Feed rendered in previewMode (no
 * engagement recorded, inert action buttons) plus the owner-only Insights
 * panel (right side on desktop, swipe-down bottom sheet on mobile).
 * TikTok navigation: swipe up/down, arrow keys, or the mouse wheel move
 * through the producer's beats in grid order; Esc / the close button
 * returns to the grid (which stays mounted underneath, preserving its
 * scroll position).
 */
export function PreviewOverlay({
  beats,
  startIndex,
  onClose,
  onEditPrice,
}: {
  beats: ShapedBeat[]
  startIndex: number
  onClose: () => void
  onEditPrice: (beat: ShapedBeat) => void
}) {
  const [index, setIndex] = useState(startIndex)
  const [sheetOpen, setSheetOpen] = useState(false)
  const touchStartY = useRef<number | null>(null)

  const beat = beats[index] ?? null

  const next = useCallback(() => {
    setIndex(current => Math.min(current + 1, beats.length - 1))
  }, [beats.length])
  const prev = useCallback(() => {
    setIndex(current => Math.max(current - 1, 0))
  }, [])

  // arrow keys + Escape
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      else if (e.key === 'ArrowDown') next()
      else if (e.key === 'ArrowUp') prev()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [next, prev, onClose])

  // vertical swipe navigation (touch)
  const onTouchStart = (e: React.TouchEvent) => {
    touchStartY.current = e.touches[0]?.clientY ?? null
  }
  const onTouchEnd = (e: React.TouchEvent) => {
    const startY = touchStartY.current
    touchStartY.current = null
    if (startY === null) return
    const delta = (e.changedTouches[0]?.clientY ?? 0) - startY
    if (delta < -60) next()
    else if (delta > 60) prev()
  }

  // reload insights when moving between beats: InsightsPanel keys off beatId
  const noOp = () => {}

  if (!beat) return null

  return (
    <div
      className="fixed inset-0 z-40 flex flex-col bg-background md:flex-row"
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
      role="dialog"
      aria-label="Beat preview"
    >
      <div className="flex items-center justify-between px-4 py-3 md:absolute md:inset-x-0 md:top-0 md:z-30">
        <span className="rounded-full border border-white/15 bg-black/30 px-3 py-1.5 text-xs font-black text-white backdrop-blur">
          Preview
        </span>
        <button
          onClick={onClose}
          aria-label="Close preview"
          className="grid size-9 place-items-center rounded-full border border-white/15 bg-black/30 text-white backdrop-blur transition hover:bg-black/50"
        >
          <X size={16} />
        </button>
      </div>

      <div className="relative min-h-0 min-w-0 flex-1">
        <Feed
          beat={beat}
          tag={null}
          onTag={noOp}
          onClear={noOp}
          saved={false}
          onSave={noOp}
          saveCount={beat.saves}
          liked={false}
          onLike={noOp}
          likeCount={beat.likes}
          commentCount={beat.comments}
          onComment={noOp}
          shareCount={beat.shares}
          onShare={noOp}
          onShareMessage={undefined}
          onOffer={noOp}
          onBuy={noOp}
          owned={[]}
          onNext={next}
          onPrev={prev}
          isArtist={false}
          onPoster={noOp}
          previewMode
        />
      </div>

      {/* mobile: sheet toggle sits above the feed chrome */}
      <button
        onClick={() => setSheetOpen(true)}
        className={`absolute bottom-24 right-4 z-30 rounded-full bg-brand px-4 py-2.5 text-xs font-black text-brand-foreground shadow-lg md:hidden ${
          sheetOpen ? 'hidden' : ''
        }`}
      >
        Insights
      </button>

      <InsightsPanel
        beatId={beat.id}
        beatTitle={beat.title}
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        onEditPrice={() => onEditPrice(beat)}
      />
    </div>
  )
}
