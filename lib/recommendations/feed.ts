import { Prisma } from '@prisma/client'
import { prisma } from '../prisma.ts'
import { beatInclude, shapeBeat } from '../beats.ts'
import type { ShapedBeat } from '../beats.ts'
import {
  COLD_START_MIN_EVENTS,
  EVENT_WINDOW_DAYS,
  FEED_CURSOR_MAX_IDS,
  FEED_EXPLORE_SLOTS,
  FEED_PAGE_SIZE,
  FEED_RANKED_SLOTS,
  RECENCY_ZERO_DAYS,
  SEEN_EXCLUSION_DAYS,
  VECTOR_DIM,
} from './constants.ts'
import { buildContext, daysSince, rankCandidates, scoreBeat } from './scoring.ts'

const DAY_MS = 24 * 60 * 60 * 1000
const EPSILON = 1e-9

export class FeedTagNotFoundError extends Error {}

/**
 * Opaque cursor = base64url JSON { s: [beatIds delivered so far] }. Carrying
 * ids (not offsets) guarantees zero duplicate beats across pages of one
 * client session even when the rest of the pool reshuffles. Capped at the
 * most recent FEED_CURSOR_MAX_IDS ids when encoding — older beats drop off
 * the cursor but stay excluded by the 7-day engagement rule (they earned
 * STREAM or SKIP events when delivered).
 */
type CursorPayload = { s: string[] }

function encodeCursor(seen: string[]): string {
  const capped = seen.slice(-FEED_CURSOR_MAX_IDS)
  return Buffer.from(JSON.stringify({ s: capped } satisfies CursorPayload), 'utf8').toString('base64url')
}

function decodeCursor(cursor: string | null | undefined): string[] {
  if (!cursor) return []
  try {
    const parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as CursorPayload
    if (!Array.isArray(parsed.s)) return []
    return parsed.s.filter(id => typeof id === 'string' && /^[a-z0-9]+$/i.test(id))
  } catch {
    return []
  }
}

/** Exclusions shared by ranked, explore, and tag pools: own beats, sold
 *  exclusives, anything the user engaged with in the last SEEN_EXCLUSION_DAYS,
 *  plus any ids already delivered in this session (cursor). */
function exclusionsWhere(userId: string, excludedIds: string[], since: Date) {
  return {
    producerId: { not: userId },
    exclusiveSold: false,
    id: { notIn: excludedIds },
    events: {
      none: {
        userId,
        createdAt: { gte: since },
      },
    },
  } as const
}

/** cold-start score: popularity × recency (both unit-range). */
function popularityRecency(
  beat: { id: string; createdAt: Date | string },
  eventCountsPerBeat: Record<string, number>,
  maxEventCount: number,
): number {
  const popularity =
    maxEventCount > 0 ? (eventCountsPerBeat[beat.id] ?? 0) / maxEventCount : 0
  const age = daysSince(beat.createdAt)
  const recency = age >= RECENCY_ZERO_DAYS ? 0 : 1 - age / RECENCY_ZERO_DAYS
  return popularity * recency
}

async function eventCountsFor(beatIds: string[]): Promise<{
  counts: Record<string, number>
  max: number
}> {
  const counts: Record<string, number> = {}
  let max = 0
  if (beatIds.length > 0) {
    const grouped = await prisma.engagementEvent.groupBy({
      by: ['beatId'],
      where: {
        beatId: { in: beatIds },
        createdAt: { gte: new Date(Date.now() - EVENT_WINDOW_DAYS * DAY_MS) },
      },
      _count: { _all: true },
    })
    for (const group of grouped) {
      counts[group.beatId] = group._count._all
      max = Math.max(max, group._count._all)
    }
  }
  return { counts, max }
}

async function fetchBeatRows(ids: string[]) {
  const rows = await prisma.beat.findMany({
    where: { id: { in: ids } },
    include: beatInclude,
  })
  return new Map(rows.map(row => [row.id, row]))
}

