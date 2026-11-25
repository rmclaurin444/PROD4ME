import { prisma } from './prisma.ts'
import { avatarUrl, blockedEitherDirection } from './messaging.ts'
import { rebuildUserVector } from './recommendations/vectors.ts'

/**
 * Follow system (Prompt 13): idempotent follow/unfollow with a per-user
 * rate limit, block awareness, and the recommendation signal — following a
 * producer records one FOLLOW_PRODUCER event on their most recent beat;
 * unfollowing removes those events. Vectors rebuild non-blocking.
 */

const FOLLOW_WINDOW_MS = 60 * 60 * 1000
const FOLLOW_LIMIT_PER_HOUR = 60

const followHits = new Map<string, number[]>()

export function followRateLimited(userId: string): boolean {
  const now = Date.now()
  const recent = (followHits.get(userId) ?? []).filter(t => now - t < FOLLOW_WINDOW_MS)
  recent.push(now)
  followHits.set(userId, recent)
  return recent.length > FOLLOW_LIMIT_PER_HOUR
}

/** Follow a user. Idempotent; rejected when blocked either direction.
 *  Returns 'created' | 'exists' | 'blocked' | 'self'. */
export async function followUser(followerId: string, followingId: string): Promise<'created' | 'exists' | 'blocked' | 'self'> {
  if (followerId === followingId) return 'self'
  if (await blockedEitherDirection(followerId, followingId)) return 'blocked'

  const existing = await prisma.follow.findUnique({
    where: { followerId_followingId: { followerId, followingId } },
    select: { followerId: true },
  })
  if (existing) return 'exists'

  await prisma.follow.create({ data: { followerId, followingId } })

  // recommendation signal: one FOLLOW_PRODUCER event on the producer's most
  // recent live beat (the event needs a beatId). No beat → no event.
  const latestBeat = await prisma.beat.findFirst({
    where: { producerId: followingId, exclusiveSold: false },
    orderBy: { createdAt: 'desc' },
    select: { id: true },
  })
  if (latestBeat) {
    try {
      await prisma.engagementEvent.create({
        data: { userId: followerId, beatId: latestBeat.id, type: 'FOLLOW_PRODUCER' },
      })
    } catch {
      // dedupe races are fine — the signal just needs to exist once
    }
  }

  void rebuildUserVector(followerId).catch(err =>
    console.warn('rebuildUserVector failed for', followerId, err)
  )
  return 'created'
}

/** Unfollow a user. Idempotent; also removes the FOLLOW_PRODUCER signal. */
export async function unfollowUser(followerId: string, followingId: string): Promise<void> {
  await prisma.follow.deleteMany({ where: { followerId, followingId } })
  await prisma.engagementEvent.deleteMany({
    where: {
      userId: followerId,
      type: 'FOLLOW_PRODUCER',
      beat: { producerId: followingId },
    },
  })
  void rebuildUserVector(followerId).catch(err =>
    console.warn('rebuildUserVector failed for', followerId, err)
  )
}

/** Blocking removes follows in BOTH directions. */
export async function removeFollowsBetween(a: string, b: string): Promise<void> {
  await prisma.follow.deleteMany({
    where: {
      OR: [
        { followerId: a, followingId: b },
        { followerId: b, followingId: a },
      ],
    },
  })
}

export type ShapedFollowUser = {
  id: string
  name: string
  username: string
  role: string
  avatarUrl: string | null
  isFollowing: boolean
}

/** One page of a user's followers or follows (30 per page, offset paging). */
export async function listFollowUsers(
  userId: string,
  direction: 'followers' | 'following',
  page: number,
  viewerId: string
): Promise<{ users: ShapedFollowUser[]; hasMore: boolean }> {
  const pageSize = 30
  const where =
    direction === 'followers' ? { followingId: userId } : { followerId: userId }

  const rows = await prisma.follow.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    skip: page * pageSize,
    take: pageSize + 1,
    include: {
      ...(direction === 'followers'
        ? { following: false, follower: { select: { id: true, name: true, username: true, role: true, avatar: true } } }
        : { follower: false, following: { select: { id: true, name: true, username: true, role: true, avatar: true } } }),
    },
  })

  const hasMore = rows.length > pageSize
  const pageRows = rows.slice(0, pageSize)
  const users = pageRows.map(row => {
    const user = direction === 'followers' ? row.follower : row.following
    return {
      id: user.id,
      name: user.name,
      username: user.username,
      role: user.role,
      avatarUrl: avatarUrl(user.avatar),
      isFollowing: false, // filled in below
    }
  })

  // which of these the viewer follows (one query for the whole page)
  const ids = users.map(user => user.id)
  let followedSet = new Set<string>()
  if (ids.length > 0 && viewerId) {
    const followedRows = await prisma.follow.findMany({
      where: { followerId: viewerId, followingId: { in: ids } },
      select: { followingId: true },
    })
    followedSet = new Set(followedRows.map(row => row.followingId))
  }
  for (const user of users) {
    user.isFollowing = followedSet.has(user.id)
  }

  return { users, hasMore }
}
