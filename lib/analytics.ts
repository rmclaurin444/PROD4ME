import { prisma } from './prisma.ts'

/**
 * Aggregations behind GET /api/dev/analytics (admin-only). Everything is a
 * read-only count/sum — no writes, no schema changes.
 *
 * `includeDev` toggles the `dev-*` seeded-account namespace (dev seeder
 * naming convention); by default those accounts are excluded so demo data
 * never hides real numbers.
 */

export type AnalyticsRange = '7d' | '30d' | 'all'

export type DailyPoint = { date: string; count: number }

export type AnalyticsResult = {
  range: AnalyticsRange
  includeDev: boolean
  users: { total: number; producers: number; artists: number; newInRange: number }
  activeUsers: number
  beats: { total: number; newInRange: number }
  engagement: { streams: number; completions: number; likes: number; comments: number; saves: number; shares: number }
  commerce: {
    offersMade: number
    offerAcceptanceRate: number | null
    purchases: number
    freeClaims: number
    revenueCents: number
  }
  series: { signups: DailyPoint[]; streams: DailyPoint[]; purchases: DailyPoint[] }
  topBeats: Array<{ id: string; title: string; producer: string; streams: number }>
  topProducers: Array<{ id: string; name: string; streams: number }>
}

const DAY_MS = 24 * 60 * 60 * 1000

export function parseRange(value: string | null): AnalyticsRange {
  return value === '7d' || value === '30d' || value === 'all' ? value : '7d'
}

function rangeStart(range: AnalyticsRange): Date | null {
  if (range === '7d') return new Date(Date.now() - 7 * DAY_MS)
  if (range === '30d') return new Date(Date.now() - 30 * DAY_MS)
  return null
}

/** User filter honoring the dev-* exclusion. */
function userFilter(includeDev: boolean) {
  return includeDev ? {} : { email: { not: { startsWith: 'dev-' } } }
}

