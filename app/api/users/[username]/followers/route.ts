import { NextResponse } from 'next/server'
import { requireVerifiedUser } from '@/lib/auth-guards'
import { prisma } from '@/lib/prisma'
import { listFollowUsers } from '@/lib/follows'

/**
 * GET /api/users/[username]/followers?page=N — paged follower list
 * (30 per page, newest first). Each entry carries whether the current user
 * follows them.
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
  const { users, hasMore } = await listFollowUsers(user.id, 'followers', page, verified.userId)

  return NextResponse.json({ users, hasMore, page })
}
