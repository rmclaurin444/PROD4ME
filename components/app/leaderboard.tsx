'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { ListMusic, Loader2, Pause, Play, Trophy } from 'lucide-react'
import { Avatar } from '@/components/app/ui'
import { getInitials } from '@/components/app/data'

type Breakdown = { streams: number; likes: number; comments: number; shares: number; purchases: number }

type LeaderEntry = {
  rank: number
  score: number
  breakdown: Breakdown
  beat?: {
    id: string
    title: string
    producer: string
    artUrl: string | null
    artPreset: string | null
    audioUrl: string
    durationSec: number | null
  }
  producer?: { id: string; name: string; avatar: string }
}

type Payload = {
  kind: 'BEAT' | 'PRODUCER'
  week: string
  isLive: boolean
  entries: LeaderEntry[]
  mine: { rank: number | null; score: number; breakdown: Breakdown } | null
  availableWeeks: string[]
}

function presetCss(id: string | null): string {
  // minimal fallback mirror — artwork presets live in app/artwork-slot.tsx
  return 'linear-gradient(135deg,#f5f5f5 0%,#111111 100%)'
}

function Breakdown({ data }: { data: Breakdown }) {
  return (
    <span className="flex shrink-0 items-center gap-2 text-[10px] font-bold text-muted-foreground">
      <span title="streams" className="tabular-nums">{data.streams}▶</span>
      <span title="likes" className="tabular-nums">{data.likes}♥</span>
      <span title="comments" className="tabular-nums">{data.comments}💬</span>
      <span title="shares" className="tabular-nums">{data.shares}↗</span>
    </span>
  )
}

