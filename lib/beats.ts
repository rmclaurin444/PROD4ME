/**
 * Beat data shaping layer.
 * Transforms Prisma Beat rows into the flat format consumed by the UI.
 */
import { prisma } from '@/lib/prisma'
import { BUCKET_ARTWORK, BUCKET_AUDIO, publicUrl, presignDownload } from '@/lib/storage'

// Prisma include clause for fetching beats with relations
export const beatInclude = {
  producer: { select: { id: true, name: true, avatar: true } },
  tags: { select: { id: true, name: true, slug: true } },
}

/** Flat beat shape for client consumption (no nested relations) */
export type ShapedBeat = {
  id: string
  title: string
  producer: string
  producerId: string
  avatar: string
  tags: string[]
  bpm: number | null
  musicalKey: string | null
  price: number
  plays: number
  likes: number
  saves: number
  shares: number
  comments: number
  durationSec: number | null
  artUrl: string | null
  artPreset: string | null
  peaks: number[] | null
  audioUrl: string
}

/**
 * Fetch and shape beats for the feed.
 * Resolves artwork URLs (uploaded or preset), generates presigned audio URLs.
 * Used by both app/page.tsx (SSR) and GET /api/beats.
 */
export async function getBeats(take = 50): Promise<ShapedBeat[]> {
  const beats = await prisma.beat.findMany({
    include: beatInclude,
    orderBy: { createdAt: 'desc' },
    take,
  })

  return Promise.all(
    beats.map(async beat => ({
      id: beat.id,
      title: beat.title,
      producer: beat.producer.name,
      producerId: beat.producer.id,
      // Fallback avatar: first two letters of name, uppercased
      avatar: beat.producer.avatar ?? beat.producer.name.slice(0, 2).toUpperCase(),
      tags: beat.tags.map(t => t.name),
      bpm: beat.bpm,
      musicalKey: beat.musicalKey,
      price: beat.price,
      plays: beat.plays,
      likes: beat.likes,
      saves: beat.saves,
      shares: beat.shares,
      comments: beat.comments,
      durationSec: beat.durationSec,
      // Uploaded artwork via public bucket URL, or external URL, or null (use preset)
      artUrl: beat.artKey ? publicUrl(BUCKET_ARTWORK, beat.artKey) : beat.artUrl,
      artPreset: beat.artPreset,
      peaks: Array.isArray(beat.peaks) ? (beat.peaks as number[]) : null,
      // Audio is private — generate 1-hour presigned URL
      audioUrl: await presignDownload(BUCKET_AUDIO, beat.audioKey, 3600),
    }))
  )
}

/** Format large numbers for display (e.g., 12400 → "12.4K") */
export function formatPlays(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, '')}K`
  return String(n)
}
