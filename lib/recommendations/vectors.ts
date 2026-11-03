import { prisma } from '../prisma.ts'
import {
  DECAY_HALF_LIFE_DAYS,
  EVENT_WINDOW_DAYS,
  EVENT_WEIGHTS,
  VECTOR_DIM,
  type EventTypeName,
} from './constants.ts'

/**
 * Multi-hot tag vectors (beats) and decaying weighted taste vectors (users),
 * stored in pgvector columns. Prisma cannot read/write `Unsupported` columns,
 * so ALL vector persistence here goes through raw SQL with a `::vector` cast
 * on a bracketed literal.
 *
 * Conventions:
 * - Beat vectors: L2-normalized multi-hot of the beat's tag slots.
 * - Taste vectors: L2-normalized, decaying sum of engagement weights applied
 *   to the UNNORMALIZED multi-hot vectors of engaged beats (per task spec),
 *   so repeated tag exposures accumulate rather than canceling out.
 * - A zero sum STORES NULL (nothing to recommend against yet).
 */

const DAY_MS = 24 * 60 * 60 * 1000
const EPSILON = 1e-9

export function vectorToString(vec: number[]): string {
  return `[${vec.map(v => v.toFixed(6)).join(',')}]`
}

function l2Normalize(vec: number[]): number[] | null {
  let sum = 0
  for (const v of vec) sum += v * v
  const norm = Math.sqrt(sum)
  if (norm < EPSILON) return null
  return vec.map(v => v / norm)
}

async function storeBeatVector(beatId: string, vector: number[] | null): Promise<void> {
  if (vector === null) {
    await prisma.$executeRaw`UPDATE "Beat" SET "tagVector" = NULL WHERE id = ${beatId}`
    return
  }
  await prisma.$executeRaw`UPDATE "Beat" SET "tagVector" = ${vectorToString(vector)}::vector WHERE id = ${beatId}`
}

/** Multi-hot vector over the beat's tag slots (slots < 0 or >= VECTOR_DIM
 *  are treated like null slots — skipped). Returns null when the beat has no
 *  usable slots at all (then its stored vector is cleared). */
export function buildMultiHot(vectorIndexes: Array<number | null>): number[] | null {
  const vec = new Array<number>(VECTOR_DIM).fill(0)
  for (const index of vectorIndexes) {
    if (index === null || index < 0 || index >= VECTOR_DIM) continue
    vec[index] = 1
  }
  return l2Normalize(vec)
}

/** Rebuild and store a beat's tagVector from its current tags. */
export async function rebuildBeatVector(beatId: string): Promise<void> {
  const beat = await prisma.beat.findUnique({
    where: { id: beatId },
    select: { tags: { select: { vectorIndex: true } } },
  })
  if (!beat) return
  const normalized = buildMultiHot(beat.tags.map(tag => tag.vectorIndex))
  await storeBeatVector(beatId, normalized)
}

/** Rebuild and store a user's tasteVector from their engagement events over
 *  the last EVENT_WINDOW_DAYS: sum of EVENT_WEIGHTS[type] × 0.5^(daysSince /
 *  DECAY_HALF_LIFE_DAYS) on each engaged beat's UNNORMALIZED multi-hot vector
 *  (SKIP weights subtract since they are negative). L2-normalizes the sum;
 *  a zero sum stores NULL. */
export async function rebuildUserVector(userId: string): Promise<void> {
  const windowStart = new Date(Date.now() - EVENT_WINDOW_DAYS * DAY_MS)
  const events = await prisma.engagementEvent.findMany({
    where: { userId, createdAt: { gte: windowStart } },
    select: {
      type: true,
      createdAt: true,
      beat: { select: { tags: { select: { vectorIndex: true } } } },
    },
  })

  const sum = new Array<number>(VECTOR_DIM).fill(0)
  const nowMs = Date.now()

  for (const event of events) {
    const weight = EVENT_WEIGHTS[event.type as EventTypeName]
    if (weight === undefined) continue

    const daysSince = Math.max((nowMs - event.createdAt.getTime()) / DAY_MS, 0)
    const decay = Math.pow(0.5, daysSince / DECAY_HALF_LIFE_DAYS)
    const contribution = weight * decay

    for (const tag of event.beat.tags) {
      const index = tag.vectorIndex
      if (index === null || index < 0 || index >= VECTOR_DIM) continue
      // multi-hot contributions FROM THE UNNORMALIZED 0/1 vector
      sum[index] += contribution
    }
  }

  const normalized = l2Normalize(sum)
  if (normalized === null) {
    await prisma.$executeRaw`UPDATE "User" SET "tasteVector" = NULL WHERE id = ${userId}`
    return
  }

  await prisma.$executeRaw`UPDATE "User" SET "tasteVector" = ${vectorToString(normalized)}::vector WHERE id = ${userId}`
}
