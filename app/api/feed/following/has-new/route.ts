import { NextResponse } from 'next/server'
import { requireVerifiedUser } from '@/lib/auth-guards'
import { prisma } from '@/lib/prisma'

/**
 * GET /api/feed/following/has-new — whether any followed producer posted a
 * live beat after the user's followingFeedSeenAt. Drives the dot on the
 * Following tab.
 */
export async function GET() {
  const verified = await requireVerifiedUser()
  if (verified instanceof NextResponse) return verified

  const user = await prisma.user.findUnique({
    where: { id: verified.userId },
    select: { followingFeedSeenAt: true },
  })
  const seenAt = user?.followingFeedSeenAt

  const followed = await prisma.follow.findMany({
    where: { followerId: verified.userId },
    select: { followingId: true },
  })
  if (followed.length === 0) {
    return NextResponse.json({ hasNew: false })
  }

  const newer = await prisma.beat.count({
    where: {
      producerId: { in: followed.map(row => row.followingId) },
      ...(seenAt ? { createdAt: { gt: seenAt } } : {}),
    },
  })

  return NextResponse.json({ hasNew: newer > 0 })
}