function safeIds(ids: string[]): string[] {
  return ids.filter(id => /^[a-z0-9]+$/i.test(id))
}

function sqlIdList(ids: string[]) {
  return Prisma.join(safeIds(ids).map(id => Prisma.sql`${id}`))
}

/** Slots with real weight in the user's taste vector — "zero affinity" is
 *  defined against these (calls the vector through ::text, per pgvector). */
async function getNonZeroTasteSlots(userId: string): Promise<number[]> {
  const rows = await prisma.$queryRaw<Array<{ v: string | null }>>`
    SELECT "tasteVector"::text AS v FROM "User" WHERE id = ${userId}`
  const text = rows[0]?.v
  if (!text) return []
  const values = text.replace('[', '').replace(']', '').split(',').map(Number)
  const slots: number[] = []
  for (let i = 0; i < values.length; i++) {
    if (Math.abs(values[i] ?? 0) > EPSILON) slots.push(i)
  }
  return slots
}

/** Random explore beats: every tag on the beat must sit outside the user's
 *  (non-zero) taste slots; same exclusions; session-seen ids excluded. */
async function exploreBeats(userId: string, excludedIds: string[], limit: number): Promise<string[]> {
  if (limit <= 0) return []
  const since = new Date(Date.now() - SEEN_EXCLUSION_DAYS * DAY_MS)
  const nonZeroSlots = await getNonZeroTasteSlots(userId)

  const seenIds = safeIds([...excludedIds])
  // slot indexes are validated integers before touching SQL text; renders as
  // IN (0,7,8,...) — note NOT a row-value record: the raw fragment must NOT
  // add its own parentheses around a plain CSV list
  const slotList = nonZeroSlots.filter(n => Number.isInteger(n) && n >= 0 && n < VECTOR_DIM)
  const slotCsv = slotList.join(',')

  const tagGate =
    slotList.length > 0
      ? Prisma.sql`AND NOT EXISTS (
          SELECT 1 FROM "_BeatToTag" j JOIN "Tag" t ON t.id = j."B"
          WHERE j."A" = b.id AND t."vectorIndex" IN (${Prisma.raw(slotCsv)}))`
      : Prisma.empty

  const rows = await prisma.$queryRaw<Array<{ id: string }>>`
    SELECT b.id
    FROM "Beat" b
    WHERE b."tagVector" IS NOT NULL
      AND b."producerId" <> ${userId}
      AND NOT b."exclusiveSold"
      AND b.id NOT IN (
        SELECT e."beatId" FROM "EngagementEvent" e
        WHERE e."userId" = ${userId} AND e."createdAt" >= ${since}
      )
      ${seenIds.length > 0 ? Prisma.sql`AND b.id NOT IN (${sqlIdList(seenIds)})` : Prisma.empty}
      ${tagGate}
    ORDER BY random()
    LIMIT ${limit}`

  return rows.map(row => row.id)
}

/** Weighted random sample without replacement — higher weight = more likely.
 *  Zero-weight items can't be drawn, so a floor keeps everything pickable. */
function weightedSample<T>(items: Array<{ item: T; weight: number }>, count: number): T[] {
  const pool = items.map(entry => ({ ...entry, weight: Math.max(entry.weight, 1e-6) }))
  const out: T[] = []
  while (out.length < count && pool.length > 0) {
    const total = pool.reduce((sum, entry) => sum + entry.weight, 0)
    let roll = Math.random() * total
    let pickedIndex = pool.length - 1
    for (let i = 0; i < pool.length; i++) {
      roll -= pool[i]!.weight
      if (roll <= 0) {
        pickedIndex = i
        break
      }
    }
    out.push(pool[pickedIndex]!.item)
    pool.splice(pickedIndex, 1)
  }
  return out
}

export type FeedPageResult = {
  beats: ShapedBeat[]
  nextCursor: string | null
  coldStart: boolean
  /** true when the page came from the fallback tiers (nothing new was left,
   *  so the user is being shown beats they've already seen this session) */
  caughtUp: boolean
}

