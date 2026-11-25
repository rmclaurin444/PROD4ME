import { Prisma } from '@prisma/client'
import { prisma } from '../prisma.ts'
import { LEADERBOARD_TOP_N, LEADERBOARD_WEIGHTS } from './constants.ts'

/**
 * Weekly scoring, written as SQL aggregations (one per shape — beats and
 * producers share the same CTE chain). Rules:
 *  - streams: STREAM events, once per user per beat per day (the events
 *    themselves are capped at one per 10 minutes server-side)
 *  - likes: distinct users with a LIKE event that still exists (unlikes
 *    delete it, so stale likes can't count) and was created before the
 *    week ended — NOT week-scoped: a like keeps earning while it exists
 *  - saves: distinct users with a SAVE event that week
 *  - comments / shares: distinct users that week
 *  - purchases: licenses created that week with a SUCCEEDED payment (10 pts);
 *    free claims (license without payment) count 2
 *  - excluded everywhere: the beat's own producer acting on their own beat,
 *    accounts younger than 24h at the moment of the event, and dev-* seeded
 *    accounts in production (they stay included in development so the demo
 *    data shows up on the leaderboard).
 */

export type LeaderboardBreakdown = {
  streams: number
  likes: number
  comments: number
  shares: number
  saves: number
  purchases: number
}

export type ScoredBeat = {
  beatId: string
  producerId: string
  score: number
  listeners: number
  breakdown: LeaderboardBreakdown
  createdAt: Date
}

export type ScoredProducer = {
  producerId: string
  score: number
  listeners: number
  breakdown: LeaderboardBreakdown
  createdAt: Date
}

export type WeekScore = {
  weekStart: Date
  excludeDev: boolean
  beats: ScoredBeat[]
  producers: ScoredProducer[]
}

const W = LEADERBOARD_WEIGHTS

function sharedCtes(weekStart: Date, weekEnd: Date, excludeDev: boolean) {
  return Prisma.sql`
    params AS (
      SELECT ${weekStart}::timestamptz AS week_start, ${weekEnd}::timestamptz AS week_end, ${excludeDev}::boolean AS exclude_dev
    ),
    eligible AS (
      -- week-scoped signals (streams, saves, comments, shares) + listeners
      SELECT e."beatId" AS beat_id, e."userId" AS user_id, e."type" AS type, e."createdAt" AS created_at
      FROM "EngagementEvent" e
      JOIN "User" u ON u.id = e."userId"
      JOIN "Beat" b ON b.id = e."beatId"
      CROSS JOIN params p
      WHERE e."createdAt" >= p.week_start AND e."createdAt" < p.week_end
        AND u."createdAt" <= e."createdAt" - interval '24 hours'
        AND (NOT p.exclude_dev OR u."email" NOT LIKE 'dev-%')
        AND b."producerId" <> e."userId"
    ),
    like_eligible AS (
      -- likes are NOT week-scoped: every LIKE event that still exists and was
      -- created before the week ended counts (unlikes delete the event)
      SELECT e."beatId" AS beat_id, e."userId" AS user_id
      FROM "EngagementEvent" e
      JOIN "User" u ON u.id = e."userId"
      JOIN "Beat" b ON b.id = e."beatId"
      CROSS JOIN params p
      WHERE e."type" = 'LIKE'
        AND e."createdAt" < p.week_end
        AND u."createdAt" <= e."createdAt" - interval '24 hours'
        AND (NOT p.exclude_dev OR u."email" NOT LIKE 'dev-%')
        AND b."producerId" <> e."userId"
    ),
    streams AS (
      -- one stream per user per beat per day (events themselves are capped
      -- at one per 10 minutes server-side)
      SELECT beat_id, COUNT(DISTINCT (user_id, date_trunc('day', created_at)))::int AS n
      FROM eligible WHERE type = 'STREAM' GROUP BY beat_id
    ),
    likes AS (
      SELECT beat_id, COUNT(DISTINCT user_id)::int AS n
      FROM like_eligible GROUP BY beat_id
    ),
    saves AS (
      SELECT beat_id, COUNT(DISTINCT user_id)::int AS n
      FROM eligible WHERE type = 'SAVE' GROUP BY beat_id
    ),
    comments AS (
      SELECT beat_id, COUNT(DISTINCT user_id)::int AS n
      FROM eligible WHERE type = 'COMMENT' GROUP BY beat_id
    ),
    shares AS (
      SELECT beat_id, COUNT(DISTINCT user_id)::int AS n
      FROM eligible WHERE type = 'SHARE' GROUP BY beat_id
    ),
    week_licenses AS (
      SELECT l."beatId" AS beat_id,
        COUNT(*) FILTER (WHERE l."paymentId" IS NOT NULL)::int AS paid,
        COUNT(*) FILTER (WHERE l."paymentId" IS NULL)::int AS free
      FROM "License" l
      JOIN "User" u ON u.id = l."artistId"
      CROSS JOIN params p
      WHERE l."createdAt" >= p.week_start AND l."createdAt" < p.week_end
        AND (l."paymentId" IS NULL OR EXISTS (
          SELECT 1 FROM "Payment" pay WHERE pay."id" = l."paymentId" AND pay."status" = 'SUCCEEDED'))
        AND u."createdAt" <= l."createdAt" - interval '24 hours'
        AND (NOT p.exclude_dev OR u."email" NOT LIKE 'dev-%')
        AND l."artistId" <> (SELECT "producerId" FROM "Beat" WHERE "id" = l."beatId")
      GROUP BY l."beatId"
    ),
    scored_beats AS (
      SELECT b.id AS beat_id, b."producerId", b."createdAt",
        COALESCE(s.n, 0) AS streams, COALESCE(lk.n, 0) AS likes,
        COALESCE(sv.n, 0) AS saves, COALESCE(cm.n, 0) AS comments,
        COALESCE(sh.n, 0) AS shares,
        COALESCE(wl.paid, 0) AS paid, COALESCE(wl.free, 0) AS free,
        (
          COALESCE(s.n, 0) * ${W.stream} + COALESCE(lk.n, 0) * ${W.like} +
          COALESCE(sv.n, 0) * ${W.save} + COALESCE(cm.n, 0) * ${W.comment} +
          COALESCE(sh.n, 0) * ${W.share} +
          COALESCE(wl.paid, 0) * ${W.purchase} + COALESCE(wl.free, 0) * ${W.freeClaim}
        )::float AS score
      FROM "Beat" b
      LEFT JOIN streams s ON s.beat_id = b.id
      LEFT JOIN likes lk ON lk.beat_id = b.id
      LEFT JOIN saves sv ON sv.beat_id = b.id
      LEFT JOIN comments cm ON cm.beat_id = b.id
      LEFT JOIN shares sh ON sh.beat_id = b.id
      LEFT JOIN week_licenses wl ON wl.beat_id = b.id
    )`
}

