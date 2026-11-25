import { NextResponse } from 'next/server'
import { requireVerifiedUser } from '@/lib/auth-guards'
import { prisma } from '@/lib/prisma'
import { followRateLimited, followUser, unfollowUser } from '@/lib/follows'

/**
 * POST /api/follows/[userId]   — follow a user (idempotent)
 * DELETE /api/follows/[userId] — unfollow (idempotent)
 *
 *  - 401 unauthenticated / unverified
 *  - 400 self-follow
 *  - 403 blocked either direction (following) — unfollowing is always allowed
 *    so users can always leave
 *  - 429 rate limited: 60 follow changes per hour per user
 *  - 404 target user doesn't exist
 */
export async function POST(request: Request, ctx: { params: Promise<{ userId: string }> }) {
  const verified = await requireVerifiedUser()
  if (verified instanceof NextResponse) return verified

  const { userId: targetId } = await ctx.params
  if (targetId === verified.userId) {
    return NextResponse.json({ error: "You can't follow yourself" }, { status: 400 })
  }
  if (followRateLimited(verified.userId)) {
    return NextResponse.json({ error: 'Too many follow changes. Try again later.' }, { status: 429 })
  }

  const target = await prisma.user.findUnique({ where: { id: targetId }, select: { id: true } })
  if (!target) return NextResponse.json({ error: 'User not found' }, { status: 404 })

  const result = await followUser(verified.userId, targetId)
  if (result === 'blocked') {
    return NextResponse.json({ error: "You can't follow this user" }, { status: 403 })
  }

  return NextResponse.json({ ok: true, status: result })
}

export async function DELETE(request: Request, ctx: { params: Promise<{ userId: string }> }) {
  const verified = await requireVerifiedUser()
  if (verified instanceof NextResponse) return verified

  const { userId: targetId } = await ctx.params
  // unfollows count toward the same 60 changes/hour limit
  if (followRateLimited(verified.userId)) {
    return NextResponse.json({ error: 'Too many follow changes. Try again later.' }, { status: 429 })
  }
  await unfollowUser(verified.userId, targetId)
  return NextResponse.json({ ok: true })
}
