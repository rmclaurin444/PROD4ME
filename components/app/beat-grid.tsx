'use client'

import { ListMusic, Play } from 'lucide-react'
import { formatCount } from '@/components/app/data'
import type { ShapedBeat } from '@/lib/beats'
import { BeatCover } from './beat-cover'

/**
 * TikTok-style beat grid: 3 columns on every screen size, 2px gaps, 3:4
 * cover tiles in newest-first order, stream count bottom-left, status
 * badges top-right. Tapping a tile calls onOpenBeat (owner: preview +
 * insights overlay; visitor: the beat in the normal feed).
 */
export function BeatGrid({
  beats,
  onOpenBeat,
  /** beat ids that belong to a playlist — shows the playlist badge (owner grid only) */
  inPlaylistIds,
  emptyState,
}: {
  beats: ShapedBeat[]
  onOpenBeat: (beatId: string) => void
  inPlaylistIds?: Set<string>
  emptyState?: React.ReactNode
}) {
  if (beats.length === 0) {
    return <>{emptyState ?? null}</>
  }

  return (
    <div className="grid grid-cols-3 gap-0.5">
      {beats.map(beat => (
        <button
          key={beat.id}
          onClick={() => onOpenBeat(beat.id)}
          aria-label={`Open ${beat.title}`}
          className="group relative aspect-[3/4] overflow-hidden bg-surface-2"
        >
          <BeatCover
            artUrl={beat.artUrl}
            artPreset={beat.artPreset}
            title={beat.title}
            variant="tile"
            className="absolute inset-0 transition group-hover:scale-[1.02]"
          />

          {/* dark gradient at the bottom for the counter */}
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-black/70 to-transparent" />

          {/* badges top-right */}
          <div className="pointer-events-none absolute right-1 top-1 flex flex-col items-end gap-1">
            {beat.price === 0 && (
              <span className="rounded-md bg-black/60 px-1.5 py-0.5 text-[9px] font-black text-white backdrop-blur">
                Free
              </span>
            )}
            {beat.exclusiveSold && (
              <span className="rounded-md bg-black/60 px-1.5 py-0.5 text-[9px] font-black text-white backdrop-blur">
                Exclusive sold
              </span>
            )}
            {inPlaylistIds?.has(beat.id) && (
              <span
                title="In a playlist"
                className="grid size-5 place-items-center rounded-md bg-black/60 text-white backdrop-blur"
              >
                <ListMusic size={11} />
              </span>
            )}
          </div>

          {/* stream count bottom-left */}
          <span className="pointer-events-none absolute bottom-1.5 left-1.5 flex items-center gap-1 text-[10px] font-black text-white">
            <Play size={9} fill="currentColor" /> {formatCount(beat.streams)}
          </span>
        </button>
      ))}
    </div>
  )
}
