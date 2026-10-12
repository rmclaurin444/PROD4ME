'use client'

import { useState } from 'react'
import { Download, Pencil, Plus, Link2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Avatar } from '@/components/app/ui'
import { formatMoney } from '@/lib/money'
import type { ShapedBeat } from '@/lib/beats'
import type { ShapedLicense } from '@/lib/offers'

export function ProducerProfile({
  onEdit,
  banner,
  theme,
  bio,
  userName,
  avatarText,
  beats,
  onEditPrice,
}: {
  onEdit: () => void
  banner: string
  theme: { id: string; accent: string; bg: string; text: string }
  bio: string
  userName: string
  avatarText: string
  beats?: ShapedBeat[]
  onEditPrice?: (beat: ShapedBeat) => void
}) {
  return (
    <div className="mx-auto w-full max-w-5xl overflow-y-auto px-5 pb-28 pt-24 md:px-12">
      <div className="h-44 rounded-3xl bg-cover bg-center" style={{ backgroundImage: `url(${banner})` }} />

      <div className="-mt-12 flex items-end justify-between">
        <Avatar text={avatarText} size="size-24" />
        <Button onClick={onEdit} variant="outline" className="border-white/20">
          Edit Profile
        </Button>
      </div>

      <h1 className="mt-4 text-4xl font-black">{userName}</h1>
      <p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">{bio}</p>
      <span
        className="mt-5 inline-block rounded-full px-3 py-1 text-xs font-black text-black"
        style={{ background: theme.accent }}
      >
        Producer
      </span>

      {onEditPrice && beats && beats.length > 0 && (
        <>
          <h2 className="mt-10 text-xl font-black">Beats & pricing</h2>
          <div className="mt-3 flex flex-col gap-2">
            {beats.map(b => (
              <div
                key={b.id}
                className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[.03] p-3"
              >
                <div className="min-w-0 flex-1">
                  <p className="font-black">{b.title}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {b.price === 0 ? (
                      <span className="rounded-full bg-lime-300 px-2 py-0.5 font-black text-black">FREE</span>
                    ) : (
                      `$${b.price}`
                    )}
                    {b.exclusivePriceCents !== null && !b.exclusiveSold && (
                      <> · Exclusive {formatMoney(b.exclusivePriceCents)}</>
                    )}
                    {b.exclusiveSold ? ' · Exclusive: sold' : ` · licensed to ${b.licenseCount} artists`}
                  </p>
                </div>
                <button
                  onClick={() => onEditPrice(b)}
                  aria-label={`Set pricing for ${b.title}`}
                  className="flex items-center gap-2 rounded-full border border-white/20 px-3 py-1.5 text-[10px] font-black"
                >
                  <Pencil size={12} /> PRICE
                </button>
              </div>
            ))}
          </div>
        </>
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
      <div className="h-44 rounded-3xl bg-cover bg-center" style={{ backgroundImage: `url(${banner})` }} />

      <div className="-mt-12 flex items-end justify-between">
        <Avatar text={avatarText} size="size-24" />
        <Button onClick={onEdit} variant="outline" className="border-white/20">
          Edit Profile
        </Button>
      </div>

      <div className="mt-4 flex items-start justify-between">
        <div>
          <h1 className="mt-4 text-4xl font-black">{userName}</h1>
          <p className="mt-2 text-sm text-muted-foreground">{bio}</p>
        </div>
        <Button onClick={onPost} className="bg-lime-300 font-black text-black">
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
            className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[.03] p-3"
          >
            <img src={track.art} alt="" className="size-16 rounded-xl object-cover" />
            <div className="flex-1">
              <p className="font-black">{track.title}</p>
              <p className="text-xs text-muted-foreground">
                Made with {track.beat} · linked track
              </p>
            </div>
            <Link2 className="text-lime-300" />
          </a>
        ))}
      </div>

      <h2 className="mt-10 text-xl font-black">My Library · {library?.length ?? 0} licenses</h2>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        {(library ?? []).map(license => (
          <div
            key={license.id}
            className="flex items-center gap-3 rounded-2xl border border-lime-300/20 bg-lime-300/[.05] p-3"
          >
            {license.beat.artUrl && (
              <img src={license.beat.artUrl} alt="" className="size-14 rounded-xl object-cover" />
            )}
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
              className="flex items-center gap-2 rounded-full border border-white/20 px-3 py-1.5 text-[10px] font-black disabled:opacity-40"
            >
              <Download size={12} /> {downloading === license.id ? 'PREPARING…' : 'DOWNLOAD'}
            </button>
          </div>
        ))}
      </div>
      {downloadError && <p className="mt-2 text-sm font-semibold text-red-400">{downloadError}</p>}

      <h2 className="mt-10 text-xl font-black">Saved Beats · {saved.length}</h2>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        {saved.map((id: string) => {
          const b = beats.find(x => x.id === id)
          if (!b) return null
          return (
            <div
              key={id}
              className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[.03] p-3"
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
