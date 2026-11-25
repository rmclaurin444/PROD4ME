import { NextResponse } from 'next/server'
import { requireVerifiedUser } from '@/lib/auth-guards'
import { prisma } from '@/lib/prisma'
import { listFollowUsers } from '@/lib/follows'

/**
 * GET /api/users/[username]/following?page=N — paged list of who this user
 * follows (30 per page, newest first), with whether the current user
 * follows each of them.
 */
export async function GET(request: Request, ctx: { params: Promise<{ username: string }> }) {
  const verified = await requireVerifiedUser()
  if (verified instanceof NextResponse) return verified

  const { username } = await ctx.params
  const user = await prisma.user.findUnique({
    where: { username: username.toLowerCase() },
    select: { id: true },
  })
  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })

  const page = Math.max(0, Number(new URL(request.url).searchParams.get('page') ?? '0') || 0)
  const { users, hasMore } = await listFollowUsers(user.id, 'following', page, verified.userId)

  return NextResponse.json({ users, hasMore, page })
}
