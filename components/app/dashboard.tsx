'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { BarChart3, ListMusic, Pencil, Play } from 'lucide-react'
import { TagPills } from '@/components/app/ui'
import { formatMoney } from '@/lib/money'
import type { ShapedBeat } from '@/lib/beats'
import type { ShapedPlaylist } from '@/lib/playlists'
import { PlaylistEditor } from '@/components/app/playlist-editor'
import { OffersInbox } from '@/components/app/offers-inbox'

export function Dashboard({
  userName,
  beats,
  openOffers,
  playlists = [],
  onEditPrice,
}: {
  userName: string
  beats: ShapedBeat[]
  openOffers: number
  playlists?: ShapedPlaylist[]
  onEditPrice: (beat: ShapedBeat) => void
}) {
  const [editingPlaylist, setEditingPlaylist] = useState<ShapedPlaylist | null>(null)
  const router = useRouter()
  const firstName = userName.trim().split(/\s+/)[0]

  const totalStreams = beats.reduce((sum, b) => sum + b.streams, 0)
  const licensedCount = beats.reduce((sum, b) => sum + b.licenseCount, 0)

  const scrollToOffers = () =>
    document.getElementById('offers-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' })

  return (
    <div className="mx-auto w-full max-w-5xl overflow-y-auto px-5 pb-28 pt-24 md:px-12">
      <p className="text-xs font-bold uppercase tracking-widest text-brand">Producer dashboard</p>
      <h1 className="mt-2 text-4xl font-black">Good morning, {firstName}.</h1>

      <div className="mt-8 grid grid-cols-1 gap-3 md:grid-cols-3">
        <div className="rounded-2xl border border-border bg-surface p-4">
          <p className="flex items-center gap-1.5 text-xs font-bold text-muted-foreground">
            <Play size={11} fill="currentColor" /> Total streams
          </p>
          <p className="mt-2 text-2xl font-black">{totalStreams.toLocaleString()}</p>
        </div>
        <button
          onClick={scrollToOffers}
          aria-label="Jump to the offers section"
          className="rounded-2xl border border-brand/20 bg-brand/[.06] p-4 text-left"
        >
          <p className="text-xs font-bold text-muted-foreground">Offers</p>
          <p className="mt-2 text-2xl font-black">{openOffers}</p>
          <p className="text-[11px] font-bold text-muted-foreground">waiting</p>
        </button>
        <div className="rounded-2xl border border-border bg-surface p-4">
          <p className="text-xs font-bold text-muted-foreground">Licensed to artists</p>
          <p className="mt-2 text-2xl font-black">{licensedCount}</p>
        </div>
      </div>

      <h2 id="offers-section" className="mt-10 scroll-mt-24 text-xl font-black">
        Offers
      </h2>
      {/* Mounting with the dashboard view re-fetches on every open — the old
          offersKey remount logic in app-shell lives here now. */}
      <OffersInbox role="PRODUCER" isArtist={false} />

      <h2 className="mt-10 text-xl font-black">My Beats · {beats.length}</h2>
      <div className="mt-3 flex flex-col gap-2">
        {beats.map(b => (
          <div
            key={b.id}
            className="flex flex-wrap items-center gap-3 rounded-2xl border border-border bg-surface p-3"
          >
            <div className="min-w-0 flex-1">
              <p className="font-black">{b.title}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {b.price === 0 ? (
                  <>
                    <span className="rounded-full bg-brand px-2 py-0.5 font-black text-brand-foreground">FREE</span>
                  </>
                ) : (
                  `${'$'}${b.price}`
                )}
                {b.exclusivePriceCents !== null && !b.exclusiveSold && (
                  <> · Exclusive {formatMoney(b.exclusivePriceCents)}</>
                )}
                {!b.exclusiveSold
                  ? ' · licensed to ' + b.licenseCount + ' artists'
                  : ' · Exclusive: sold'}
              </p>
            </div>
            <TagPills tags={b.tags} />
            <button
              onClick={() => onEditPrice(b)}
              aria-label={`Set pricing for ${b.title}`}
              className="flex items-center gap-2 rounded-full border border-border px-3 py-1.5 text-[10px] font-black"
            >
              <BarChart3 size={12} /> {b.exclusiveSold ? 'EXCLUSIVE: SOLD' : b.exclusivePriceCents !== null ? 'EDIT EXCLUSIVE PRICE' : 'SET EXCLUSIVE PRICE'}
              <Pencil size={12} />
            </button>
          </div>
        ))}
      </div>

      {playlists.length > 0 && (
        <>
          <h2 className="mt-10 text-xl font-black">Your playlists · {playlists.length}</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {playlists.map(playlist => (
              <div
                key={playlist.id}
                className="flex flex-col rounded-3xl border border-border bg-surface p-4"
              >
                <div className="flex items-center gap-3">
                  {playlist.artUrl ? (
                    <img src={playlist.artUrl} alt="" className="size-12 rounded-xl object-cover" />
                  ) : (
                    <div className="grid size-12 place-items-center rounded-xl bg-surface-2">
                      <ListMusic size={18} className="text-brand" />
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-black">{playlist.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {playlist.beats.length} beat{playlist.beats.length === 1 ? '' : 's'}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setEditingPlaylist(playlist)}
                  aria-label={`Edit playlist ${playlist.title}`}
                  className="mt-3 flex items-center justify-center gap-2 rounded-xl border border-border py-2 text-[10px] font-black hover:bg-surface-2"
                >
                  <Pencil size={12} /> EDIT PLAYLIST
                </button>
              </div>
            ))}
          </div>
        </>
      )}

      {editingPlaylist && (
        <PlaylistEditor
          playlist={editingPlaylist}
          onClose={() => setEditingPlaylist(null)}
          onChanged={() => router.refresh()}
        />
      )}
    </div>
  )
}
