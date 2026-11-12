import { prisma } from '../prisma.ts'
import { rebuildUserVector } from './vectors.ts'
import type { EventTypeName } from './constants.ts'

/**
 * SERVER-side engagement recording for events the app itself knows about with
 * certainty — e.g. a license grant (free claim or finalized payment). This is
 * authoritative and covers grants that happen while the user is away (e.g.
 * the Stripe webhook path), which the client can never observe.
 *
 * The vector rebuild is deliberately fire-and-forget: callers are frequently
 * inside payment/webhook flows and must never be blocked or failed by
 * recommendation bookkeeping.
 */
export async function recordEngagementEvent(
  userId: string,
  beatId: string,
  type: EventTypeName,
): Promise<void> {
  await prisma.engagementEvent.create({
    data: { userId, beatId, type },
  })
  void rebuildUserVector(userId).catch(err =>
    console.warn('rebuildUserVector failed for', userId, err)
  )
}
