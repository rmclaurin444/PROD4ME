import { Prisma } from '@prisma/client'
import { prisma } from '../prisma.ts'
import { CANDIDATE_LIMIT, DECAY_HALF_LIFE_DAYS, EVENT_WINDOW_DAYS, EVENT_WEIGHTS, FOLLOW_BONUS, RECENCY_ZERO_DAYS, SCORE_WEIGHTS, SEEN_EXCLUSION_DAYS, type EventTypeName } from './constants.ts'

export type Candidate = { beatId: string; similarity: number }

function safeIds(ids: string[]): string[] {
  return ids.filter(id => /^[a-z0-9]+$/i.test(id))
}

const DAY_MS = 24 * 60 * 60 * 1000

/**
 * Candidate retrieval and scorer for the personalized feed.
 *
 * Vector geometry stays in raw SQL (pgvector reads only via $queryRaw —
 * Prisma cannot consume `Unsupported` columns); numbers come only from
 * ./constants.ts.
 */

/** Beat data needed scoring + a future feed mapping. */
export type RankedBeat = {
  similarity: number
  score: number
  beat: {
    id: string
    title: string
    producerId: string
    producerName: string
    producerAvatar: string | null
    tags: string[]
    bpm: number | null
    musicalKey: string | null
    price: number
    exclusivePriceCents: number | null
    exclusiveSold: boolean
    licenseCount: number
    plays: number
    likes: number
    saves: number
    shares: number
    comments: number
    createdAt: Date
  }
}

/** Precomputed, per-candidate-set aggregates for beat scoring. */
export type ScoreContext = {
  /** raw decayed weighted-event sums per producer (candidate-set producers) */
  producerAffinities: Record<string, number>
  maxProducerAffinity: number
  /** total event counts (window days) per candidate beat */
  eventCountsPerBeat: Record<string, number>
  maxEventCount: number
  /** producers the user follows (passed in; follow persistence is planned) */
  followedProducerIds: string[]
}

function clampUnit(value: number): number {
  return Math.min(Math.max(value, 0), 1)
}

export function daysSince(date: Date | string): number {
  return Math.max((Date.now() - new Date(date).getTime()) / DAY_MS, 0)
}

function decayWeight(event: { type: string | EventTypeName; createdAt: Date | string }): number {
  const weight = EVENT_WEIGHTS[event.type as EventTypeName]
  if (weight === undefined) return 0
  return weight * Math.pow(0.5, daysSince(event.createdAt) / DECAY_HALF_LIFE_DAYS)
}

/**
 * Top CANDIDATE_LIMIT beats by cosine similarity to the user's taste vector.
 * Applied exclusions (in SQL):
 *  - the user's own beats
 *  - beats the user had ANY event on within SEEN_EXCLUSION_DAYS
 *  - exclusively-licensed beats that are sold
 * Returns [] when the user has no tasteVector (cold start).
 */
export async function getCandidates(
  userId: string,
  options: { excludeBeatIds?: string[] } = {},
): Promise<Candidate[]> {
  const tasteRows = await prisma.$queryRaw<Array<{ v: string | null }>>`
    SELECT "tasteVector"::text AS v FROM "User" WHERE id = ${userId}`
  const taste = tasteRows[0]?.v ?? null
  if (!taste) return []

  const seenSince = new Date(Date.now() - SEEN_EXCLUSION_DAYS * DAY_MS)
  // session-level dedupe (pagination); validated cuid chars, inlined safely
  const cursorExcluded = safeIds(options.excludeBeatIds ?? [])

  const rows = await prisma.$queryRaw<Array<{ id: string; sim: number }>>`
    SELECT b.id,
           1 - (b."tagVector" <=> ${taste}::vector) AS sim
    FROM "Beat" b
    WHERE b."tagVector" IS NOT NULL
      AND b."producerId" <> ${userId}
      AND NOT b."exclusiveSold"
      AND b.id NOT IN (
        SELECT e."beatId"
        FROM "EngagementEvent" e
        WHERE e."userId" = ${userId} AND e."createdAt" >= ${seenSince}
      )
      ${cursorExcluded.length > 0 ? Prisma.sql`AND b.id NOT IN (${Prisma.join(cursorExcluded.map(id => Prisma.sql`${id}`))})` : Prisma.empty}
    ORDER BY sim DESC
    LIMIT ${CANDIDATE_LIMIT}`

  return rows.map(row => ({ beatId: row.id, similarity: Number(row.sim) }))
}

/**
 * score = similarity·w + producerAffinity·w + recency·w + popularity·w,
 * each component unit-range; FOLLOW_BONUS added for followed producers and
 * the final score capped at 1.0.
 */
