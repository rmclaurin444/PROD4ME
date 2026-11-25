import { NextResponse } from 'next/server'
import { requireVerifiedUser } from '@/lib/auth-guards'
import { prisma } from '@/lib/prisma'
import { parseRange, rangeStart, type DailyPoint } from '@/lib/analytics'
import { formatMoney } from '@/lib/money'

/**
 * GET /api/beats/[id]/insights?range=7d|30d|all — owner-only beat stats.
 * Non-owners get a 404 (the beat's existence is not disclosed). The
 * producer's own events are excluded everywhere.
 *
 * Totals: streams, likes, comments, saves, shares, completion rate
 * (PLAY_COMPLETE ÷ STREAM), skips, offers received, licenses sold, and
 * revenue (sum of SUCCEEDED payments, in cents — displayed as dollars).
 * Plus daily streams for the range and the beat's best weekly leaderboard
 * rank from LeaderboardSnapshot, if it ever charted.
 */
export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const verified = await requireVerifiedUser()
  if (verified instanceof NextResponse) return verified
  const me = verified.userId

  const { id } = await ctx.params
  const beat = await prisma.beat.findUnique({
    where: { id },
    select: { id: true, producerId: true, title: true },
  })
  if (!beat || beat.producerId !== me) {
    return NextResponse.json({ error: 'Beat not found' }, { status: 404 })
  }

  const url = new URL(request.url)
  const range = parseRange(url.searchParams.get('range'))
  const start = rangeStart(range)

  const eventWhere = {
    beatId: id,
    userId: { not: me },
    ...(start ? { createdAt: { gte: start } } : {}),
  }

  const [engagementRows, offersReceived, licensesSold, revenueAgg, streamRows, bestRankRow] =
    await Promise.all([
      prisma.engagementEvent.groupBy({
        by: ['type'],
        where: eventWhere,
        _count: { _all: true },
      }),
      prisma.offer.count({ where: { beatId: id, ...(start ? { createdAt: { gte: start } } : {}) } }),
      prisma.license.count({ where: { beatId: id, ...(start ? { createdAt: { gte: start } } : {}) } }),
      prisma.payment.aggregate({
        where: { beatId: id, status: 'SUCCEEDED', ...(start ? { createdAt: { gte: start } } : {}) },
        _sum: { amountCents: true },
      }),
      prisma.engagementEvent.findMany({
        where: { ...eventWhere, type: 'STREAM' },
        select: { createdAt: true },
      }),
      prisma.leaderboardSnapshot.aggregate({
        where: { beatId: id, kind: 'BEAT' },
        _min: { rank: true },
      }),
    ])

  const countOf = (type: string) => engagementRows.find(row => row.type === type)?._count._all ?? 0
  const streams = countOf('STREAM')
  const completions = countOf('PLAY_COMPLETE')

  // daily streams, UTC calendar-day buckets (oldest → newest)
  const buckets = new Map<string, number>()
  for (const row of streamRows) {
    const key = row.createdAt.toISOString().slice(0, 10)
    buckets.set(key, (buckets.get(key) ?? 0) + 1)
  }
  const dailyStreams: DailyPoint[] = [...buckets.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .map(([date, count]) => ({ date, count }))

  return NextResponse.json({
    range,
    totals: {
      streams,
      likes: countOf('LIKE'),
      comments: countOf('COMMENT'),
      saves: countOf('SAVE'),
      shares: countOf('SHARE'),
      completionRate: streams > 0 ? completions / streams : null,
      skips: countOf('SKIP'),
      offersReceived,
      licensesSold,
      revenueCents: revenueAgg._sum.amountCents ?? 0,
      revenueLabel: formatMoney(revenueAgg._sum.amountCents ?? 0),
    },
    dailyStreams,
    bestRank: bestRankRow._min.rank ?? null,
  })
}