/**
 * Following feed (Prompt 13): the newest beats from producers the user
 * follows, chronologically — NO recommendation ranking, NO 7-day "already
 * engaged" exclusion (users always see what the people they follow posted,
 * including beats they engaged with). Own beats and sold exclusives are
 * excluded, matching the For You feed. Keyset pagination on (createdAt, id)
 * with its own cursor format (never reuse the For You cursor of beat IDs).
 * Beats newer than `seenAt` carry isNew: true.
 */
export async function getFollowingPage(
  userId: string,
  opts: { cursor?: string | null; seenAt?: Date | null } = {}
): Promise<FeedPageResult> {
  // keyset cursor: base64url JSON { k: [createdAtISO, id] }
  let keyset: { at: Date; id: string } | null = null
  if (opts.cursor) {
    try {
      const parsed = JSON.parse(Buffer.from(opts.cursor, 'base64url').toString('utf8')) as {
        k?: [string, string]
      }
      if (Array.isArray(parsed.k) && parsed.k.length === 2 && typeof parsed.k[0] === 'string' && typeof parsed.k[1] === 'string') {
        const at = new Date(parsed.k[0])
        if (!Number.isNaN(at.getTime()) && /^[a-z0-9]+$/i.test(parsed.k[1])) {
          keyset = { at, id: parsed.k[1] }
        }
      }
    } catch {
      keyset = null
    }
  }

  const followed = await prisma.follow.findMany({
    where: { followerId: userId },
    select: { followingId: true },
  })
  const followedIds = followed.map(row => row.followingId)

  if (followedIds.length === 0) {
    return { beats: [], nextCursor: null, coldStart: false, caughtUp: false }
  }

  const rows = await prisma.beat.findMany({
    where: {
      producerId: { in: followedIds },
      exclusiveSold: false,
      ...(keyset
        ? {
            OR: [
              { createdAt: { lt: keyset.at } },
              { createdAt: keyset.at, id: { lt: keyset.id } },
            ],
          }
        : {}),
    },
    include: beatInclude,
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: FEED_PAGE_SIZE,
  })

  if (rows.length === 0) {
    return { beats: [], nextCursor: null, coldStart: false, caughtUp: false }
  }

  const seenAt = opts.seenAt ?? null
  const beats: ShapedBeat[] = []
  for (const row of rows) {
    const shaped = await shapeBeat(row)
    // never opened the tab → everything is new
    if (seenAt === null || row.createdAt > seenAt) shaped.isNew = true
    beats.push(shaped)
  }

  const last = rows[rows.length - 1]!
  const hasMore = rows.length >= FEED_PAGE_SIZE
  return {
    beats,
    nextCursor: hasMore
      ? Buffer.from(JSON.stringify({ k: [last.createdAt.toISOString(), last.id] })).toString('base64url')
      : null,
    coldStart: false,
    caughtUp: false,
  }
}

/**
 * One page of the personalized feed.
 *
 * - personalized: FEED_RANKED_SLOTS via rankCandidates + random explore beats
 *   (tags with zero affinity only) until FEED_PAGE_SIZE.
 * - cold start (fewer than COLD_START_MIN_EVENTS events): ranked slots are
 *   populated by popularity × recency instead of similarity; switches to full
 *   scoring automatically once the threshold is crossed.
 * - refresh: instead of the strict top slots, the top 3× FEED_PAGE_SIZE
 *   candidates are sampled with a weighted random draw (higher score = more
 *   likely) so each refresh feels different. Normal ordering is untouched.
 * - tag mode:?tag=<name> — tag-scoped beats only, no explore slots, ranked by
 *   the same scoring (popularity × recency while cold). Throws
 *   FeedTagNotFoundError when the tag does not exist (route maps to 404).
 *
 * Cursor pagination dedupes beats across pages of one session (capped at the
 * most recent FEED_CURSOR_MAX_IDS ids). caughtUp=true marks fallback pages
 * where nothing new was left and previously-seen beats are being replayed.
 */