export async function scoreWeek(
  weekStart: Date,
  opts: { excludeDev?: boolean } = {}
): Promise<WeekScore> {
  const excludeDev = opts.excludeDev ?? process.env.NODE_ENV === 'production'
  const weekEnd = new Date(weekStart.getTime() + 7 * 24 * 60 * 60 * 1000)
  const base = sharedCtes(weekStart, weekEnd, excludeDev)

  const beatQuery = Prisma.sql`
    WITH ${base},
    beat_listeners AS (
      SELECT beat_id, COUNT(DISTINCT user_id)::int AS n FROM eligible GROUP BY beat_id
    )
    SELECT sb.beat_id, sb."producerId", sb.score, sb.streams, sb.likes, sb.saves, sb.comments, sb.shares,
           (sb.paid + sb.free) AS purchases, sb."createdAt",
           COALESCE(bl.n, 0)::int AS listeners
    FROM scored_beats sb
    LEFT JOIN beat_listeners bl ON bl.beat_id = sb.beat_id
    WHERE sb.score > 0
    ORDER BY sb.score DESC, COALESCE(bl.n, 0) DESC, sb."createdAt" ASC`

  const producerQuery = Prisma.sql`
    WITH ${base},
    producer_agg AS (
      SELECT b."producerId",
        SUM(sb.score)::float AS score,
        SUM(sb.streams)::int AS streams, SUM(sb.likes)::int AS likes,
        SUM(sb.saves)::int AS saves, SUM(sb.comments)::int AS comments,
        SUM(sb.shares)::int AS shares,
        (SUM(sb.paid) + SUM(sb.free))::int AS purchases,
        MIN(u."createdAt") AS "createdAt"
      FROM scored_beats sb
      JOIN "Beat" b ON b.id = sb.beat_id
      JOIN "User" u ON u.id = b."producerId"
      GROUP BY b."producerId"
    ),
    producer_listeners AS (
      SELECT b."producerId", COUNT(DISTINCT e.user_id)::int AS n
      FROM eligible e JOIN "Beat" b ON b.id = e.beat_id
      GROUP BY b."producerId"
    ),
    license_listeners AS (
      SELECT (SELECT "producerId" FROM "Beat" WHERE "id" = l."beatId") AS "producerId", l."artistId"
      FROM week_licenses wl
      JOIN "License" l ON l."beatId" = wl.beat_id
    )
    SELECT pa."producerId", pa.score, pa.streams, pa.likes, pa.saves, pa.comments, pa.shares, pa.purchases, pa."createdAt",
      (SELECT COUNT(DISTINCT user_id)::int FROM (
        SELECT e.user_id FROM eligible e JOIN "Beat" b ON b.id = e.beat_id WHERE b."producerId" = pa."producerId"
        UNION
        SELECT ll."artistId" FROM license_listeners ll WHERE ll."producerId" = pa."producerId"
      ) t) AS listeners
    FROM producer_agg pa
    WHERE pa.score > 0
    ORDER BY pa.score DESC,
             (SELECT COALESCE(MAX(n), 0) FROM producer_listeners pl WHERE pl."producerId" = pa."producerId") DESC,
             pa."createdAt" ASC`

  const [beatRows, producerRows] = await prisma.$transaction([
    prisma.$queryRaw<Array<{ beat_id: string; producerId: string; score: number; streams: number; likes: number; saves: number; comments: number; shares: number; purchases: number; createdAt: Date; listeners: number }>>(beatQuery),
    prisma.$queryRaw<Array<{ producerId: string; score: number; streams: number; likes: number; saves: number; comments: number; shares: number; purchases: number; createdAt: Date; listeners: number }>>(producerQuery),
  ])

  const beats: ScoredBeat[] = beatRows.map(row => ({
    beatId: row.beat_id,
    producerId: row.producerId,
    score: Number(row.score),
    listeners: Number(row.listeners),
    breakdown: {
      streams: Number(row.streams),
      likes: Number(row.likes),
      comments: Number(row.comments),
      shares: Number(row.shares),
      saves: Number(row.saves),
      purchases: Number(row.purchases),
    },
    createdAt: new Date(row.createdAt),
  }))

  const producers: ScoredProducer[] = producerRows.map(row => ({
    producerId: row.producerId,
    score: Number(row.score),
    listeners: Number(row.listeners),
    breakdown: {
      streams: Number(row.streams),
      likes: Number(row.likes),
      comments: Number(row.comments),
      shares: Number(row.shares),
      saves: Number(row.saves),
      purchases: Number(row.purchases),
    },
    createdAt: new Date(row.createdAt),
  }))

  return { weekStart, excludeDev, beats, producers }
}

