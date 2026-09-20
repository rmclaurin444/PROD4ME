'use client'

import { useState } from 'react'
import { Bookmark, Heart, MessageCircle, Share2, X } from 'lucide-react'
import { Avatar, TagPills } from '@/components/app/ui'
import { formatCount } from '@/components/app/data'

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

      <img src={beat.art} alt={`${beat.title} artwork`} className="absolute inset-0 size-full object-cover" />
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
                <p className="text-xs text-white/60">beat · {beat.plays} plays</p>
              </div>
            </button>
          </div>

          <h1 className="text-5xl font-black tracking-tighter md:text-7xl">{beat.title}</h1>

          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs font-bold">
            <TagPills tags={beat.tags} onTag={onTag} />
            <span className="rounded-md bg-white/15 px-2 py-1">{beat.bpm} BPM</span>
            {isArtist && (
              <>
                <span className="rounded-md bg-white/15 px-2 py-1">{beat.offers ?? 12} offers</span>
              </>
            )}
            <span className="text-white/60">
              {beat.price === 0 ? (
                <span className="rounded-full bg-lime-300 px-2 py-1 font-black text-black">FREE</span>
              ) : (
                `from $${beat.price}`
              )}
            </span>
          </div>
        </div>

        <div className="flex shrink-0 flex-col items-center gap-4">
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
