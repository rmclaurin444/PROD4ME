import { prisma } from '@/lib/prisma'
import { BUCKET_ARTWORK, BUCKET_AUDIO, publicUrl, presignDownload } from '@/lib/storage'

export const beatInclude = {
  producer: { select: { id: true, name: true, avatar: true } },
  tags: { select: { id: true, name: true, slug: true } },
}

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
      artUrl: beat.artKey ? publicUrl(BUCKET_ARTWORK, beat.artKey) : beat.artUrl,
      artPreset: beat.artPreset,
      peaks: Array.isArray(beat.peaks) ? (beat.peaks as number[]) : null,
      audioUrl: await presignDownload(BUCKET_AUDIO, beat.audioKey, 3600),
    }))
  )
}

export function formatPlays(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, '')}K`
  return String(n)
}
