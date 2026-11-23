'use client'

import { useState } from 'react'
import { ArrowDown, ArrowUp, Loader2, Trash2, X } from 'lucide-react'
import type { ShapedPlaylist } from '@/lib/playlists'
import type { ShapedBeat } from '@/lib/beats'
import { MAX_PRICE_DOLLARS, formatMoney } from '@/lib/money'

/**
 * Owner-only playlist editor: rename, reorder (up/down), remove a beat
 * (detached, not deleted), and bulk price change with the same price rules
 * as PATCH /api/beats/[id].
 */
export function PlaylistEditor({
  playlist,
  onClose,
  onChanged,
}: {
  playlist: ShapedPlaylist
  onClose: () => void
  onChanged: () => void
}) {
  const [title, setTitle] = useState(playlist.title)
  const [beats, setBeats] = useState<ShapedBeat[]>(playlist.beats)
  const [price, setPrice] = useState(playlist.beats[0]?.price ?? 0)
  const [exclusivePrice, setExclusivePrice] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')

  async function patch(body: Record<string, unknown>, successMessage?: string) {
    setBusy(true)
    setError('')
    try {
      const res = await fetch(`/api/playlists/${playlist.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Update failed')
      if (successMessage) setInfo(successMessage)
      onChanged()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Update failed')
    } finally {
      setBusy(false)
    }
  }

  async function saveDetails() {
    await patch({ title: title.trim() }, 'Playlist renamed.')
  }

  async function applyBulkPrice() {
    await patch(
      {
        price,
        ...(exclusivePrice.trim() === '' ? { exclusivePrice: null } : { exclusivePrice: Number(exclusivePrice) }),
      },
      'Prices updated across the playlist.'
    )
  }

  async function removeBeat(beatId: string) {
    await patch({ removeBeatId: beatId }, 'Beat removed from the playlist (not deleted).')
    setBeats(prev => prev.filter(b => b.id !== beatId))
  }

  async function move(beatId: string, direction: -1 | 1) {
    const index = beats.findIndex(b => b.id === beatId)
    const target = index + direction
    if (index < 0 || target < 0 || target >= beats.length) return
    const next = [...beats]
    ;[next[index], next[target]] = [next[target], next[index]]
    setBeats(next)
    await patch({ positions: next.map((b, i) => ({ beatId: b.id, position: i })) })
  }

  async function deletePlaylist() {
    if (!window.confirm('Delete this playlist? Its beats stay live in the feed but leave the playlist.')) return
    setBusy(true)
    try {
      const res = await fetch(`/api/playlists/${playlist.id}`, { method: 'DELETE' })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error ?? 'Delete failed')
      }
      onChanged()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed')
      setBusy(false)
    }
  }

  const exclusiveError = (beat: ShapedBeat, value: string): string => {
    if (value.trim() === '') return ''
    const exclusive = Number(value)
    if (!Number.isFinite(exclusive) || exclusive < 0.5) return 'Exclusive price must be at least $0.50'
    if (exclusive > MAX_PRICE_DOLLARS) return `Exclusive price must be at most $${MAX_PRICE_DOLLARS}`
    if (exclusive <= price) return 'Exclusive price must be greater than the non-exclusive price'
    return ''
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-scrim p-5">
      <div className="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-3xl border border-border bg-surface p-6">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-black">Edit playlist</h2>
          <button onClick={onClose} aria-label="Close">
            <X size={20} />
          </button>
        </div>

        {/* rename */}
        <div className="mt-5 flex items-end gap-2">
          <label className="min-w-0 flex-1 text-xs font-bold text-muted-foreground">
            Title
            <input
              value={title}
              onChange={e => setTitle(e.target.value)}
              className="input mt-2"
              disabled={busy}
            />
          </label>
          <button
            onClick={() => void saveDetails()}
            disabled={busy || title.trim() === playlist.title || !title.trim()}
            className="rounded-xl bg-brand px-4 py-2.5 text-xs font-black text-brand-foreground disabled:opacity-40"
          >
            Rename
          </button>
        </div>

        {/* bulk price */}
        <div className="mt-5 rounded-2xl border border-border bg-surface-2/50 p-4">
          <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
            Bulk price change
          </p>
          <div className="mt-3 flex flex-wrap items-end gap-3">
            <label className="text-xs font-bold text-muted-foreground">
              Non-exclusive (all beats)
              <input
                aria-label="Playlist bulk non-exclusive price"
                type="number"
                min="0"
                max={MAX_PRICE_DOLLARS}
                step="5"
                value={price}
                onChange={e => setPrice(Number(e.target.value))}
                disabled={busy}
                className="input mt-2 w-24 px-2 py-1.5"
              />
            </label>
            <label className="text-xs font-bold text-muted-foreground">
              Exclusive (all beats, optional)
              <input
                aria-label="Playlist bulk exclusive price"
                type="number"
                min="0.5"
                max={MAX_PRICE_DOLLARS}
                step="0.01"
                value={exclusivePrice}
                onChange={e => setExclusivePrice(e.target.value)}
                disabled={busy}
                className="input mt-2 w-28 px-2 py-1.5"
              />
            </label>
            <button
              onClick={() => void applyBulkPrice()}
              disabled={busy}
              className="rounded-xl bg-brand px-4 py-2.5 text-xs font-black text-brand-foreground disabled:opacity-40"
            >
              Apply to all
            </button>
          </div>
          <p className="mt-2 text-[11px] text-muted-foreground">
            Same rules as single-beat pricing. Beats whose exclusive has sold keep their exclusive price.
          </p>
          {exclusiveError(beats[0], exclusivePrice) && (
            <p className="mt-1 text-xs font-semibold text-error">
              {exclusiveError(beats[0], exclusivePrice)}
            </p>
          )}
        </div>

        {/* beats */}
        <h3 className="mt-6 text-xs font-bold uppercase tracking-wider text-muted-foreground">
          Beats · {beats.length}
        </h3>
        <div className="mt-2 flex flex-col gap-2">
          {beats.map((beat, index) => (
            <div
              key={beat.id}
              className="flex flex-wrap items-center gap-2 rounded-2xl border border-border bg-surface-2/50 p-2.5"
            >
              <div className="flex flex-col">
                <button
                  onClick={() => void move(beat.id, -1)}
                  disabled={busy || index === 0}
                  aria-label={`Move ${beat.title} up`}
                  className="text-muted-foreground hover:text-foreground disabled:opacity-30"
                >
                  <ArrowUp size={13} />
                </button>
                <button
                  onClick={() => void move(beat.id, 1)}
                  disabled={busy || index === beats.length - 1}
                  aria-label={`Move ${beat.title} down`}
                  className="text-muted-foreground hover:text-foreground disabled:opacity-30"
                >
                  <ArrowDown size={13} />
                </button>
              </div>
              <span className="w-5 text-center text-xs font-black tabular-nums text-muted-foreground">
                {index + 1}
              </span>
              {beat.artUrl ? (
                <img src={beat.artUrl} alt="" className="size-9 rounded-lg object-cover" />
              ) : playlist.artUrl ? (
                <img src={playlist.artUrl} alt="" className="size-9 rounded-lg object-cover" />
              ) : (
                <div className="size-9 rounded-lg bg-surface-2" />
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-black">{beat.title}</p>
                <p className="text-[11px] text-muted-foreground">
                  {beat.price === 0 ? 'FREE' : `$${beat.price}`}
                  {beat.exclusivePriceCents !== null &&
                    ` · exclusive ${formatMoney(beat.exclusivePriceCents)}`}
                  {beat.exclusiveSold && ' · exclusive sold'}
                </p>
              </div>
              <button
                onClick={() => void removeBeat(beat.id)}
                disabled={busy}
                aria-label={`Remove ${beat.title} from playlist`}
                className="grid size-7 place-items-center rounded-full bg-surface-2 hover:text-error disabled:opacity-40"
                title="Remove from playlist (beat is not deleted)"
              >
                <Trash2 size={13} />
              </button>
            </div>
          ))}
          {beats.length === 0 && (
            <p className="text-center text-xs text-muted-foreground/60">Playlist is empty</p>
          )}
        </div>

        {error && <p className="mt-4 text-sm font-semibold text-error">{error}</p>}
        {info && <p className="mt-4 text-sm font-semibold text-success">{info}</p>}

        <div className="mt-6 flex items-center justify-between">
          <button
            onClick={() => void deletePlaylist()}
            disabled={busy}
            className="flex items-center gap-2 rounded-xl border border-error/40 px-4 py-2.5 text-xs font-black text-error hover:bg-error/10 disabled:opacity-40"
          >
            <Trash2 size={13} /> Delete playlist
          </button>
          {busy && <Loader2 size={16} className="animate-spin text-muted-foreground" />}
        </div>
      </div>
    </div>
  )
}