/** Saves the previous week's top 50 beats + top 50 producers as immutable
 *  snapshots. No-ops when that week is already snapshotted. */
export async function snapshotPreviousWeek(
  now: Date = new Date(),
  opts: { excludeDev?: boolean } = {}
): Promise<{ saved: boolean; weekStart: Date }> {
  const { weekStartFor, prevWeekStart } = await import('./week.ts')
  const weekStart = prevWeekStart(weekStartFor(now))
  const excludeDev = opts.excludeDev ?? process.env.NODE_ENV === 'production'

  const existing = await prisma.leaderboardSnapshot.count({
    where: { weekStart, kind: 'BEAT' },
  })
  if (existing > 0) {
    return { saved: false, weekStart }
  }

  const scored = await scoreWeek(weekStart, { excludeDev })
  const beatRows = scored.beats.slice(0, LEADERBOARD_TOP_N).map((entry, index) => ({
    weekStart,
    kind: 'BEAT',
    rank: index + 1,
    beatId: entry.beatId,
    producerId: null,
    score: entry.score,
    breakdown: entry.breakdown,
  }))
  const producerRows = scored.producers.slice(0, LEADERBOARD_TOP_N).map((entry, index) => ({
    weekStart,
    kind: 'PRODUCER',
    rank: index + 1,
    beatId: null,
    producerId: entry.producerId,
    score: entry.score,
    breakdown: entry.breakdown,
  }))

  await prisma.leaderboardSnapshot.createMany({
    data: [...beatRows, ...producerRows],
    skipDuplicates: true,
  })

  return { saved: beatRows.length > 0 || producerRows.length > 0, weekStart }
}