export async function getFeedPage(
  userId: string,
  opts: { cursor?: string | null; tag?: string | null; refresh?: boolean } = {},
): Promise<FeedPageResult> {
  const seen = decodeCursor(opts.cursor)
  const since = new Date(Date.now() - SEEN_EXCLUSION_DAYS * DAY_MS)

  // ---------------- tag mode ----------------
  if (opts.tag) {
    const tagName = opts.tag.trim().toLowerCase()
    const tag = await prisma.tag.findUnique({ where: { name: tagName } })
    if (!tag) throw new FeedTagNotFoundError('Tag not found')

    const rows = await prisma.beat.findMany({
      where: {
        tags: { some: { id: tag.id } },
        ...exclusionsWhere(userId, seen, since),
      },
      include: beatInclude,
    })

    if (rows.length === 0) {
      return { beats: [], nextCursor: null, coldStart: false, caughtUp: false }
    }

    const eventCount = await prisma.engagementEvent.count({ where: { userId } })
    const coldStart = eventCount < COLD_START_MIN_EVENTS

    if (coldStart) {
      const { counts, max } = await eventCountsFor(rows.map(row => row.id))
      rows.sort(
        (a, b) =>
          popularityRecency(b, counts, max) - popularityRecency(a, counts, max) ||
          +new Date(b.createdAt) - +new Date(a.createdAt),
      )
    } else {
      const ids = rows.map(row => row.id)
      const simRows = await prisma.$queryRaw<Array<{ id: string; sim: number | null }>>`
        SELECT b.id, 1 - (b."tagVector" <=> u."tasteVector") AS sim
        FROM "Beat" b CROSS JOIN "User" u
        WHERE u.id = ${userId} AND u."tasteVector" IS NOT NULL
          AND b.id IN (${sqlIdList(ids)})`
      const simMap = new Map(simRows.map(row => [row.id, Number(row.sim)]))

      const candidates = rows.map(row => ({
        beatId: row.id,
        similarity: simMap.get(row.id) ?? 0,
      }))
      const context = await buildContext(userId, candidates, [])
      const scored = rows
        .map(row => ({
          id: row.id,
          score: scoreBeat(userId, row, simMap.get(row.id) ?? 0, context),
        }))
        .sort((a, b) => b.score - a.score)
      const orderMap = new Map(scored.map((entry, index) => [entry.id, index]))
      rows.sort((a, b) => orderMap.get(a.id)! - orderMap.get(b.id)!)
    }

    const ids = rows.map(row => row.id)
    const hasMore = ids.length >= FEED_PAGE_SIZE
    return {
      beats: await Promise.all(rows.map(shapeBeat)),
      nextCursor: hasMore ? encodeCursor([...seen, ...ids]) : null,
      coldStart,
      caughtUp: false,
    }
  }

  // ---------------- personalized mode ----------------
  const eventCount = await prisma.engagementEvent.count({ where: { userId } })
  const coldStart = eventCount < COLD_START_MIN_EVENTS

  const rankedIds: string[] = []

  if (coldStart) {
    // popularity × recency over the entire eligible pool; a refresh samples
    // the top 3× FEED_PAGE_SIZE pool with a weighted draw so it feels fresh
    const pool = await prisma.beat.findMany({
      where: exclusionsWhere(userId, seen, since),
      select: { id: true, createdAt: true, producerId: true },
    })
    const { counts, max } = await eventCountsFor(pool.map(beat => beat.id))
    const scoredPool = pool
      .map(beat => ({ id: beat.id, value: popularityRecency(beat, counts, max) }))
      .sort((a, b) => b.value - a.value)
      .slice(0, opts.refresh ? 3 * FEED_PAGE_SIZE : FEED_RANKED_SLOTS)
    const picked = opts.refresh
      ? weightedSample(
          scoredPool.map(item => ({ item, weight: item.value })),
          FEED_RANKED_SLOTS,
        )
      : scoredPool
    rankedIds.push(...picked.map(item => item.id))
  } else {
    const ranked = await rankCandidates(userId, { excludeBeatIds: seen })
    // a refresh samples the top 3× FEED_PAGE_SIZE ranked candidates with a
    // weighted random draw (higher score = more likely) instead of the strict
    // top results — light randomness only when asked for
    const pool = ranked.slice(0, 3 * FEED_PAGE_SIZE)
    const picked = (
      opts.refresh
        ? weightedSample(
            pool.map(item => ({ item, weight: Math.max(item.score, 1e-6) })),
            FEED_RANKED_SLOTS,
          )
        : pool.slice(0, FEED_RANKED_SLOTS)
    ).map(item => ({ item }))
    for (const item of picked) {
      rankedIds.push(item.item.beat.id)
    }
  }

  // explore fills the page remainder (2 slots when the pool allows, matching
  // the spec; more when a small DB can't fill ranked slots)
  const remaining = FEED_PAGE_SIZE - rankedIds.length
  const exploreCount = remaining >= FEED_EXPLORE_SLOTS ? FEED_EXPLORE_SLOTS : remaining
  const exploreIds = await exploreBeats(userId, [...seen, ...rankedIds], exploreCount)
  let topUp: string[] = []
  if (rankedIds.length + exploreIds.length < FEED_PAGE_SIZE) {
    topUp = await exploreBeats(
      userId,
      [...seen, ...rankedIds, ...exploreIds],
      FEED_PAGE_SIZE - rankedIds.length - exploreIds.length,
    )
  }

  const pageIds = [...rankedIds, ...exploreIds, ...topUp]
  if (pageIds.length === 0) {
    return { beats: [], nextCursor: null, coldStart, caughtUp: false }
  }

  const rowsById = await fetchBeatRows(pageIds)
  const beats: ShapedBeat[] = []
  for (const id of pageIds) {
    const row = rowsById.get(id)
    if (row) beats.push(await shapeBeat(row))
  }

  // No beats loaded at all — but the DB has beats? The strict rules (7-day
  // seen-exclusion + zero-affinity explore) can empty out a small feed for a
  // user who recently engaged with everything. Fallback tier: relax the seen
  // rule and the affinity gate (own beats and sold exclusives stay out),
  // ranked by popularity × recency. A feed must not go blank while unowned,
  // unsold beats exist. Marked caughtUp so the client can say so.
  if (beats.length === 0) {
    const fallbackRows = await prisma.beat.findMany({
      where: { producerId: { not: userId }, exclusiveSold: false, id: { notIn: seen } },
      include: beatInclude,
      orderBy: { createdAt: 'desc' },
      take: FEED_PAGE_SIZE,
    })
    if (fallbackRows.length === 0) {
      // last resort: the user owns every beat on the platform — show their
      // library rather than a blank page (sold exclusives still excluded)
      fallbackRows.push(
        ...(await prisma.beat.findMany({
          where: { exclusiveSold: false },
          include: beatInclude,
          orderBy: { createdAt: 'desc' },
          take: FEED_PAGE_SIZE,
        })),
      )
    }
    if (fallbackRows.length > 0) {
      const { counts, max } = await eventCountsFor(fallbackRows.map(row => row.id))
      fallbackRows.sort(
        (a, b) =>
          popularityRecency(b, counts, max) - popularityRecency(a, counts, max) ||
          +new Date(b.createdAt) - +new Date(a.createdAt),
      )
      const fallbackBeats = await Promise.all(fallbackRows.map(shapeBeat))
      return { beats: fallbackBeats, nextCursor: null, coldStart, caughtUp: true }
    }
  }

  const hasMore = pageIds.length >= FEED_PAGE_SIZE
  return {
    beats,
    nextCursor: hasMore && beats.length >= FEED_PAGE_SIZE
      ? encodeCursor([...seen, ...beats.map(b => b.id)])
      : null,
    coldStart,
    caughtUp: false,
  }
}
