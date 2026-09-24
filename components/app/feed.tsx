'use client'

import { useEffect, useRef, useState } from 'react'
import { Bookmark, Heart, MessageCircle, Share2, Volume2, VolumeX, X } from 'lucide-react'
import { Avatar, TagPills } from '@/components/app/ui'
import { formatCount } from '@/components/app/data'
import { ARTWORK_PRESETS } from '@/components/app/artwork-slot'
import { Waveform } from '@/components/app/waveform'
import { computePeaksFromBuffer } from '@/lib/upload-client'

function presetCss(id: string | null) {
  return (
    ARTWORK_PRESETS.find(p => p.id === id)?.css ??
    ARTWORK_PRESETS[0].css
  )
}

const peaksCache = new Map<string, number[]>()

function ActionButton({
  label,
  count,
  onClick,
  active,
  activeClass,
  children,
}: {
  label: string
  count: number
  onClick: () => void
  active?: boolean
  activeClass?: string
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      aria-pressed={active}
      className="group flex flex-col items-center gap-1.5"
    >
      <span
        className={`grid size-12 place-items-center rounded-full bg-black/30 backdrop-blur transition group-active:scale-90 ${
          active && activeClass ? activeClass : 'text-white'
        }`}
      >
        {children}
      </span>
      <span className="text-[11px] font-bold tabular-nums text-white/90">
        {formatCount(count)}
      </span>
    </button>
  )
}

