import { NextResponse } from 'next/server'
import { requireVerifiedUser } from '@/lib/auth-guards'
import { prisma } from '@/lib/prisma'
import { avatarUrl } from '@/lib/messaging'
import { beatInclude, shapeBeat } from '@/lib/beats'

/**
 * GET /api/users/[username] — public profile (verified users only): name,
 * username, role, bio, avatar, banner, theme, and the user's beats shaped
 * like everywhere else (lib/beats). Private fields (email, phone, tokens,
 * verification state) are never selected.
 */
export async function GET(_request: Request, ctx: { params: Promise<{ username: string }> }) {
  const verified = await requireVerifiedUser()
  if (verified instanceof NextResponse) return verified

  const { username } = await ctx.params
  const user = await prisma.user.findUnique({
    where: { username: username.toLowerCase() },
    select: {
      id: true,
      name: true,
      username: true,
      role: true,
      bio: true,
      avatar: true,
      banner: true,
      theme: true,
      _count: { select: { followers: true, following: true } },
    },
  })
  if (!user) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 })
  }

  const [isFollowing, beats] = await Promise.all([
    prisma.follow.findUnique({
      where: { followerId_followingId: { followerId: verified.userId, followingId: user.id } },
      select: { followerId: true },
    }),
    prisma.beat.findMany({
      where: { producerId: user.id },
      include: beatInclude,
      orderBy: { createdAt: 'desc' },
      take: 50,
    }),
  ])

  return NextResponse.json({
    user: {
      id: user.id,
      name: user.name,
      username: user.username,
      role: user.role,
      bio: user.bio,
      theme: user.theme,
      avatarUrl: avatarUrl(user.avatar),
      bannerUrl: avatarUrl(user.banner),
      followerCount: user._count.followers,
      followingCount: user._count.following,
      isFollowing: isFollowing !== null,
    },
    beats: await Promise.all(beats.map(beat => shapeBeat(beat))),
  })
}
