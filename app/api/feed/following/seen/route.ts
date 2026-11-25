import { NextResponse } from 'next/server'
import { requireVerifiedUser } from '@/lib/auth-guards'
import { prisma } from '@/lib/prisma'

/**
 * POST /api/feed/following/seen — opening the Following tab marks the user's
 * followingFeedSeenAt to now, so the has-new dot and the "New" labels reset.
 */
export async function POST() {
  const verified = await requireVerifiedUser()
  if (verified instanceof NextResponse) return verified

  await prisma.user.update({
    where: { id: verified.userId },
    data: { followingFeedSeenAt: new Date() },
  })

  return NextResponse.json({ ok: true })
}
