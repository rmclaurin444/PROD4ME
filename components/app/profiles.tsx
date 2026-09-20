'use client'

import { Plus, Link2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Avatar } from '@/components/app/ui'
import { beats } from '@/components/app/data'

export function ProducerProfile({
  onEdit,
  banner,
  theme,
  bio,
  userName,
  avatarText,
}: {
  onEdit: () => void
  banner: string
  theme: { id: string; accent: string; bg: string; text: string }
  bio: string
  userName: string
  avatarText: string
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
    </div>
  )
}

export function ArtistProfile({
  tracks,
  saved,
  onPost,
  onEdit,
  banner,
  theme,
  bio,
  userName,
  avatarText,
}: {
  tracks: { title: string; url: string; beat: string; art: string }[]
  saved: number[]
  onPost: () => void
  onEdit: () => void
  banner: string
  theme: { id: string; accent: string; bg: string; text: string }
  bio: string
  userName: string
  avatarText: string
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

      <h2 className="mt-10 text-xl font-black">Saved Beats · {saved.length}</h2>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        {saved.map((i: number) => (
          <div
            key={beats[i].title}
            className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[.03] p-3"
          >
            <img src={beats[i].art} alt="" className="size-14 rounded-xl object-cover" />
            <div>
              <p className="font-black">{beats[i].title}</p>
              <p className="text-xs text-muted-foreground">{beats[i].producer}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
