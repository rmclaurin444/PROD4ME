/**
 * Single source of truth for every tunable number in the recommendation
 * system. Nothing in lib/recommendations/** (or elsewhere) may hardcode a
 * weight, threshold, TTL, or page size — import the constant instead.
 */

/** How strong each engagement signal is. Keys must stay in sync with the
 *  Prisma `EngagementEventType` enum and the `EngagementEvent.type` column. */
export type EventTypeName =
  | 'PLAY_50'
  | 'PLAY_COMPLETE'
  | 'TAG_TAP'
  | 'LIKE'
  | 'SAVE'
  | 'FOLLOW_PRODUCER'
  | 'OFFER'
  | 'BUY'
  | 'COMMENT'
  | 'SKIP'

export const EVENT_WEIGHTS: Record<EventTypeName, number> = {
  PLAY_50: 1,
  PLAY_COMPLETE: 2,
  TAG_TAP: 2,
  LIKE: 3,
  SAVE: 4,
  FOLLOW_PRODUCER: 5,
  OFFER: 6,
  BUY: 6,
  COMMENT: 3,
  SKIP: -2,
}

export const ALL_EVENT_TYPES = Object.keys(EVENT_WEIGHTS) as EventTypeName[]

/** Time-decay and signal windows (in days). */
export const DECAY_HALF_LIFE_DAYS = 30
export const EVENT_WINDOW_DAYS = 90
export const SEEN_EXCLUSION_DAYS = 7

/** Embedding geometry. */
export const VECTOR_DIM = 256

/** Final score blend for feed ranking. Must the four keys total 1.0. */
export const SCORE_WEIGHTS = {
  similarity: 0.6,
  producer: 0.2,
  recency: 0.1,
  popularity: 0.1,
} as const

/** Producer affinity multiplier applied to the similarity term. */
export const FOLLOW_BONUS = 0.15

/** Feed shape: ranked slots first, then explore (unranked) slots. */
export const FEED_PAGE_SIZE = 10
export const FEED_RANKED_SLOTS = 8
export const FEED_EXPLORE_SLOTS = 2

/** Cold-start: below this many weighted events a user has no usable vector. */
export const COLD_START_MIN_EVENTS = 5

/** Recency score reaches 0 at this age (days). */
export const RECENCY_ZERO_DAYS = 60

/** Candidate pool size before ranking. */
export const CANDIDATE_LIMIT = 200

/** SKIP is logged when a beat has been visible for less than this long. */
export const SKIP_UNDER_MILLIS = 3000
