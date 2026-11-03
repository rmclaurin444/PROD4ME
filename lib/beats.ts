import { Prisma } from '@prisma/client'
import { prisma } from './prisma.ts'
import { BUCKET_ARTWORK, BUCKET_AUDIO, publicUrl, presignDownload } from './storage.ts'

export const beatInclude = {
  producer: { select: { id: true, name: true, avatar: true } },
  tags: { select: { id: true, name: true, slug: true } },
  _count: { select: { licenses: true } },
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
  exclusivePriceCents: number | null
  exclusiveSold: boolean
  licenseCount: number
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

export type BeatWithRelations = Prisma.BeatGetPayload<{ include: typeof beatInclude }>

/** DB row (with beatInclude relations) → client feed shape. Shared by the
 *  server-rendered loader and the recommendation feed so playback behavior,
 *  presigned audio, artwork URLs, and counters stay identical everywhere. */
export async function shapeBeat(beat: BeatWithRelations): Promise<ShapedBeat> {
  return {
    id: beat.id,
    title: beat.title,
    producer: beat.producer.name,
    producerId: beat.producer.id,
    avatar: beat.producer.avatar ?? beat.producer.name.slice(0, 2).toUpperCase(),
    tags: beat.tags.map(t => t.name),
    bpm: beat.bpm,
    musicalKey: beat.musicalKey,
    price: beat.price,
    exclusivePriceCents: beat.exclusivePriceCents,
    exclusiveSold: beat.exclusiveSold,
    licenseCount: beat._count.licenses,
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
  }
}

export async function getBeats(take = 50, interestNames: string[] = []): Promise<ShapedBeat[]> {
  const beats = await prisma.beat.findMany({
    include: beatInclude,
    orderBy: { createdAt: 'desc' },
    take,
  })

  const shaped = await Promise.all(beats.map(beat => shapeBeat(beat)))

  // Interest-aware ranking: reorder (never filter) by how many of the
  // viewer's genre interests appear in a beat's tags. Beats sharing more
  // interests rise; ties (and zero-overlap beats) stay newest-first.
  if (interestNames.length > 0) {
    const interestSet = new Set(interestNames.map(name => name.toLowerCase()))
    const scored = shaped.map((beat, index) => ({
      index,
      overlap: beat.tags.reduce(
        (count, tag) => count + (interestSet.has(tag.toLowerCase()) ? 1 : 0),
        0,
      ),
    }))
    scored.sort((a, b) => b.overlap - a.overlap || a.index - b.index)
    return scored.map(entry => shaped[entry.index])
  }

  return shaped
}

export function formatPlays(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, '')}K`
  return String(n)
}