export function Feed({
  beat,
  tag,
  onTag,
  onClear,
  saved,
  onSave,
  saveCount,
  liked,
  onLike,
  likeCount,
  commentCount,
  onComment,
  shareCount,
  onShare,
  onOffer,
  onNext,
  isArtist,
  onPoster,
}: {
  beat: any
  tag: string | null
  onTag: (tag: string) => void
  onClear: () => void
  saved: boolean
  onSave: () => void
  saveCount: number
  liked: boolean
  onLike: () => void
  likeCount: number
  commentCount: number
  onComment: () => void
  shareCount: number
  onShare: () => void
  onOffer: () => void
  onNext: () => void
  isArtist: boolean
  onPoster: (user: { name: string; role: string; avatar: string; bio: string }) => void
}) {
  const [copied, setCopied] = useState(false)

  const audioRef = useRef<HTMLAudioElement>(null)
  const [soundOn, setSoundOn] = useState(false)
  const [audioFailed, setAudioFailed] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [fallbackPeaks, setFallbackPeaks] = useState<number[] | null>(null)

  useEffect(() => {
    setAudioFailed(false)
    setSoundOn(false)
    setCurrentTime(0)
    setDuration(0)
    setFallbackPeaks(null)

    const a = audioRef.current
    if (a) {
      a.muted = true
      a.currentTime = 0
      a.play().catch(() => {})
    }

    let cancelled = false
    if (!beat.peaks && beat.audioUrl) {
      const cached = peaksCache.get(beat.id)
      if (cached) {
        setFallbackPeaks(cached)
      } else {
        fetch(beat.audioUrl)
          .then(res => res.arrayBuffer())
          .then(buf => computePeaksFromBuffer(buf))
          .then(peaks => {
            if (peaks && !cancelled) {
              peaksCache.set(beat.id, peaks)
              setFallbackPeaks(peaks)
            }
          })
          .catch(() => {})
      }
    }

    return () => {
      cancelled = true
    }
  }, [beat.id])

  const toggleSound = () => {
    const a = audioRef.current
    if (!a) return
    if (soundOn) {
      a.pause()
      setSoundOn(false)
    } else {
      a.muted = false
      a
        .play()
        .then(() => setSoundOn(true))
        .catch(() => {})
    }
  }

  const seek = (fraction: number) => {
    const a = audioRef.current
    if (!a || audioFailed) return
    const d = a.duration
    if (!Number.isFinite(d) || d <= 0) return
    a.currentTime = fraction * d
    setCurrentTime(a.currentTime)
  }

  const handleShare = async () => {
    const shareUrl = `${window.location.origin}/?beat=${encodeURIComponent(beat.title)}`
    const shareData = {
      title: beat.title,
      text: `Check out ${beat.title} by ${beat.producer}`,
      url: shareUrl,
    }

    if (navigator.share) {
      try {
        await navigator.share(shareData)
        onShare()
        return
      } catch {
        return
      }
    }

    try {
      await navigator.clipboard.writeText(shareUrl)
      onShare()
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch {
      onShare()
    }
  }

  return (
    <div
      className="relative flex min-h-screen flex-1 items-end overflow-hidden"
      onWheel={e => {
        if (Math.abs(e.deltaY) > 30) onNext()
      }}
    >
      {tag && (
        <div className="absolute left-5 top-20 z-20 flex items-center gap-2 rounded-full border border-white/15 bg-black/60 px-3 py-2 text-sm font-black backdrop-blur">
          #{tag.replaceAll(' ', '')}
          <button onClick={onClear} aria-label="Back to all beats">
            <X size={14} />
          </button>
        </div>
      )}

      <audio
        ref={audioRef}
        src={beat.audioUrl}
        loop
        preload="auto"
        onError={() => setAudioFailed(true)}
        onTimeUpdate={() => setCurrentTime(audioRef.current?.currentTime ?? 0)}
        onLoadedMetadata={() => setDuration(audioRef.current?.duration ?? 0)}
        onDurationChange={() => setDuration(audioRef.current?.duration ?? 0)}
      />

      {beat.artUrl ? (
        <img src={beat.artUrl} alt={`${beat.title} artwork`} className="absolute inset-0 size-full object-cover" />
      ) : (
        <div
          className="absolute inset-0 size-full"
          style={{ background: presetCss(beat.artPreset) }}
        />
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-black via-black/30 to-black/10" />

      <div className="relative z-10 flex w-full items-end gap-5 px-5 pb-28 pt-24 md:px-12">
        <div className="min-w-0 flex-1">
          <div className="mb-5 flex items-center gap-3">
            <button
              onClick={() =>
                onPoster &&
                onPoster({
                  name: beat.producer,
                  role: 'Producer',
                  avatar: beat.avatar,
                  bio: 'Producer on PROD4ME.',
                })
              }
              className="flex items-center gap-3 text-left"
            >
              <Avatar text={beat.avatar} />
              <div>
                <p className="text-sm font-bold">{beat.producer}</p>
                <p className="text-xs text-white/60">beat · {formatCount(beat.plays)} plays</p>
              </div>
            </button>
          </div>

          <h1 className="text-5xl font-black tracking-tighter md:text-7xl">{beat.title}</h1>

          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs font-bold">
            <TagPills tags={beat.tags} onTag={onTag} />
            {beat.bpm && <span className="rounded-md bg-white/15 px-2 py-1">{beat.bpm} BPM</span>}
            {beat.musicalKey && (
              <span className="rounded-md bg-white/15 px-2 py-1">{beat.musicalKey}</span>
            )}
            <span className="text-white/60">
              {beat.price === 0 ? (
                <span className="rounded-full bg-lime-300 px-2 py-1 font-black text-black">FREE</span>
              ) : (
                `from $${beat.price}`
              )}
            </span>
          </div>

          <Waveform
            peaks={beat.peaks ?? fallbackPeaks}
            progress={duration > 0 ? currentTime / duration : 0}
            currentTime={currentTime}
            duration={duration || beat.durationSec || 0}
            onSeek={seek}
            disabled={audioFailed}
          />
        </div>

        <div className="flex shrink-0 flex-col items-center gap-4">
          <button
            onClick={toggleSound}
            disabled={audioFailed}
            aria-label={soundOn ? 'Mute beat' : 'Unmute beat'}
            className="flex flex-col items-center gap-1.5 disabled:opacity-40"
          >
            <span
              className={`grid size-12 place-items-center rounded-full bg-black/30 backdrop-blur transition ${
                soundOn ? 'text-lime-300' : 'text-white'
              }`}
            >
              {soundOn ? <Volume2 size={24} /> : <VolumeX size={24} />}
            </span>
            <span className="text-[11px] font-bold text-white/90">
              {audioFailed ? 'No audio' : soundOn ? 'Sound on' : 'Muted'}
            </span>
          </button>

          <ActionButton
            label="Like beat"
            count={likeCount}
            onClick={onLike}
            active={liked}
            activeClass="text-red-500"
          >
            <Heart size={24} fill={liked ? 'currentColor' : 'none'} />
          </ActionButton>

          <ActionButton label="Comment on beat" count={commentCount} onClick={onComment}>
            <MessageCircle size={24} />
          </ActionButton>

          <ActionButton
            label="Save beat"
            count={saveCount}
            onClick={onSave}
            active={saved}
            activeClass="text-lime-300"
          >
            <Bookmark size={24} fill={saved ? 'currentColor' : 'none'} />
          </ActionButton>

          <div className="relative flex flex-col items-center gap-1.5">
            <ActionButton label="Share beat" count={shareCount} onClick={handleShare}>
              <Share2 size={24} />
            </ActionButton>
            {copied && (
              <span className="absolute -top-8 whitespace-nowrap rounded-full bg-lime-300 px-2.5 py-1 text-[10px] font-black text-black">
                Link copied!
              </span>
            )}
          </div>

          {isArtist && (
            <button
              onClick={onOffer}
              className="mt-1 rounded-full bg-lime-300 px-3 py-2 text-[10px] font-black text-black"
            >
              MAKE OFFER
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
