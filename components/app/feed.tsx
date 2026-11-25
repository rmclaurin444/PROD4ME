'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { Bookmark, Heart, MessageCircle, Play, Plus, RotateCw, Share2, Volume2, VolumeX, X } from 'lucide-react'
import { Avatar, TagPills } from '@/components/app/ui'
import { formatCount } from '@/components/app/data'
import { BeatCover } from '@/components/app/beat-cover'
import { Waveform } from '@/components/app/waveform'
import { computePeaksFromBuffer } from '@/lib/upload-client'
import { trackEvent } from '@/lib/recommendations/track'
import { formatMoney } from '@/lib/money'
import { STUDIO_ENABLED } from '@/lib/studio/flags'

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
  onShareMessage,
  onOffer,
  onBuy,
  owned,
  onNext,
  onPrev,
  isArtist,
  onPoster,
  feedMode = 'foryou',
  onModeChange,
  hasNewFollowing = false,
  followedProducerIds,
  onFollowProducer,
  isOwnBeat = false,
  isNewBeat = false,
  onRefresh,
  refreshing = false,
  canPullToRefresh = false,
  previewMode = false,
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
  /** opens the "Send in a message" picker (Prompt 9) */
  onShareMessage?: () => void
  onOffer: () => void
  onBuy: () => void
  owned: ('NON_EXCLUSIVE' | 'EXCLUSIVE')[]
  onNext: () => void
  /** wheel-up / swipe-down navigation (Prompt 12 back-scroll + preview) */
  onPrev?: () => void
  isArtist: boolean
  onPoster: (producer: { producerId: string }) => void
  /** Prompt 13: which feed tab is active — drives the tabs UI + tracking */
  feedMode?: 'foryou' | 'following'
  onModeChange?: (mode: 'foryou' | 'following') => void
  hasNewFollowing?: boolean
  /** ids of producers the current user follows (drives the + badge) */
  followedProducerIds?: string[]
  onFollowProducer?: (producerId: string) => void
  isOwnBeat?: boolean
  /** the current beat is new in the Following feed */
  isNewBeat?: boolean
  /** Prompt 12: pull-to-refresh (only offered on the first main-feed beat) */
  onRefresh?: () => void
  refreshing?: boolean
  /** pull-to-refresh gesture is only live on the first main-feed beat */
  canPullToRefresh?: boolean
  /**
   * Prompt 10: owner preview — everything renders with real counts, but no
   * engagement is recorded and the action buttons do nothing (the overlay
   * hands in no-op handlers; the gates below keep events/tags/share inert).
   */
  previewMode?: boolean
}) {
  const [copied, setCopied] = useState(false)
  const [shareMenuOpen, setShareMenuOpen] = useState(false)
  // Prompt 12: navigation direction for the slide animation
  const [direction, setDirection] = useState<'next' | 'prev' | null>(null)
  // Prompt 12: pull-to-refresh state
  const [pullReady, setPullReady] = useState(false)
  const touchStart = useRef<{ x: number; y: number } | null>(null)

  const audioRef = useRef<HTMLAudioElement>(null)
  const [soundOn, setSoundOn] = useState(false)
  const [audioFailed, setAudioFailed] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [fallbackPeaks, setFallbackPeaks] = useState<number[] | null>(null)

  // engagement tracking state — reset once per beat view (each play cycle)
  const firedPlay50 = useRef(false)
  const firedPlayComplete = useRef(false)

  useEffect(() => {
    setAudioFailed(false)
    setSoundOn(false)
    setCurrentTime(0)
    setDuration(0)
    setFallbackPeaks(null)
    firedPlay50.current = false
    firedPlayComplete.current = false

    const a = audioRef.current
    if (a) {
      // Try sound-on autoplay first; browsers block unmuted autoplay until
      // the user has interacted with the page, so fall back to the muted
      // TikTok-style autoplay when rejected.
      a.muted = false
      a.currentTime = 0
      a
        .play()
        .then(() => {
          if (!cancelled) setSoundOn(true)
        })
        .catch(() => {
          a.muted = true
          a.play().catch(() => {})
          if (!cancelled) setSoundOn(false)
        })
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

  // ---- Prompt 12 navigation: one direction per gesture, animated ----------
  const goNext = () => {
    setDirection('next')
    onNext()
  }
  const goPrev = () => {
    setDirection('prev')
    onPrev?.()
  }

  // touch: vertical swipe (>50px) navigates; a pull-down on the first beat
  // (when allowed) primes pull-to-refresh instead. Swipes that start on the
  // waveform, buttons, links, inputs, or modals are ignored.
  const handleTouchStart = (e: React.TouchEvent) => {
    const target = e.target as HTMLElement
    if (target.closest('button, a, input, textarea, select, [role="dialog"], [data-waveform]')) return
    touchStart.current = { x: e.touches[0]?.clientX ?? 0, y: e.touches[0]?.clientY ?? 0 }
  }
  const handleTouchMove = (e: React.TouchEvent) => {
    if (!touchStart.current || !onRefresh || !canPullToRefresh) return
    const dy = (e.touches[0]?.clientY ?? 0) - touchStart.current.y
    setPullReady(dy > 80)
  }
  const handleTouchEnd = (e: React.TouchEvent) => {
    const start = touchStart.current
    touchStart.current = null
    if (!start) return
    const dx = Math.abs((e.changedTouches[0]?.clientX ?? 0) - start.x)
    const dy = (e.changedTouches[0]?.clientY ?? 0) - start.y

    // pull-to-refresh wins when primed
    if (pullReady && dy > 80) {
      setPullReady(false)
      onRefresh?.()
      return
    }
    setPullReady(false)
    if (dx > 60) return // horizontal scroll — not a feed swipe
    if (dy < -50) goNext()
    else if (dy > 50) goPrev()
  }

  /** Playback-based engagement. The audio element is `loop`, so `ended` never
   *  fires; completion is detected as playback approaching full duration,
   *  once per view. PLAY_50 likewise fires once per view when half is heard.
   *  Suppressed in preview mode — the owner sees the beat as listeners do,
   *  but their own preview must not pollute the stats. */
  const handleAudioTimeUpdate = () => {
    const a = audioRef.current
    const d = a?.duration
    const t = a?.currentTime ?? 0
    setCurrentTime(t)

    if (previewMode) return
    if (!d || !Number.isFinite(d) || d <= 0) return
    if (t >= d / 2 && !firedPlay50.current) {
      firedPlay50.current = true
      trackEvent(beat.id, 'PLAY_50')
    }
    if (t >= d - 1 && !firedPlayComplete.current) {
      firedPlayComplete.current = true
      trackEvent(beat.id, 'PLAY_COMPLETE')
    }
  }

  const handleShare = async () => {
    if (previewMode) return
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
    // ARTWORK OVERLAY: everything below sits on beat artwork with a dark
    // gradient scrim, so text, icons and controls keep hardcoded white/black
    // styling in BOTH modes (theme tokens would become unreadable on images).
    <div
      className="relative flex min-h-screen flex-1 items-end overflow-hidden"
      onWheel={e => {
        if (e.deltaY > 30) goNext()
        else if (e.deltaY < -30) goPrev()
      }}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {/* Prompt 12: refresh button, top right (next to the tag chip row) */}
      {onRefresh && (
        <button
          onClick={onRefresh}
          disabled={refreshing}
          aria-label="Refresh feed"
          title="Refresh feed"
          className="absolute right-5 top-20 z-20 flex items-center gap-1.5 rounded-full border border-white/15 bg-black/60 px-3 py-2 text-xs font-black text-white backdrop-blur transition disabled:opacity-60"
        >
          <RotateCw size={13} className={refreshing ? 'animate-spin' : ''} />
          {refreshing ? 'Refreshing…' : 'Refresh feed'}
        </button>
      )}

      {/* Prompt 13: Following | For You tabs — top center, readable over
          artwork (white + shadow, the Prompt 3 overlay exception). Hidden
          while a tag filter is active (the chip takes over). */}
      {onModeChange && !tag && (
        <div className="absolute left-1/2 top-5 z-20 flex -translate-x-1/2 items-center gap-6">
          {(['following', 'foryou'] as const).map(mode => (
            <button
              key={mode}
              onClick={() => onModeChange(mode)}
              aria-pressed={feedMode === mode}
              className="relative flex items-center gap-1.5 pb-1 text-sm text-white/80 transition hover:text-white"
              style={{ textShadow: '0 1px 3px rgba(0,0,0,.8)' }}
            >
              {mode === 'following' ? 'Following' : 'For You'}
              {mode === 'following' && hasNewFollowing && (
                <span className="size-2 rounded-full bg-brand" />
              )}
              <span
                className={`absolute inset-x-0 bottom-0 h-0.5 rounded-full bg-white transition-opacity ${
                  feedMode === mode ? 'opacity-100' : 'opacity-0'
                }`}
              />
            </button>
          ))}
        </div>
      )}

      {/* Prompt 12: pull-to-release indicator */}
      {pullReady && (
        <div className="absolute inset-x-0 top-16 z-20 flex justify-center">
          <span className="flex items-center gap-2 rounded-full border border-white/15 bg-black/70 px-3 py-1.5 text-xs font-black text-white backdrop-blur">
            <RotateCw size={12} /> Release to refresh
          </span>
        </div>
      )}

      {tag && (
        <div className="absolute left-5 top-20 z-20 flex items-center gap-2 rounded-full border border-white/15 bg-black/60 px-3 py-2 text-sm font-black text-white backdrop-blur">
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
        onTimeUpdate={handleAudioTimeUpdate}
        onLoadedMetadata={() => setDuration(audioRef.current?.duration ?? 0)}
        onDurationChange={() => setDuration(audioRef.current?.duration ?? 0)}
      />

      <BeatCover
        artUrl={beat.artUrl}
        artPreset={beat.artPreset}
        title={beat.title}
        variant="feed"
        className="absolute inset-0"
      />
      <div className="absolute inset-0 bg-gradient-to-t from-black via-black/30 to-black/10" />

      {/* keyed on the beat so navigation replays the directional slide
          (250ms; disabled by prefers-reduced-motion in globals.css) */}
      <div
        key={beat.id}
        className={`relative z-10 flex w-full items-end gap-5 px-5 pb-28 pt-24 md:px-12 ${
          direction === 'next' ? 'feed-slide-next' : direction === 'prev' ? 'feed-slide-prev' : ''
        }`}
      >
        <div className="min-w-0 flex-1">
          <div className="mb-5 flex items-center gap-3">
            <div className="relative">
              <button
                onClick={() =>
                  onPoster({ producerId: beat.producerId })
                }
                className="flex items-center gap-3 text-left"
              >
                <Avatar text={beat.avatar} />
                <div>
                  <p className="text-sm font-bold text-white">
                    {beat.producer}
                    {feedMode === 'following' && isNewBeat && (
                      <span className="ml-2 rounded-md bg-brand px-1.5 py-0.5 align-middle text-[9px] font-black text-brand-foreground">
                        New
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-white/60">
                    beat · <Play size={11} className="inline" fill="currentColor" />{' '}
                    {formatCount(beat.streams)} streams
                  </p>
                </div>
              </button>
              {/* Prompt 13: TikTok-style follow badge — hidden on own beats
                  and while already following */}
              {onFollowProducer &&
                !followedProducerIds?.includes(beat.producerId) &&
                !isOwnBeat && (
                  <button
                    onClick={e => {
                      e.stopPropagation()
                      onFollowProducer(beat.producerId)
                    }}
                    aria-label={`Follow ${beat.producer}`}
                    title={`Follow ${beat.producer}`}
                    className="absolute -bottom-1.5 left-1/2 z-10 grid size-6 -translate-x-1/2 place-items-center rounded-full bg-brand text-brand-foreground shadow-lg transition hover:scale-110"
                  >
                    <Plus size={14} />
                  </button>
                )}
            </div>
          </div>

          <h1 className="text-5xl font-black tracking-tighter text-white md:text-7xl">{beat.title}</h1>

          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs font-bold">
            <TagPills
              tags={beat.tags}
              onTag={tagName => {
                if (previewMode) return
                trackEvent(beat.id, 'TAG_TAP')
                onTag(tagName)
              }}
            />
            {beat.bpm && <span className="rounded-md bg-white/15 px-2 py-1">{beat.bpm} BPM</span>}
            {beat.musicalKey && (
              <span className="rounded-md bg-white/15 px-2 py-1">{beat.musicalKey}</span>
            )}
            <span className="text-white/60">
              {beat.price === 0 ? (
                <span className="rounded-full bg-brand px-2 py-1 font-black text-brand-foreground">FREE</span>
              ) : (
                `from $${beat.price}`
              )}
              {beat.exclusivePriceCents !== null && !beat.exclusiveSold && (
                <span className="ml-2 rounded-md bg-white/15 px-2 py-1">
                  Exclusive {formatMoney(beat.exclusivePriceCents)}
                </span>
              )}
            </span>
            {beat.exclusiveSold && (
              <span className="rounded-md bg-error/25 px-2 py-1 font-black text-error">
                EXCLUSIVE: SOLD
              </span>
            )}
            {beat.licenseCount > 0 && (
              <span className="rounded-md bg-white/15 px-2 py-1 text-white/80">
                Licensed to {beat.licenseCount} artist{beat.licenseCount === 1 ? '' : 's'}
              </span>
            )}
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
                soundOn ? 'text-white' : 'text-white/70'
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
            activeClass="text-error"
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
            activeClass="text-white"
          >
            <Bookmark size={24} fill={saved ? 'currentColor' : 'none'} />
          </ActionButton>

          <div className="relative flex flex-col items-center gap-1.5">
            <ActionButton
              label="Share beat"
              count={shareCount}
              onClick={() => {
                if (previewMode) return
                setShareMenuOpen(open => !open)
              }}
            >
              <Share2 size={24} />
            </ActionButton>
            {copied && (
              <span className="absolute -top-8 whitespace-nowrap rounded-full bg-white px-2.5 py-1 text-[10px] font-black text-black">
                Link copied!
              </span>
            )}
            {shareMenuOpen && (
              <>
                {/* click-away backdrop */}
                <div
                  className="fixed inset-0 z-10"
                  onClick={() => setShareMenuOpen(false)}
                  aria-hidden
                />
                <div className="absolute bottom-0 right-0 z-20 w-52 overflow-hidden rounded-2xl border border-white/15 bg-black/80 text-sm font-bold text-white backdrop-blur">
                  <button
                    onClick={() => {
                      setShareMenuOpen(false)
                      onShareMessage?.()
                    }}
                    className="w-full px-4 py-3 text-left hover:bg-white/10"
                  >
                    Send in a message
                  </button>
                  <button
                    onClick={() => {
                      setShareMenuOpen(false)
                      void handleShare()
                    }}
                    className="w-full px-4 py-3 text-left hover:bg-white/10"
                  >
                    {typeof navigator !== 'undefined' && typeof navigator.share === 'function' ? 'Share via…' : 'Copy link'}
                  </button>
                </div>
              </>
            )}
          </div>

          {isArtist && (
            <div className="mt-1 flex flex-col items-center gap-1.5">
              {beat.exclusiveSold ? (
                <span className="rounded-full px-3 py-2 text-[10px] font-black text-error">
                  SOLD
                </span>
              ) : owned.includes('NON_EXCLUSIVE') ? (
                <>
                  <span className="rounded-full bg-white/20 px-3 py-2 text-[10px] font-black text-white">
                    IN LIBRARY
                  </span>
                  {STUDIO_ENABLED && (
                    <Link
                      href={`/studio?beat=${beat.id}`}
                      className="rounded-full bg-white/15 px-3 py-2 text-[10px] font-black text-white hover:bg-white/25"
                    >
                      OPEN IN STUDIO
                    </Link>
                  )}
                </>
              ) : beat.price === 0 ? (
                <>
                  <button
                    onClick={onOffer}
                    className="rounded-full bg-white px-3 py-2 text-[10px] font-black text-black"
                  >
                    GET FREE
                  </button>
                  {STUDIO_ENABLED && (
                    <Link
                      href={`/studio?beat=${beat.id}`}
                      className="rounded-full bg-white/15 px-3 py-2 text-[10px] font-black text-white hover:bg-white/25"
                    >
                      OPEN IN STUDIO
                    </Link>
                  )}
                </>
              ) : (
                <>
                  <button
                    onClick={onBuy}
                    className="rounded-full bg-white px-3 py-2 text-[10px] font-black text-black"
                  >
                    BUY NOW
                  </button>
                  <button
                    onClick={onOffer}
                    className="rounded-full border border-white/25 px-3 py-2 text-[10px] font-black text-white"
                  >
                    MAKE OFFER
                  </button>
                  {STUDIO_ENABLED && (
                    <Link
                      href={`/studio?beat=${beat.id}`}
                      className="rounded-full border border-white/25 px-3 py-2 text-[10px] font-black text-white/80 hover:bg-white/10"
                    >
                      TRY IN STUDIO
                    </Link>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
