import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { requireVerifiedUser } from '@/lib/auth-guards'
import { prisma } from '@/lib/prisma'
import { dollarsToCents } from '@/lib/offers'
import { MAX_PRICE_DOLLARS } from '@/lib/money'

function bad(error: string, status = 400) {
  return NextResponse.json({ error }, { status })
}

async function loadOwnedPlaylist(id: string, producerId: string) {
  const playlist = await prisma.playlist.findUnique({
    where: { id },
    include: { beats: { select: { id: true, price: true, exclusivePriceCents: true, exclusiveSold: true, producerId: true } } },
  })
  if (!playlist) return { error: bad('Playlist not found', 404) }
  if (playlist.producerId !== producerId) return { error: bad('Not your playlist', 403) }
  return { playlist }
}

/**
 * Owner-only playlist updates. Body is all-optional:
 *  - title / description / artKey / artPreset — details
 *  - positions: [{ beatId, position }] — reorder (beats must be in this playlist)
 *  - removeBeatId — detach a beat (the beat itself is NOT deleted)
 *  - price — set every beat's non-exclusive price (same rules as PATCH
 *    /api/beats/[id]: 0 or 0.5–600 whole-dollar slider values)
 *  - exclusivePrice — set every beat's exclusive price; beats whose exclusive
 *    has already sold are skipped for the exclusive part
 */
export async function PATCH(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user?.id) return bad('Unauthorized', 401)
  if (session.user.role !== 'PRODUCER') return bad('Only producers own playlists', 403)

  const { id } = await ctx.params
  const loaded = await loadOwnedPlaylist(id, session.user.id)
  if (loaded.error) return loaded.error
  const playlist = loaded.playlist

  let body: {
    title?: string
    description?: string | null
    artKey?: string | null
    artPreset?: string | null
    positions?: Array<{ beatId?: unknown; position?: unknown }>
    removeBeatId?: string
    price?: number
    exclusivePrice?: number | string | null
  }
  try {
    body = await request.json()
  } catch {
    return bad('Invalid request body')
  }

  // ---- details ----
  if (body.title !== undefined) {
    const title = body.title.trim()
    if (!title) return bad('Playlist title is required')
    if (title.length > 80) return bad('Playlist title is too long (max 80 characters)')
  }
  if (body.description !== undefined && body.description !== null && body.description.length > 280) {
    return bad('Description is too long (max 280 characters)')
  }

  const detailData: { title?: string; description?: string | null; updatedAt?: Date } = {}
  if (body.title !== undefined) detailData.title = body.title.trim()
  if (body.description !== undefined) detailData.description = body.description?.trim() || null

  if (Object.keys(detailData).length > 0) {
    detailData.updatedAt = new Date()
    await prisma.playlist.update({ where: { id }, data: detailData })
  }

  // ---- remove a beat (detached, not deleted) ----
  if (body.removeBeatId) {
    const beat = playlist.beats.find(b => b.id === body.removeBeatId)
    if (!beat) return bad('Beat is not in this playlist', 404)
    await prisma.beat.update({
      where: { id: beat.id },
      data: { playlistId: null, playlistPosition: null },
    })
  }

  // ---- reorder ----
  if (Array.isArray(body.positions)) {
    for (const entry of body.positions) {
      const beatId = typeof entry.beatId === 'string' ? entry.beatId : null
      const position = typeof entry.position === 'number' && Number.isFinite(entry.position) ? Math.floor(entry.position) : null
      if (!beatId || position === null) return bad('Invalid positions payload')
      const beat = playlist.beats.find(b => b.id === beatId)
      if (!beat) return bad('Beat is not in this playlist', 404)
      await prisma.beat.update({
        where: { id: beatId },
        data: { playlistPosition: position },
      })
    }
  }

  // ---- bulk price change (same rules as PATCH /api/beats/[id]) ----
  const wantsPrice = body.price !== undefined
  const wantsExclusive = body.exclusivePrice !== undefined
  if (wantsPrice || wantsExclusive) {
    const price = wantsPrice ? Number(body.price) : (playlist.beats[0]?.price ?? 0)
    if (typeof price !== 'number' || !Number.isFinite(price) || price < 0 || price > MAX_PRICE_DOLLARS) {
      return bad(`Price must be 0 or between 0.5 and ${MAX_PRICE_DOLLARS}`)
    }
    if (price > 0 && price < 0.5) {
      return bad('Price must be $0 (free) or at least $0.50')
    }

    let exclusivePriceCents: number | null
    if (!wantsExclusive) {
      exclusivePriceCents = null // untouched below when undefined handled per beat
    } else if (body.exclusivePrice === null || body.exclusivePrice === '') {
      exclusivePriceCents = null
    } else {
      const exclusive = Number(body.exclusivePrice)
      if (!Number.isFinite(exclusive) || exclusive < 0.5) {
        return bad('Exclusive price must be at least $0.50')
      }
      if (exclusive > MAX_PRICE_DOLLARS) {
        return bad(`Exclusive price must be at most $${MAX_PRICE_DOLLARS}`)
      }
      if (exclusive <= price) {
        return bad('Exclusive price must be greater than the non-exclusive price')
      }
      exclusivePriceCents = dollarsToCents(exclusive)
    }

    for (const beat of playlist.beats) {
      // per-beat exclusive: sold beats keep their current exclusive price
      const nextExclusive =
        exclusivePriceCents !== null && exclusivePriceCents !== undefined
          ? beat.exclusiveSold
            ? beat.exclusivePriceCents
            : exclusivePriceCents
          : exclusivePriceCents ?? beat.exclusivePriceCents
      const unchanged =
        beat.price === price && nextExclusive === beat.exclusivePriceCents
      if (unchanged) continue
      await prisma.beat.update({
        where: { id: beat.id },
        data: { price, exclusivePriceCents: nextExclusive },
      })
    }
  }

  const updated = await prisma.playlist.findUnique({
    where: { id },
    include: { beats: { orderBy: [{ playlistPosition: 'asc' }, { createdAt: 'asc' }], select: { id: true } } },
  })

  return NextResponse.json({ playlist: updated })
}

/** Owner-only delete. Beats are detached automatically (SetNull) — the beats
 *  themselves stay live in the feed. */
export async function DELETE(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user?.id) return bad('Unauthorized', 401)
  if (session.user.role !== 'PRODUCER') return bad('Only producers own playlists', 403)

  const { id } = await ctx.params
  const loaded = await loadOwnedPlaylist(id, session.user.id)
  if (loaded.error) return loaded.error

  await prisma.playlist.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}

