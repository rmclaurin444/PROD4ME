import { NextResponse } from 'next/server'
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
    select: { id: true },
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

  await prisma.engagementEvent.create({
    data: {
      userId,
      beatId,
      type: type as EventTypeName,
    },
  })

  // vector: keep the taste vector in sync. Non-blocking by rule — the request
  // answers immediately and a rebuild failure must not fail the request.
  void rebuildUserVector(userId).catch(err =>
    console.warn('rebuildUserVector failed for', userId, err)
  )

  return NextResponse.json({ ok: true })
}