export async function getAnalytics(
  range: AnalyticsRange,
  includeDev: boolean
): Promise<AnalyticsResult> {
  const start = rangeStart(range)
  const userWhere = userFilter(includeDev)

  const since = (col: 'createdAt') => (start ? { [col]: { gte: start } } : {})

  const [totalUsers, producers, artists, newUsers, activeUsers, totalBeats, newBeats] =
    await Promise.all([
      prisma.user.count({ where: userWhere }),
      prisma.user.count({ where: { ...userWhere, role: 'PRODUCER' } }),
      prisma.user.count({ where: { ...userWhere, role: 'ARTIST' } }),
      prisma.user.count({ where: { ...userWhere, ...since('createdAt') } }),
      // "active" = engaged (no login tracking exists in the app)
      prisma.engagementEvent.groupBy({
        by: ['userId'],
        where: { user: userWhere, ...(start ? { createdAt: { gte: start } } : {}) },
        _count: { _all: true },
      }),
      prisma.beat.count({ where: { producer: userWhere } }),
      prisma.beat.count({
        where: { producer: userWhere, ...(start ? { createdAt: { gte: start } } : {}) },
      }),
    ])

  const engagementRows = await prisma.engagementEvent.groupBy({
    by: ['type'],
    where: { user: userWhere, ...(start ? { createdAt: { gte: start } } : {}) },
    _count: { _all: true },
  })
  const countOf = (type: string) =>
    engagementRows.find(row => row.type === type)?._count._all ?? 0
  const engagement = {
    streams: countOf('PLAY_50'),
    completions: countOf('PLAY_COMPLETE'),
    likes: countOf('LIKE'),
    comments: countOf('COMMENT'),
    saves: countOf('SAVE'),
    shares: countOf('SHARE'),
  }

  const [offersMade, offersAccepted, purchases, freeClaims, revenueAgg] = await Promise.all([
    prisma.offer.count({ where: { artist: userWhere, ...(start ? { createdAt: { gte: start } } : {}) } }),
    // acceptance = offers that reached AWAITING_PAYMENT or PAID
    prisma.offer.count({
      where: {
        artist: userWhere,
        status: { in: ['AWAITING_PAYMENT', 'PAID'] },
        ...(start ? { createdAt: { gte: start } } : {}),
      },
    }),
    prisma.payment.count({
      where: { status: 'SUCCEEDED', artist: userWhere, ...(start ? { createdAt: { gte: start } } : {}) },
    }),
    prisma.license.count({
      where: { paymentId: null, artist: userWhere, ...(start ? { createdAt: { gte: start } } : {}) },
    }),
    prisma.payment.aggregate({
      where: { status: 'SUCCEEDED', artist: userWhere, ...(start ? { createdAt: { gte: start } } : {}) },
      _sum: { amountCents: true },
    }),
  ])

  const commerce = {
    offersMade,
    offerAcceptanceRate: offersMade > 0 ? offersAccepted / offersMade : null,
    purchases,
    freeClaims,
    revenueCents: revenueAgg._sum.amountCents ?? 0,
  }

  // ---- daily series (signups / streams / purchases) ----
  const signupsRows = await prisma.user.findMany({
    where: { ...userWhere, ...(start ? { createdAt: { gte: start } } : {}) },
    select: { createdAt: true },
  })
  const streamsRows = await prisma.engagementEvent.findMany({
    where: { type: 'PLAY_50', user: userWhere, ...(start ? { createdAt: { gte: start } } : {}) },
    select: { createdAt: true },
  })
  const purchaseRows = await prisma.payment.findMany({
    where: { status: 'SUCCEEDED', artist: userWhere, ...(start ? { createdAt: { gte: start } } : {}) },
    select: { createdAt: true },
  })

  const series = {
    signups: dailySeries(signupsRows.map(r => r.createdAt)),
    streams: dailySeries(streamsRows.map(r => r.createdAt)),
    purchases: dailySeries(purchaseRows.map(r => r.createdAt)),
  }

  // ---- top 10 ----
  const streamEvents = await prisma.engagementEvent.findMany({
    where: { type: 'PLAY_50', user: userWhere, ...(start ? { createdAt: { gte: start } } : {}) },
    select: { beatId: true },
  })
  const streamsByBeat = new Map<string, number>()
  for (const event of streamEvents) {
    streamsByBeat.set(event.beatId, (streamsByBeat.get(event.beatId) ?? 0) + 1)
  }
  const beatIds = [...streamsByBeat.keys()]
  const beatRows = beatIds.length
    ? await prisma.beat.findMany({
        where: { id: { in: beatIds }, producer: userWhere },
        select: { id: true, title: true, producer: { select: { id: true, name: true } } },
      })
    : []
  const topBeats = beatRows
    .map(beat => ({
      id: beat.id,
      title: beat.title,
      producer: beat.producer.name,
      streams: streamsByBeat.get(beat.id) ?? 0,
    }))
    .sort((a, b) => b.streams - a.streams)
    .slice(0, 10)

  const streamsByProducer = new Map<string, number>()
  for (const beat of beatRows) {
    const count = streamsByBeat.get(beat.id) ?? 0
    if (count > 0) {
      streamsByProducer.set(
        beat.producer.id,
        (streamsByProducer.get(beat.producer.id) ?? 0) + count
      )
    }
  }
  const producerIds = [...streamsByProducer.keys()]
  const producerRows = producerIds.length
    ? await prisma.user.findMany({
        where: { id: { in: producerIds }, ...userWhere },
        select: { id: true, name: true },
      })
    : []
  const topProducers = producerRows
    .map(producer => ({ id: producer.id, name: producer.name, streams: streamsByProducer.get(producer.id) ?? 0 }))
    .sort((a, b) => b.streams - a.streams)
    .slice(0, 10)

  return {
    range,
    includeDev,
    users: { total: totalUsers, producers, artists, newInRange: newUsers },
    activeUsers: activeUsers.length,
    beats: { total: totalBeats, newInRange: newBeats },
    engagement,
    commerce,
    series,
    topBeats,
    topProducers,
  }
}

/** Bucket timestamps into UTC calendar days; empty days stay absent. */
function dailySeries(dates: Date[]): DailyPoint[] {
  const buckets = new Map<string, number>()
  for (const date of dates) {
    const key = new Date(date).toISOString().slice(0, 10)
    buckets.set(key, (buckets.get(key) ?? 0) + 1)
  }
  return [...buckets.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .map(([date, count]) => ({ date, count }))
}