export function scoreBeat(
  userId: string,
  beat: { id: string; producerId: string; createdAt: Date | string },
  similarity: number,
  context: ScoreContext,
): number {
  const affinitySum = context.producerAffinities[beat.producerId] ?? 0
  const producerAffinity =
    context.maxProducerAffinity > 0 ? affinitySum / context.maxProducerAffinity : 0

  const age = daysSince(beat.createdAt)
  const recency = age >= RECENCY_ZERO_DAYS ? 0 : 1 - age / RECENCY_ZERO_DAYS

  const popularity =
    context.maxEventCount > 0
      ? (context.eventCountsPerBeat[beat.id] ?? 0) / context.maxEventCount
      : 0

  let score =
    SCORE_WEIGHTS.similarity * clampUnit(similarity) +
    SCORE_WEIGHTS.producer * producerAffinity +
    SCORE_WEIGHTS.recency * recency +
    SCORE_WEIGHTS.popularity * popularity

  if (context.followedProducerIds.includes(beat.producerId)) {
    score += FOLLOW_BONUS
  }

  return Math.min(score, 1)
}

/**
 * Computes the shared ScoreContext for a candidate set:
 *  - producer affinity: decayed weighted event sums on a producer's beats,
 *    normalized by the max across the candidate set (0 when max is 0)
 *  - popularity: engagement-event count per candidate beat over the window,
 *    normalized by the max in the candidate set
 */
export async function buildContext(
  userId: string,
  candidates: Candidate[],
  followedProducerIds: string[] = [],
): Promise<ScoreContext> {
  const beatIds = candidates.map(candidate => candidate.beatId)
  const windowStart = new Date(Date.now() - EVENT_WINDOW_DAYS * DAY_MS)

  const events = await prisma.engagementEvent.findMany({
    where: { userId, createdAt: { gte: windowStart } },
    select: { type: true, createdAt: true, beat: { select: { producerId: true } } },
  })

  const producerAffinities: Record<string, number> = {}
  for (const event of events) {
    const producerId = event.beat?.producerId
    if (!producerId) continue
    producerAffinities[producerId] =
      (producerAffinities[producerId] ?? 0) + decayWeight(event)
  }

  const maxProducerAffinity = Math.max(0, ...Object.values(producerAffinities))

  const eventCountsPerBeat: Record<string, number> = {}
  if (beatIds.length > 0) {
    const grouped = await prisma.engagementEvent.groupBy({
      by: ['beatId'],
      where: { beatId: { in: beatIds }, createdAt: { gte: windowStart } },
      _count: { _all: true },
    })
    for (const group of grouped) {
      eventCountsPerBeat[group.beatId] = group._count._all
    }
  }

  const maxEventCount = Math.max(0, ...Object.values(eventCountsPerBeat))

  return {
    producerAffinities,
    maxProducerAffinity,
    eventCountsPerBeat,
    maxEventCount,
    followedProducerIds,
  }
}

/**
 * Rank the candidate set: download beats for the ids (preserving candidate
 * similarity order for ties) and re-sort by final score descending.
 */
export async function rankCandidates(
  userId: string,
  options: { followedProducerIds?: string[]; excludeBeatIds?: string[] } = {},
): Promise<RankedBeat[]> {
  const candidates = await getCandidates(userId, { excludeBeatIds: options.excludeBeatIds })
  if (candidates.length === 0) return []

  const beats = await prisma.beat.findMany({
    where: { id: { in: candidates.map(candidate => candidate.beatId) } },
    select: {
      id: true,
      title: true,
      producerId: true,
      createdAt: true,
      bpm: true,
      musicalKey: true,
      price: true,
      exclusivePriceCents: true,
      exclusiveSold: true,
      plays: true,
      likes: true,
      saves: true,
      shares: true,
      comments: true,
      tags: { select: { name: true } },
      producer: { select: { name: true, avatar: true } },
      _count: { select: { licenses: true } },
    },
  })
  const byId = new Map(beats.map(beat => [beat.id, beat]))

  const context = await buildContext(userId, candidates, options.followedProducerIds ?? [])

  /** tie-order: input similarity order (potentially with tied similarity keys like createdAt) */
  const tieOrder = new Map(candidates.map((candidate, index) => [candidate.beatId, index]))

  const scored: RankedBeat[] = []
  for (const candidate of candidates) {
    const beat = byId.get(candidate.beatId)
    if (!beat) continue
    scored.push({
      similarity: candidate.similarity,
      score: scoreBeat(userId, beat, candidate.similarity, context),
      beat: {
        id: beat.id,
        title: beat.title,
        producerId: beat.producerId,
        producerName: beat.producer?.name ?? '',
        producerAvatar: beat.producer?.avatar ?? null,
        tags: beat.tags.map(tag => tag.name),
        bpm: beat.bpm,
        musicalKey: beat.musicalKey,
        price: beat.price,
        exclusivePriceCents: beat.exclusivePriceCents,
        exclusiveSold: beat.exclusiveSold,
        licenseCount: beat._count.licenses,
        plays: beat.plays,
        likes: beat.likes,
        saves: beat.saves,
        shares: beat.shares,
        comments: beat.comments,
        createdAt: beat.createdAt,
      },
    })
  }

  scored.sort(
    (a, b) =>
      b.score - a.score ||
      b.similarity - a.similarity ||
      (tieOrder.get(a.beat.id)! - tieOrder.get(b.beat.id)!)
  )
  return scored
}
