import { prisma } from './prisma.ts'
import { presignDownload, BUCKET_ARTWORK } from './storage.ts'
import type { ShapedBeat } from './beats.ts'

export type ShapedPlaylist = {
  id: string
  title: string
  description: string | null
  artUrl: string | null
  artPreset: string | null
  beats: ShapedBeat[]
}

/**
 * A producer's playlists with their beats, in playlist order. Beats are
 * shaped like feed beats (minus the audio presign — playlist views never
 * autoplay) so the existing PurchaseModal works on them as-is.
 */
export async function getProducerPlaylists(producerId: string): Promise<ShapedPlaylist[]> {
  const playlists = await prisma.playlist.findMany({
    where: { producerId },
    orderBy: { createdAt: 'desc' },
    include: {
      beats: {
        orderBy: [{ playlistPosition: 'asc' }, { createdAt: 'asc' }],
        include: {
          producer: { select: { name: true } },
          tags: { select: { name: true } },
          _count: { select: { licenses: true } },
        },
      },
    },
  })

  return Promise.all(
    playlists.map(async playlist => ({
      id: playlist.id,
      title: playlist.title,
      description: playlist.description,
      artUrl: playlist.artKey ? await presignDownload(BUCKET_ARTWORK, playlist.artKey) : null,
      artPreset: playlist.artPreset,
      beats: await Promise.all(
        playlist.beats.map(async beat => ({
        id: beat.id,
        title: beat.title,
        producer: beat.producer.name,
        producerId: playlist.producerId,
        avatar: playlist.producerId.slice(0, 2).toUpperCase(),
        tags: beat.tags.map(tag => tag.name),
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
        artUrl: beat.artKey ? await presignDownload(BUCKET_ARTWORK, beat.artKey) : null,
        artPreset: beat.artPreset,
        peaks: Array.isArray(beat.peaks) ? (beat.peaks as number[]) : null,
        // playlist views never autoplay — the presigned preview URL is not needed
        audioUrl: '',
      })),
      ),
    }))
  )
}
