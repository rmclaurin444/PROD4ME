import { NextResponse } from 'next/server'
import { requireVerifiedUser } from '@/lib/auth-guards'
import { prisma } from '@/lib/prisma'
import { avatarUrl } from '@/lib/messaging'
import { SEARCH_MIN_CHARS, SEARCH_MAX_RESULTS } from '@/lib/messaging/constants'

/**
 * GET /api/users/search?q= — verified-user directory search by name or
 * username (case-insensitive). Excludes the current user and anyone who
 * blocked them. Never returns email, phone, or other private fields.
 */
export async function GET(request: Request) {
  const verified = await requireVerifiedUser()
  if (verified instanceof NextResponse) return verified

  const q = (new URL(request.url).searchParams.get('q') ?? '').trim()
  if (q.length < SEARCH_MIN_CHARS) {
    return NextResponse.json({ users: [] })
  }

  const users = await prisma.user.findMany({
    where: {
      AND: [
        {
          OR: [
            { name: { contains: q, mode: 'insensitive' } },
            { username: { contains: q, mode: 'insensitive' } },
          ],
        },
        // not me, and nobody who blocked me
        { id: { not: verified.userId } },
        { blocksSent: { none: { blockedId: verified.userId } } },
      ],
    },
    select: { id: true, name: true, username: true, role: true, avatar: true },
    orderBy: { name: 'asc' },
    take: SEARCH_MAX_RESULTS,
  })

  return NextResponse.json({
    users: users.map(user => ({
      id: user.id,
      name: user.name,
      username: user.username,
      role: user.role,
      avatarUrl: avatarUrl(user.avatar),
    })),
  })
}
