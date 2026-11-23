import { NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { ALL_EVENT_TYPES, type EventTypeName } from '@/lib/recommendations/constants'
import { rebuildUserVector } from '@/lib/recommendations/vectors.ts'

/**
 * Engagement event ingestion for the recommendation system. All validation
 * is server-side:
 *  - 401: not authenticated
 *  - 400: malformed JSON, unknown event type, or unknown beat id
 *  - dedupe: LIKE/SAVE are idempotent per (user, beat, type) — a repeat call
 *    succeeds (200) and writes no second row
 *
 * When an event is actually stored, the matching `Beat` counter is bumped
 * (plays/likes/saves/comments/shares) so the numbers in the feed and
 * dashboard track reality. Rules:
 *  - PLAY_50 bumps `plays` at most once per user per beat per 24 hours
 *    (replays within a day don't re-count; the event is still stored).
 *  - A producer's events on their own beats never bump counters (still
 *    stored, so recommendations stay unchanged).
 */
export async function POST(request: Request) {
  const session = await auth()
  const userId = session?.user?.id

  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: { beatId?: unknown; type?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { beatId, type } = body

  if (typeof beatId !== 'string' || beatId.length === 0) {
    return NextResponse.json({ error: 'beatId is required' }, { status: 400 })
  }

  if (typeof type !== 'string' || !(ALL_EVENT_TYPES as string[]).includes(type)) {
    return NextResponse.json({ error: 'Invalid event type' }, { status: 400 })
  }

  const beat = await prisma.beat.findUnique({
    where: { id: beatId },
    select: { id: true, producerId: true },
  })

  if (!beat) {
    return NextResponse.json({ error: 'Beat not found' }, { status: 400 })
  }

  const duplicatesIgnored = type === 'LIKE' || type === 'SAVE'

  if (duplicatesIgnored) {
    const existing = await prisma.engagementEvent.findFirst({
      where: { userId, beatId, type: type as EventTypeName },
      select: { id: true },
    })

    if (existing) {
      return NextResponse.json({ ok: true, duplicate: true })
    }
  }

  // PLAY_50 bumps plays at most once per user per beat per 24h — replays
  // inside the window are stored (recommendations unchanged) but not counted.
  let bumpPlays = type === 'PLAY_50'
  if (bumpPlays) {
    const recentPlay = await prisma.engagementEvent.findFirst({
      where: {
        userId,
        beatId,
        type: 'PLAY_50',
        createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
      },
      select: { id: true },
    })
    if (recentPlay) bumpPlays = false
  }

  const isOwnBeat = beat.producerId === userId

  const ops: Array<Prisma.PrismaPromise<unknown>> = [
    prisma.engagementEvent.create({
      data: {
        userId,
        beatId,
        type: type as EventTypeName,
      },
    }),
  ]

  // counters never move for a producer acting on their own beat
  const counter = counterOp(beatId, type as EventTypeName, bumpPlays && !isOwnBeat)
  if (counter) ops.push(counter)

  await prisma.$transaction(ops)

  // vector: keep the taste vector in sync. Non-blocking by rule — the request
  // answers immediately and a rebuild failure must not fail the request.
  void rebuildUserVector(userId).catch(err =>
    console.warn('rebuildUserVector failed for', userId, err)
  )

  return NextResponse.json({ ok: true })
}

/**
 * Unlike path: deletes the user's LIKE event for a beat (so the taste vector
 * stops favoring it) and lowers the beat's like counter — again skipping
 * the producer's own beats. Vector rebuild stays non-blocking.
 */
export async function DELETE(request: Request) {
  const session = await auth()
  const userId = session?.user?.id

  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: { beatId?: unknown; type?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { beatId, type } = body

  if (typeof beatId !== 'string' || beatId.length === 0) {
    return NextResponse.json({ error: 'beatId is required' }, { status: 400 })
  }
  if (type !== 'LIKE') {
    return NextResponse.json({ error: 'Only unliking is supported' }, { status: 400 })
  }

  const beat = await prisma.beat.findUnique({
    where: { id: beatId },
    select: { id: true, producerId: true },
  })
  if (!beat) {
    return NextResponse.json({ error: 'Beat not found' }, { status: 400 })
  }

  const deleted = await prisma.engagementEvent.deleteMany({
    where: { userId, beatId, type: 'LIKE' },
  })

  if (deleted.count > 0 && beat.producerId !== userId) {
    // keep the counter at zero, never negative
    await prisma.$executeRaw`
      UPDATE "Beat" SET "likes" = GREATEST("likes" - 1, 0) WHERE id = ${beatId}`
  }

  if (deleted.count > 0) {
    void rebuildUserVector(userId).catch(err =>
      console.warn('rebuildUserVector failed for', userId, err)
    )
  }

  return NextResponse.json({ ok: true, removed: deleted.count })
}

/** Counter bump for a freshly stored event (null for types without one). */
function counterOp(
  beatId: string,
  type: EventTypeName,
  bumpPlays: boolean
): Prisma.PrismaPromise<unknown> | null {
  if (type === 'PLAY_50') {
    if (!bumpPlays) return null
    return prisma.beat.update({ where: { id: beatId }, data: { plays: { increment: 1 } } })
  }
  if (type === 'LIKE') {
    return prisma.beat.update({ where: { id: beatId }, data: { likes: { increment: 1 } } })
  }
  if (type === 'SAVE') {
    return prisma.beat.update({ where: { id: beatId }, data: { saves: { increment: 1 } } })
  }
  if (type === 'COMMENT') {
    return prisma.beat.update({ where: { id: beatId }, data: { comments: { increment: 1 } } })
  }
  if (type === 'SHARE') {
    return prisma.beat.update({ where: { id: beatId }, data: { shares: { increment: 1 } } })
  }
  return null
}
