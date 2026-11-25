import { NextResponse } from 'next/server'
import { requireVerifiedUser } from '@/lib/auth-guards'
import { prisma } from '@/lib/prisma'
import { avatarUrl } from '@/lib/messaging'
import { publicUrl, BUCKET_ARTWORK } from '@/lib/storage'

/**
 * GET /api/feed/following/suggestions — six producers for the Following
 * tab's empty state: this week's top producers from the leaderboard
 * snapshots (Prompt 5), falling back to producers with the most streams.
 * Each entry carries a cover from their latest beat and whether the current
 * user follows them.
 */
export async function GET() {
  const verified = await requireVerifiedUser()
  if (verified instanceof NextResponse) return verified

  const snapshotWeek = await prisma.leaderboardSnapshot.findFirst({
    orderBy: { weekStart: 'desc' },
    select: { weekStart: true },
  })
  let suggestions: Array<{
    id: string
    name: string
    username: string
    avatarUrl: string | null
    coverUrl: string | null
    isFollowing: boolean
  }> = []

  const buildFrom = async (
    producerIds: string[],
    limit: number
  ): Promise<typeof suggestions> => {
    const ids = [...new Set(producerIds)].slice(0, limit)
    if (ids.length === 0) return []

    const producers = await prisma.user.findMany({
      where: { id: { in: ids }, role: 'PRODUCER' },
      select: { id: true, name: true, username: true, avatar: true },
    })
    const byId = new Map(producers.map(p => [p.id, p]))

    const followedRows = await prisma.follow.findMany({
      where: { followerId: verified.userId, followingId: { in: ids } },
      select: { followingId: true },
    })
    const followedSet = new Set(followedRows.map(row => row.followingId))

    const out: typeof suggestions = []
    for (const id of ids) {
      const producer = byId.get(id)
      if (!producer) continue
      const latestBeat = await prisma.beat.findFirst({
        where: { producerId: id },
        orderBy: { createdAt: 'desc' },
        select: { artKey: true, artUrl: true, artPreset: true },
      })
      out.push({
        id: producer.id,
        name: producer.name,
        username: producer.username,
        avatarUrl: avatarUrl(producer.avatar),
        coverUrl: latestBeat
          ? latestBeat.artKey
            ? publicUrl(BUCKET_ARTWORK, latestBeat.artKey)
            : latestBeat.artUrl
          : null,
        isFollowing: followedSet.has(id),
      })
    }
    return out
  }

  if (snapshotWeek) {
    const snapshotRows = await prisma.leaderboardSnapshot.findMany({
      where: { weekStart: snapshotWeek.weekStart, kind: 'PRODUCER' },
      orderBy: { rank: 'asc' },
      take: 12,
      select: { producerId: true },
    })
    suggestions = await buildFrom(
      snapshotRows.map(row => row.producerId).filter((id): id is string => id !== null),
      6,
    )
  }

  // fallback: producers with the most streams
  if (suggestions.length < 6) {
    const streamLeaders = await prisma.$queryRaw<Array<{ producerId: string }>>`
      SELECT b."producerId"
      FROM "Beat" b
      WHERE b."streams" > 0
      GROUP BY b."producerId"
      ORDER BY SUM(b."streams") DESC
      LIMIT 12`
    const fallback = await buildFrom(
      streamLeaders.map(row => row.producerId),
      6,
    )
    // merge without duplicates
    const seen = new Set(suggestions.map(s => s.id))
    for (const item of fallback) {
      if (suggestions.length >= 6) break
      if (!seen.has(item.id)) {
        suggestions.push(item)
        seen.add(item.id)
      }
    }
  }

  return NextResponse.json({ suggestions })
}
