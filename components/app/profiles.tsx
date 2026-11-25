'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Download, ListMusic, Pencil, Plus, Link2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Avatar } from '@/components/app/ui'
import { formatMoney } from '@/lib/money'
import type { ShapedBeat } from '@/lib/beats'
import type { ShapedLicense } from '@/lib/offers'
import type { ShapedPlaylist } from '@/lib/playlists'
import { PurchaseModal } from '@/components/app/purchase-modal'
import { OffersInbox } from '@/components/app/offers-inbox'
import { BeatCover } from '@/components/app/beat-cover'
import { BeatGrid } from '@/components/app/beat-grid'

export function ProducerProfile({
  onEdit,
  banner,
  theme,
  bio,
  userName,
  avatarText,
  avatarUrl,
  beats,
  playlists = [],
  followerCount = 0,
  followingCount = 0,
  onOpenBeat,
  onUpload,
}: {
  onEdit: () => void
  banner: string
  theme: { id: string; accent: string; bg: string; text: string }
  bio: string
  userName: string
  avatarText: string
  avatarUrl?: string | null
  beats?: ShapedBeat[]
  playlists?: ShapedPlaylist[]
  followerCount?: number
  followingCount?: number
  /** opens the owner preview (Prompt 10) — the Feed as listeners see it, with insights */
  onOpenBeat?: (beatId: string) => void
  /** jumps to the Upload view (owner empty state) */
  onUpload?: () => void
}) {
  const router = useRouter()
  const [openPlaylistId, setOpenPlaylistId] = useState<string | null>(null)
  const [purchase, setPurchase] = useState<{ beat: ShapedBeat } | null>(null)
  const [profileTab, setProfileTab] = useState<'beats' | 'playlists'>('beats')
  const inPlaylistIds = new Set(playlists.flatMap(playlist => playlist.beats.map(beat => beat.id)))
  return (
    <div className="mx-auto w-full max-w-5xl overflow-y-auto px-5 pb-28 pt-24 md:px-12">
      <div className="aspect-[3/1] w-full rounded-3xl bg-cover bg-center" style={{ backgroundImage: `url(${banner})` }} />

      <div className="-mt-12 flex items-end justify-between">
        <Avatar text={avatarText} src={avatarUrl} size="size-24" />
        <Button onClick={onEdit} variant="outline" className="border-border">
          Edit Profile
        </Button>
      </div>

      <h1 className="mt-4 text-4xl font-black">{userName}</h1>
      <p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">{bio}</p>
      <p className="mt-3 text-sm font-bold text-muted-foreground">
        <b className="text-foreground">{followerCount.toLocaleString()}</b> followers ·{' '}
        <b className="text-foreground">{followingCount.toLocaleString()}</b> following
      </p>
      <span
        className="mt-5 inline-block rounded-full px-3 py-1 text-xs font-black text-brand-foreground"
        style={{ background: theme.accent }}
      >
        Producer
      </span>

      {/* Beats | Playlists tabs (Prompt 10: TikTok-style grid) */}
      <div className="mt-10 flex rounded-xl border border-border bg-surface p-1">
        {(['beats', 'playlists'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setProfileTab(tab)}
            aria-pressed={profileTab === tab}
            className={`flex-1 rounded-lg px-4 py-2.5 text-sm font-black ${
              profileTab === tab ? 'bg-brand text-brand-foreground' : 'text-muted-foreground'
            }`}
          >
            {tab === 'beats' ? 'Beats' : 'Playlists'}
          </button>
        ))}
      </div>

      {profileTab === 'beats' ? (
        <>
          <div className="mt-4">
            <BeatGrid
              beats={beats ?? []}
              onOpenBeat={beatId => onOpenBeat?.(beatId)}
              inPlaylistIds={inPlaylistIds}
              emptyState={
                <div className="rounded-3xl border border-dashed border-border py-16 text-center">
                  <div className="mx-auto grid size-14 place-items-center rounded-2xl bg-surface-2 text-brand">
                    <Plus size={24} />
                  </div>
                  <h3 className="mt-4 text-xl font-black">Post your first beat</h3>
                  <p className="mx-auto mt-2 max-w-xs text-sm text-muted-foreground">
                    Upload a track with artwork, tags and pricing — it shows up here and in the feed.
                  </p>
                  {onUpload && (
                    <Button onClick={onUpload} className="mt-5 bg-brand text-brand-foreground">
                      Upload a beat
                    </Button>
                  )}
                </div>
              }
            />
          </div>
        </>
      ) : playlists.length > 0 ? (
        <>
          <div className="mt-4 flex flex-col gap-3">
            {playlists.map(playlist => {
              const isOpen = openPlaylistId === playlist.id
              return (
                <div
                  key={playlist.id}
                  className="rounded-3xl border border-border bg-surface p-4"
                >
                  <button
                    onClick={() => setOpenPlaylistId(isOpen ? null : playlist.id)}
                    aria-expanded={isOpen}
                    className="flex w-full items-center gap-3 text-left"
                  >
                    {playlist.artUrl ? (
                      <BeatCover
                        artUrl={playlist.artUrl}
                        artPreset={playlist.artPreset}
                        title={playlist.title}
                        className="relative size-12 rounded-xl"
                      />
                    ) : (
                      <div className="grid size-12 place-items-center rounded-xl bg-surface-2">
                        <ListMusic size={18} className="text-brand" />
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-black">{playlist.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {playlist.beats.length} beat{playlist.beats.length === 1 ? '' : 's'}
                        {playlist.description ? ` · ${playlist.description}` : ''}
                      </p>
                    </div>
                    <span className="text-xs font-black text-muted-foreground">
                      {isOpen ? 'HIDE' : 'OPEN'}
                    </span>
                  </button>

                  {isOpen && (
                    <div className="mt-3 flex flex-col gap-2">
                      {playlist.beats.map((beat, index) => (
                        <div
                          key={beat.id}
                          className="flex flex-wrap items-center gap-3 rounded-2xl border border-border bg-surface-2/50 p-2.5"
                        >
                          <span className="w-5 text-center text-xs font-black tabular-nums text-muted-foreground">
                            {index + 1}
                          </span>
                          <BeatCover
                            artUrl={beat.artUrl}
                            artPreset={beat.artPreset}
                            title={beat.title}
                            className="relative size-10 rounded-lg"
                          />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-black">{beat.title}</p>
                            <p className="text-xs text-muted-foreground">
                              {beat.price === 0 ? (
                                <span className="rounded-full bg-brand px-2 py-0.5 font-black text-brand-foreground">
                                  FREE
                                </span>
                              ) : (
                                `$${beat.price}`
                              )}
                              {beat.exclusivePriceCents !== null && !beat.exclusiveSold && (
                                <> · Exclusive {formatMoney(beat.exclusivePriceCents)}</>
                              )}
                            </p>
                          </div>
                          <button
                            onClick={() => setPurchase({ beat })}
                            aria-label={`Buy or make an offer for ${beat.title}`}
                            className="flex items-center gap-2 rounded-full border border-border px-3 py-1.5 text-[10px] font-black hover:bg-surface-2"
                          >
                            BUY / OFFER
                          </button>
                        </div>
                      ))}
                      {playlist.beats.length === 0 && (
                        <p className="text-center text-xs text-muted-foreground/60">Playlist is empty</p>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </>
      ) : (
        <p className="mt-4 text-sm text-muted-foreground">No playlists yet.</p>
      )}

      {purchase && (
        <PurchaseModal
          beat={purchase.beat}
          mode="buy"
          owned={[]}
          onClose={() => setPurchase(null)}
          onObtained={() => router.refresh()}
        />
      )}
    </div>
  )
}

export function ArtistProfile({
  tracks,
  saved,
  beats,
  library,
  onPost,
  onEdit,
  banner,
  theme,
  bio,
  userName,
  avatarText,
  avatarUrl,
}: {
  tracks: { title: string; url: string; beat: string; art: string | null }[]
  saved: string[]
  beats: ShapedBeat[]
  library?: ShapedLicense[]
  onPost: () => void
  onEdit: () => void
  banner: string
  theme: { id: string; accent: string; bg: string; text: string }
  bio: string
  userName: string
  avatarText: string
  avatarUrl?: string | null
}) {
  const [downloading, setDownloading] = useState<string | null>(null)
  const [downloadError, setDownloadError] = useState('')

  async function downloadLicense(licenseId: string) {
    setDownloading(licenseId)
    setDownloadError('')
    try {
      const res = await fetch(`/api/licenses/${licenseId}/download`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Could not start download')
      window.location.assign(data.downloadUrl)
    } catch (err) {
      setDownloadError(err instanceof Error ? err.message : 'Could not start download')
    } finally {
      setDownloading(null)
    }
  }
  return (
    <div className="mx-auto w-full max-w-5xl overflow-y-auto px-5 pb-28 pt-24 md:px-12">
      <div className="aspect-[3/1] w-full rounded-3xl bg-cover bg-center" style={{ backgroundImage: `url(${banner})` }} />

      <div className="-mt-12 flex items-end justify-between">
        <Avatar text={avatarText} src={avatarUrl} size="size-24" />
        <Button onClick={onEdit} variant="outline" className="border-border">
          Edit Profile
        </Button>
      </div>

      <div className="mt-4 flex items-start justify-between">
        <div>
          <h1 className="mt-4 text-4xl font-black">{userName}</h1>
          <p className="mt-2 text-sm text-muted-foreground">{bio}</p>
        </div>
        <Button onClick={onPost} className="bg-brand font-black text-brand-foreground">
          <Plus data-icon="inline-start" /> Link Your Music
        </Button>
      </div>

      <h2 className="mt-10 text-xl font-black">My Tracks · {tracks.length}</h2>
      <div className="mt-3 flex flex-col gap-3">
        {tracks.map((track: any) => (
          <a
            href={track.url}
            target="_blank"
            rel="noreferrer"
            key={track.title}
            className="flex items-center gap-3 rounded-2xl border border-border bg-surface p-3"
          >
            <img src={track.art} alt="" className="size-16 rounded-xl object-cover" />
            <div className="flex-1">
              <p className="font-black">{track.title}</p>
              <p className="text-xs text-muted-foreground">
                Made with {track.beat} · linked track
              </p>
            </div>
            <Link2 className="text-brand" />
          </a>
        ))}
      </div>

      <h2 id="offers-section" className="mt-10 scroll-mt-24 text-xl font-black">
        Offers
      </h2>
      {/* Mounting with the profile view re-fetches on every open — the old
          offersKey remount logic in app-shell lives here now. */}
      <OffersInbox role="ARTIST" isArtist />

      <h2 className="mt-10 text-xl font-black">My Library · {library?.length ?? 0} licenses</h2>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        {(library ?? []).map(license => (
          <div
            key={license.id}
            className="flex items-center gap-3 rounded-2xl border border-brand/20 bg-brand/[.05] p-3"
          >
            <BeatCover
              artUrl={license.beat.artUrl}
              artPreset={license.beat.artPreset}
              title={license.beat.title}
              className="relative size-14 rounded-xl"
            />
            <div className="min-w-0 flex-1">
              <p className="font-black">{license.beat.title}</p>
              <p className="text-xs text-muted-foreground">
                {license.licenseType === 'EXCLUSIVE' ? 'Exclusive' : 'Non-exclusive'} license
                {license.pricePaidCents > 0 ? ` · paid ${formatMoney(license.pricePaidCents)}` : ' · free'}
              </p>
            </div>
            <button
              onClick={() => downloadLicense(license.id)}
              disabled={downloading === license.id}
              aria-label={`Download ${license.beat.title}`}
              className="flex items-center gap-2 rounded-full border border-border px-3 py-1.5 text-[10px] font-black disabled:opacity-40"
            >
              <Download size={12} /> {downloading === license.id ? 'PREPARING…' : 'DOWNLOAD'}
            </button>
          </div>
        ))}
      </div>
      {downloadError && <p className="mt-2 text-sm font-semibold text-error">{downloadError}</p>}

      <h2 className="mt-10 text-xl font-black">Saved Beats · {saved.length}</h2>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        {saved.map((id: string) => {
          const b = beats.find(x => x.id === id)
          if (!b) return null
          return (
            <div
              key={id}
              className="flex items-center gap-3 rounded-2xl border border-border bg-surface p-3"
            >
              {b.artUrl && <img src={b.artUrl} alt="" className="size-14 rounded-xl object-cover" />}
              <div>
                <p className="font-black">{b.title}</p>
                <p className="text-xs text-muted-foreground">{b.producer}</p>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

