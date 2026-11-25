import { NextResponse } from 'next/server'
import { requireVerifiedUser } from '@/lib/auth-guards'
import { prisma } from '@/lib/prisma'

/**
 * GET /api/follows — every user id the current user follows. Drives the
 * feed's + follow badge and the Following tab's empty state.
 */
export async function GET() {
  const verified = await requireVerifiedUser()
  if (verified instanceof NextResponse) return verified

  const rows = await prisma.follow.findMany({
    where: { followerId: verified.userId },
    select: { followingId: true },
  })

  return NextResponse.json({ followedIds: rows.map(row => row.followingId) })
}
