import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { presignDownload, BUCKET_ARTWORK, publicUrl } from '@/lib/storage'

function bad(error: string, status = 400) {
  return NextResponse.json({ error }, { status })
}

/**
 * Producer's own playlists with shaped beats (ordered by playlistPosition).
 * Used by the profile/dashboard views and for client-side refreshes.
 */
export async function GET() {
  const session = await auth()
  if (!session?.user?.id) return bad('Unauthorized', 401)
  if (session.user.role !== 'PRODUCER') return bad('Only producers own playlists', 403)

  const playlists = await prisma.playlist.findMany({
    where: { producerId: session.user.id },
    orderBy: { createdAt: 'desc' },
    include: {
      beats: {
        orderBy: [{ playlistPosition: 'asc' }, { createdAt: 'asc' }],
        include: { _count: { select: { licenses: true } } },
      },
    },
  })

  const shaped = await Promise.all(
    playlists.map(async playlist => ({
      id: playlist.id,
      title: playlist.title,
      description: playlist.description,
      artUrl: playlist.artKey ? await presignDownload(BUCKET_ARTWORK, playlist.artKey) : null,
      artPreset: playlist.artPreset,
      beats: playlist.beats.map(beat => ({
        id: beat.id,
        title: beat.title,
        price: beat.price,
        exclusivePriceCents: beat.exclusivePriceCents,
        exclusiveSold: beat.exclusiveSold,
        playlistPosition: beat.playlistPosition,
      })),
    }))
  )

  return NextResponse.json({ playlists: shaped })
}

/** Create an empty playlist (bulk upload flow creates it before its beats). */
export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user?.id) return bad('Unauthorized', 401)
  if (session.user.role !== 'PRODUCER') return bad('Only producers can create playlists', 403)

  let body: { title?: string; description?: string; artKey?: string | null; artPreset?: string | null }
  try {
    body = await request.json()
  } catch {
    return bad('Invalid request body')
  }

  const title = body.title?.trim()
  if (!title) return bad('Playlist title is required')
  if (title.length > 80) return bad('Playlist title is too long (max 80 characters)')
  if ((body.description ?? '').length > 280) return bad('Description is too long (max 280 characters)')

  const playlist = await prisma.playlist.create({
    data: {
      producerId: session.user.id,
      title,
      description: body.description?.trim() || null,
      artKey: body.artKey ?? null,
      artPreset: body.artPreset ?? null,
    },
  })

  return NextResponse.json(
    { playlist: { ...playlist, artUrl: playlist.artKey ? publicUrl(BUCKET_ARTWORK, playlist.artKey) : null } },
    { status: 201 }
  )
}