export function LeaderboardView({
  isProducer,
  onOpenBeat,
  onOpenProducer,
}: {
  isProducer: boolean
  onOpenBeat: (beatId: string) => void
  onOpenProducer: (producerId: string) => void
}) {
  const [kind, setKind] = useState<'BEAT' | 'PRODUCER'>('BEAT')
  const [week, setWeek] = useState<'current' | string>('current')
  const [data, setData] = useState<Payload | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const audioRef = useRef<HTMLAudioElement | null>(null)
  const [playingId, setPlayingId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/leaderboard?kind=${kind === 'BEAT' ? 'beat' : 'producer'}&week=${week}`)
      const body = (await res.json()) as Payload & { error?: string }
      if (!res.ok) throw new Error(body.error ?? 'Leaderboard failed')
      setData(body)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Leaderboard failed')
    } finally {
      setLoading(false)
    }
  }, [kind, week])

  useEffect(() => {
    void load()
  }, [load])

  const togglePreview = (entry: LeaderEntry) => {
    if (!entry.beat) return
    if (playingId === entry.beat.id) {
      audioRef.current?.pause()
      setPlayingId(null)
      return
    }
    if (audioRef.current) {
      audioRef.current.pause()
    }
    const audio = new Audio(entry.beat.audioUrl)
    audio.volume = 0.7
    audioRef.current = audio
    audio.play().catch(() => {})
    setPlayingId(entry.beat.id)
  }

  const stopPreview = () => {
    audioRef.current?.pause()
    setPlayingId(null)
  }

  const top3 = (data?.entries ?? []).slice(0, 3)
  const rest = (data?.entries ?? []).slice(3)

  return (
    <div className="mx-auto w-full max-w-4xl flex-1 overflow-y-auto px-5 pb-28 pt-24 md:px-12" onMouseDown={stopPreview}>
      <p className="text-xs font-bold uppercase tracking-widest text-brand">Weekly leaderboard</p>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-4xl font-black">Top of the week</h1>
        <div className="flex rounded-lg border border-border bg-surface p-0.5">
          {(['BEAT', 'PRODUCER'] as const).map(value => (
            <button
              key={value}
              onClick={() => setKind(value)}
              aria-pressed={kind === value}
              className={`rounded-md px-3 py-1.5 text-xs font-black ${
                kind === value ? 'bg-brand text-brand-foreground' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {value === 'BEAT' ? 'Top Beats' : 'Top Producers'}
            </button>
          ))}
        </div>
      </div>

      {/* week selector */}
      <div className="mt-5 flex flex-wrap items-center gap-2">
        <button
          onClick={() => setWeek('current')}
          aria-pressed={week === 'current'}
          className={`rounded-full px-3 py-1.5 text-xs font-black ${
            week === 'current' ? 'bg-brand text-brand-foreground' : 'border border-border text-muted-foreground hover:text-foreground'
          }`}
        >
          This week (live)
        </button>
        {(data?.availableWeeks ?? []).map(label => (
          <button
            key={label}
            onClick={() => setWeek(label)}
            aria-pressed={week === label}
            className={`rounded-full px-3 py-1.5 text-xs font-black ${
              week === label ? 'bg-brand text-brand-foreground' : 'border border-border text-muted-foreground hover:text-foreground'
            }`}
          >
            Week of {label}
          </button>
        ))}
      </div>

      {data && (
        <p className="mt-3 text-xs text-muted-foreground">
          {data.isLive
            ? 'Live standings — updated as engagement happens (15-minute cache).'
            : `Snapshot for the week of ${data.week} — locked in and never changes.`}
        </p>
      )}

      {error && (
        <p className="mt-4 rounded-xl border border-error/30 bg-error/10 p-3 text-sm font-bold text-error">{error}</p>
      )}

      {loading && !data ? (
        <div className="mt-10 flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 size={16} className="animate-spin" /> Loading the leaderboard…
        </div>
      ) : data && data.entries.length === 0 ? (
        <div className="mt-10 flex flex-col items-center rounded-3xl border border-dashed border-border py-16 text-center">
          <div className="grid size-14 place-items-center rounded-2xl bg-surface-2 text-brand">
            <Trophy size={26} />
          </div>
          <h2 className="mt-5 text-2xl font-black">No standings yet this week</h2>
          <p className="mt-2 max-w-sm text-sm text-muted-foreground">
            Streams, likes, comments, shares and sales all earn points. Play something to get the board moving.
          </p>
        </div>
      ) : data && (
        <>
          {/* top 3 — larger cards */}
          <div className="mt-6 grid gap-3 md:grid-cols-3">
            {top3.map(entry => (
              <div
                key={entry.rank}
                className="rounded-3xl border border-brand/30 bg-brand/[.06] p-5"
              >
                <div className="flex items-center justify-between">
                  <span className="grid size-9 place-items-center rounded-full bg-brand text-lg font-black text-brand-foreground">
                    {entry.rank}
                  </span>
                  <span className="text-xl font-black tabular-nums">{entry.score}</span>
                </div>
                <div className="mt-4 flex items-center gap-3">
                  {kind === 'BEAT' && entry.beat ? (
                    <>
                      {entry.beat.artUrl ? (
                        <img src={entry.beat.artUrl} alt="" className="size-14 rounded-xl object-cover" />
                      ) : (
                        <div
                          className="size-14 shrink-0 rounded-xl"
                          style={{ background: presetCss(entry.beat.artPreset) }}
                        />
                      )}
                      <div className="min-w-0">
                        <p className="truncate text-sm font-black">{entry.beat.title}</p>
                        <p className="truncate text-xs text-muted-foreground">{entry.beat.producer}</p>
                      </div>
                    </>
                  ) : entry.producer ? (
                    <>
                      <Avatar text={entry.producer.avatar} size="size-14" />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-black">{entry.producer.name}</p>
                        <p className="text-xs text-muted-foreground">Producer</p>
                      </div>
                    </>
                  ) : null}
                </div>
                <div className="mt-4">
                  <Breakdown data={entry.breakdown} />
                </div>
              </div>
            ))}
          </div>

          {/* rows 4+ */}
          <div className="mt-4 flex flex-col gap-2">
            {rest.map(entry => (
              <div
                key={entry.rank}
                className="flex items-center gap-3 rounded-2xl border border-border bg-surface p-3"
              >
                <span className="w-6 shrink-0 text-center text-sm font-black tabular-nums text-muted-foreground">
                  {entry.rank}
                </span>
                {kind === 'BEAT' && entry.beat ? (
                  <>
                    <button
                      onClick={() => togglePreview(entry)}
                      disabled={!entry.beat.audioUrl}
                      aria-label={playingId === entry.beat.id ? `Pause preview of ${entry.beat.title}` : `Play preview of ${entry.beat.title}`}
                      className="grid size-9 shrink-0 place-items-center rounded-full bg-brand text-brand-foreground disabled:opacity-40"
                    >
                      {playingId === entry.beat.id ? <Pause size={14} /> : <Play size={14} fill="currentColor" />}
                    </button>
                    <button
                      onClick={() => onOpenBeat(entry.beat!.id)}
                      className="flex min-w-0 flex-1 items-center gap-3 text-left"
                      title="Open in the feed"
                    >
                      {entry.beat.artUrl ? (
                        <img src={entry.beat.artUrl} alt="" className="size-10 shrink-0 rounded-lg object-cover" />
                      ) : (
                        <div
                          className="size-10 shrink-0 rounded-lg"
                          style={{ background: presetCss(entry.beat.artPreset) }}
                        />
                      )}
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-black">{entry.beat.title}</span>
                        <span className="block truncate text-xs text-muted-foreground">{entry.beat.producer}</span>
                      </span>
                    </button>
                  </>
                ) : entry.producer ? (
                  <button
                    onClick={() => onOpenProducer(entry.producer!.id)}
                    className="flex min-w-0 flex-1 items-center gap-3 text-left"
                    title="Open the producer's profile"
                  >
                    <Avatar text={entry.producer.avatar} />
                    <span className="block truncate text-sm font-black">{entry.producer.name}</span>
                  </button>
                ) : null}
                <Breakdown data={entry.breakdown} />
                <span className="w-14 shrink-0 text-right text-sm font-black tabular-nums">{entry.score}</span>
              </div>
            ))}
          </div>
        </>
      )}

      {/* producer's own rank */}
      {isProducer && data?.mine && (
        <div className="mt-8 rounded-3xl border border-brand/30 bg-brand/[.06] p-5">
          <div className="flex items-center justify-between">
            <p className="text-xs font-bold uppercase tracking-widest text-brand">Your rank this week</p>
            <span className="text-xs text-muted-foreground">{data.week}</span>
          </div>
          <div className="mt-3 flex items-center justify-between">
            <span className="text-3xl font-black">
              {data.mine.rank ? `#${data.mine.rank}` : 'Unranked yet'}
            </span>
            <span className="text-2xl font-black tabular-nums">{data.mine.score}</span>
          </div>
          <div className="mt-3">
            <Breakdown data={data.mine.breakdown} />
          </div>
          {!data.isLive && (
            <p className="mt-2 text-[11px] text-muted-foreground">
              Past weeks read from the saved snapshot — your rank outside the top 50 isn’t stored.
            </p>
          )}
        </div>
      )}

      {/* audio preview element */}
      <audio ref={audioRef} hidden />
      {playingId && (
        <p className="mt-4 flex items-center gap-2 text-xs text-muted-foreground">
          <ListMusic size={12} /> Playing preview — click the pause button or anywhere to stop.
        </p>
      )}
    </div>
  )
}
